// POST /api/deploy
//
// Endpoint appele par les workflows GitHub Actions avec un token OIDC en
// Authorization: Bearer. Le token est verifie contre le JWKS GitHub, puis
// les claims sont compares aux Policy en DB. Si une policy match et que
// l'environnement cible a un serveur configure, retourne le bundle de
// deploiement (secrets + creds SSH + path).
//
// Securite :
//   - Aucune session NextAuth ; pas de cookie. Auth = JWT GitHub uniquement.
//   - Rate-limit IP : 30 req / min (les workflows tournent rarement, et la
//     verification JWKS coute ~10ms — ce plafond protege contre les bursts
//     accidentels sans gener un usage normal).
//   - Validation stricte : repo + workflow + branch + project + env doivent
//     tous matcher une Policy unique. Pas de wildcard.
//   - Audit `DEPLOY_AUTHORIZED` / `DEPLOY_DENIED` sur tous les chemins.

import { NextResponse } from "next/server";
// Multi-tenant : on résout la cible via admin.policies (qui a tenant_slug +
// project_id + environment_id), puis on switch sur le PrismaClient du tenant
// pour décrypter les secrets et la clé SSH.
import { adminPrisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { decrypt } from "@/lib/crypto";
import { logAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { extractBearer, verifyGithubOidcToken } from "@/lib/oidc";
import { defaultDeployPath, readJson } from "@/lib/api";
import { isValidClientSlug } from "@/lib/validation";

// Force Node runtime : jose, node:crypto, prisma — pas Edge.
export const runtime = "nodejs";

const RATE_LIMIT = { max: 30, windowMs: 60_000 };

export async function POST(req: Request) {
  const limited = rateLimit(req, "deploy", RATE_LIMIT);
  if (limited) return limited;

  const token = extractBearer(req);

  const verified = await verifyGithubOidcToken(token);
  if (!verified.ok) {
    // On n'audit pas les missing_token / wrong_audience individuellement
    // (probes / scans), mais on logge les autres echecs avec le minimum
    // de metadata pour aider au diagnostic.
    if (
      verified.reason === "missing_token" ||
      verified.reason === "wrong_audience" ||
      verified.reason === "wrong_issuer"
    ) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    logAction({
      action: "DEPLOY_DENIED",
      actor: { kind: "anonymous" },
      metadata: { reason: verified.reason },
      req,
    });
    if (verified.reason === "expired") {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repository, workflowFile, branch } = verified.claims;

  const body = (await readJson(req)) as
    | { project?: string; environment?: string }
    | null;
  const projectSlug = String(body?.project ?? "").trim();
  const envName = String(body?.environment ?? "").trim().toLowerCase();
  if (!projectSlug || !envName) {
    logAction({
      action: "DEPLOY_DENIED",
      actor: { kind: "anonymous" },
      metadata: {
        reason: "missing_body",
        repository,
        workflow: workflowFile,
        branch,
      },
      req,
    });
    return NextResponse.json(
      { error: "project and environment are required in body" },
      { status: 400 },
    );
  }

  // 1. Lookup admin.policies par claims OIDC (repo, workflow, branch).
  //    Plusieurs tenants pourraient avoir une policy avec les mêmes claims
  //    (peu probable mais pas impossible) → on les itère et on filtre par
  //    le (project, environment) du body pour disambiguer.
  const candidates = await adminPrisma.oidcPolicy.findMany({
    where: { repo: repository, workflow: workflowFile, branch },
    select: {
      id: true,
      tenantSlug: true,
      projectId: true,
      environmentId: true,
    },
  });

  if (candidates.length === 0) {
    logAction({
      action: "DEPLOY_DENIED",
      actor: { kind: "anonymous" },
      metadata: {
        reason: "policy_not_found",
        repository,
        workflow: workflowFile,
        branch,
        project: projectSlug,
        environment: envName,
      },
      req,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Pour chaque candidat, vérifie que le project.slug + environment.name
  //    matchent ceux du body. Le premier qui match gagne.
  type Match = {
    tenantSlug: string;
    policyId: string;
    project: { id: string; slug: string; organizationId: string };
    environment: {
      id: string;
      name: string;
      deployPath: string | null;
      dockerCompose: string | null;
      server: {
        id: string;
        name: string;
        ip: string;
        sshUser: string;
        encryptedKey: string;
        iv: string;
        tag: string;
      } | null;
      secrets: Array<{
        key: string;
        encryptedValue: string;
        iv: string;
        tag: string;
      }>;
    };
  };
  let match: Match | null = null;
  for (const c of candidates) {
    if (!isValidClientSlug(c.tenantSlug)) continue;
    const tenantPrisma = getTenantPrisma(c.tenantSlug);
    const project = await tenantPrisma.project.findUnique({
      where: { id: c.projectId },
      select: { id: true, slug: true, organizationId: true },
    });
    if (!project || project.slug !== projectSlug) continue;

    const environment = await tenantPrisma.environment.findUnique({
      where: { id: c.environmentId },
      select: {
        id: true,
        name: true,
        deployPath: true,
        dockerCompose: true,
        server: {
          select: {
            id: true,
            name: true,
            ip: true,
            sshUser: true,
            encryptedKey: true,
            iv: true,
            tag: true,
          },
        },
        secrets: {
          select: { key: true, encryptedValue: true, iv: true, tag: true },
        },
      },
    });
    if (!environment || environment.name !== envName) continue;

    match = {
      tenantSlug: c.tenantSlug,
      policyId: c.id,
      project,
      environment,
    };
    break;
  }

  if (!match) {
    logAction({
      action: "DEPLOY_DENIED",
      actor: { kind: "anonymous" },
      metadata: {
        reason: "policy_match_failed",
        repository,
        workflow: workflowFile,
        branch,
        project: projectSlug,
        environment: envName,
        candidatesCount: candidates.length,
      },
      req,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantSlug, project, environment, policyId } = match;

  // Garde-fou plan FREE — granularité par organisation.
  // En FREE, le quota inclut 1 organisation. La "primary org" du tenant
  // (la plus ancienne) est considérée comme couverte par le plan ; les
  // autres organisations sont excédentaires et leurs déploiements OIDC
  // sont bloqués. Cette granularité permet à un client downgradé qui a
  // gardé plusieurs orgs de continuer à déployer son org principale,
  // tout en bloquant les déploiements automatiques sur les ressources
  // hors quota.
  const tenantClient = await adminPrisma.client.findUnique({
    where: { slug: tenantSlug },
    select: { plan: true },
  });
  if (tenantClient?.plan === "FREE") {
    const tenantPrisma = getTenantPrisma(tenantSlug);
    const primaryOrg = await tenantPrisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!primaryOrg || primaryOrg.id !== project.organizationId) {
      logAction({
        action: "DEPLOY_DENIED",
        actor: { kind: "anonymous" },
        organizationId: project.organizationId,
        projectId: project.id,
        environmentId: environment.id,
        targetType: "Policy",
        targetId: policyId,
        metadata: {
          reason: "free_plan_org_excess",
          projectOrgId: project.organizationId,
          primaryOrgId: primaryOrg?.id ?? null,
        },
        req,
        tenantSlug,
      });
      return NextResponse.json(
        {
          error:
            "Plan FREE — déploiements OIDC autorisés uniquement pour l'organisation principale (la plus ancienne). Souscrivez un plan payant pour réactiver les déploiements sur les autres organisations.",
        },
        { status: 403 },
      );
    }
  }

  if (!environment.server) {
    logAction({
      action: "DEPLOY_DENIED",
      actor: { kind: "anonymous" },
      organizationId: project.organizationId,
      projectId: project.id,
      environmentId: environment.id,
      targetType: "Policy",
      targetId: policyId,
      metadata: {
        reason: "no_server",
        repository,
        workflow: workflowFile,
        branch,
        project: projectSlug,
        environment: envName,
      },
      req,
      tenantSlug,
    });
    return NextResponse.json(
      { error: "Environment is not bound to a server" },
      { status: 422 },
    );
  }

  // Si l'env n'a pas de deployPath explicite, on applique la convention
  // /srv/projets/<env>/<slug>. La valeur explicite reste prioritaire si
  // l'admin a saisi un chemin custom dans les settings.
  const deployPath =
    environment.deployPath ?? defaultDeployPath(environment.name, project.slug);
  const usedDefaultDeployPath = environment.deployPath === null;

  // Tout est valide : on déchiffre.
  const sshKey = decrypt({
    encryptedValue: environment.server.encryptedKey,
    iv: environment.server.iv,
    tag: environment.server.tag,
  });
  const secrets: Record<string, string> = {};
  for (const s of environment.secrets) {
    secrets[s.key] = decrypt({
      encryptedValue: s.encryptedValue,
      iv: s.iv,
      tag: s.tag,
    });
  }

  // Registry credentials : convention sur 3 OrgSecrets reservés
  // (REGISTRY_PAT + REGISTRY_USER obligatoires, REGISTRY_URL optionnel
  // avec defaut ghcr.io). Renvoyés typés à part de `secrets` pour
  // éviter qu'ils transitent par le `.env` du conteneur.
  const registry = await resolveRegistry(tenantSlug, project.organizationId);

  logAction({
    action: "DEPLOY_AUTHORIZED",
    actor: { kind: "anonymous" },
    organizationId: project.organizationId,
    projectId: project.id,
    environmentId: environment.id,
    targetType: "Policy",
    targetId: policyId,
    metadata: {
      repository,
      workflow: workflowFile,
      branch,
      project: projectSlug,
      environment: envName,
      serverId: environment.server.id,
      serverName: environment.server.name,
      secretsCount: environment.secrets.length,
      hasDockerCompose: environment.dockerCompose !== null,
      hasRegistry: registry !== null,
      usedDefaultDeployPath,
    },
    req,
    tenantSlug,
  });

  return NextResponse.json({
    project: project.slug,
    environment: environment.name,
    serverIp: environment.server.ip,
    serverUser: environment.server.sshUser,
    sshKey,
    deployPath,
    secrets,
    dockerCompose: environment.dockerCompose,
    registry,
  });
}

const REGISTRY_PAT_KEY = "REGISTRY_PAT";
const REGISTRY_USER_KEY = "REGISTRY_USER";
const REGISTRY_URL_KEY = "REGISTRY_URL";
const DEFAULT_REGISTRY_URL = "ghcr.io";

async function resolveRegistry(
  tenantSlug: string,
  organizationId: string,
): Promise<{ url: string; user: string; pat: string } | null> {
  const tenantPrisma = getTenantPrisma(tenantSlug);
  const orgSecrets = await tenantPrisma.orgSecret.findMany({
    where: {
      organizationId,
      key: { in: [REGISTRY_PAT_KEY, REGISTRY_USER_KEY, REGISTRY_URL_KEY] },
    },
    select: { key: true, encryptedValue: true, iv: true, tag: true },
  });

  const byKey = new Map(orgSecrets.map((s) => [s.key, s]));
  const patRow = byKey.get(REGISTRY_PAT_KEY);
  const userRow = byKey.get(REGISTRY_USER_KEY);
  if (!patRow || !userRow) return null;

  const pat = decrypt({
    encryptedValue: patRow.encryptedValue,
    iv: patRow.iv,
    tag: patRow.tag,
  });
  const user = decrypt({
    encryptedValue: userRow.encryptedValue,
    iv: userRow.iv,
    tag: userRow.tag,
  });
  const urlRow = byKey.get(REGISTRY_URL_KEY);
  const url = urlRow
    ? decrypt({
        encryptedValue: urlRow.encryptedValue,
        iv: urlRow.iv,
        tag: urlRow.tag,
      })
    : DEFAULT_REGISTRY_URL;

  return { url, user, pat };
}
