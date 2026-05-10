// lib/integration-token.ts — Auth combiné pour les endpoints d'intégration
// (N8n, Make, scripts custom). Accepte 3 types de tokens Bearer :
//
//   - UserToken    (`sv_user_<hex>`) → scopé 1 user, accès READ aux projets
//     dont il est ProjectMember (RBAC standard).
//   - OrgToken     (`sv_org_<hex>`)  → scopé 1 organisation, scopes
//     explicites (SECRETS_READ, etc.) + liste de projets autorisés.
//     Survit au départ du user créateur (différenciateur clé).
//   - MachineToken (`sv_<hex>`)      → scopé project + env précis.
//     Conservé pour compat self-host / intégrations non-GitHub.
//
// Flow :
//   1. Extraction du Bearer header
//   2. Distinction par préfixe (le plus spécifique en premier — sv_user_ et
//      sv_org_ matchent aussi sv_, donc on les teste avant)
//   3. Lookup admin.token_index par hash → { tenantSlug, kind }
//   4. Selon kind, lookup la bonne table tenant
//   5. Retourne un contexte discriminé par `kind`
//
// Cf. lib/auth-token.ts pour MachineToken seul (legacy /api/secrets,
// /api/compose). Ce module est le successeur côté nouvelles intégrations.

import { createHash, randomBytes } from "crypto";
import type { OrgTokenScope } from "@prisma/client";
import { resolveTokenIndex } from "./token-index";
import { withTenantSchema } from "./tenant";

const USER_PREFIX = "sv_user_";
const ORG_PREFIX = "sv_org_";
const MACHINE_PREFIX = "sv_";

export type IntegrationContext =
  | {
      kind: "user";
      tenantSlug: string;
      userId: string;
      userEmail: string;
      tokenId: string;
      tokenName: string;
    }
  | {
      kind: "org";
      tenantSlug: string;
      organizationId: string;
      tokenId: string;
      tokenName: string;
      allProjects: boolean;
      allowedProjectIds: string[];
      allowedScopes: OrgTokenScope[];
      /// Email du user qui a créé le token, dénormalisé pour l'audit log.
      /// Undefined si le user a été supprimé depuis (createdById SetNull).
      createdByEmail: string | undefined;
    }
  | {
      kind: "machine";
      tenantSlug: string;
      projectId: string;
      projectSlug: string;
      environmentId: string;
      environmentName: string;
      tokenId: string;
      tokenName: string;
    };

export function generateUserToken(): string {
  return USER_PREFIX + randomBytes(32).toString("hex");
}

export function generateOrgToken(): string {
  return ORG_PREFIX + randomBytes(32).toString("hex");
}

export function tokenPrefixForUi(token: string): string {
  // 12 premiers chars : "sv_user_xxxx" / "sv_org_xxxxx" / "sv_xxxxxxxx"
  // (suffisant pour reconnaître sans exposer le secret).
  return token.slice(0, 12);
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Valide un Bearer token (UserToken OU MachineToken) et retourne le contexte.
 * Renvoie null si :
 *   - format invalide (pas le bon préfixe)
 *   - token absent de admin.token_index
 *   - token révoqué (revokedAt != null)
 *   - token expiré (UserToken.expiresAt < now)
 *
 * Met à jour `lastUsedAt` en best-effort (fire-and-forget).
 */
export async function validateIntegrationToken(
  token: string,
): Promise<IntegrationContext | null> {
  // Distinction par préfixe — testés du plus spécifique au moins :
  // sv_user_ et sv_org_ matchent AUSSI sv_, donc l'ordre est important.
  let expectedKind: "USER" | "ORG" | "MACHINE";
  if (token.startsWith(USER_PREFIX)) {
    expectedKind = "USER";
  } else if (token.startsWith(ORG_PREFIX)) {
    expectedKind = "ORG";
  } else if (token.startsWith(MACHINE_PREFIX)) {
    expectedKind = "MACHINE";
  } else {
    return null;
  }

  const tokenHash = hash(token);
  const indexEntry = await resolveTokenIndex(tokenHash);
  if (!indexEntry) return null;
  if (indexEntry.kind !== expectedKind) return null;

  if (indexEntry.kind === "USER") {
    const row = await withTenantSchema(indexEntry.tenantSlug, (tx) =>
      tx.userToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, email: true } } },
      }),
    );
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    withTenantSchema(indexEntry.tenantSlug, (tx) =>
      tx.userToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      }),
    ).catch((err) =>
      console.error("Failed to update UserToken.lastUsedAt", err),
    );

    return {
      kind: "user",
      tenantSlug: indexEntry.tenantSlug,
      userId: row.user.id,
      userEmail: row.user.email,
      tokenId: row.id,
      tokenName: row.name,
    };
  }

  if (indexEntry.kind === "ORG") {
    const row = await withTenantSchema(indexEntry.tenantSlug, (tx) =>
      tx.orgToken.findUnique({
        where: { tokenHash },
        include: { createdBy: { select: { email: true } } },
      }),
    );
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    withTenantSchema(indexEntry.tenantSlug, (tx) =>
      tx.orgToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      }),
    ).catch((err) =>
      console.error("Failed to update OrgToken.lastUsedAt", err),
    );

    return {
      kind: "org",
      tenantSlug: indexEntry.tenantSlug,
      organizationId: row.organizationId,
      tokenId: row.id,
      tokenName: row.name,
      allProjects: row.allProjects,
      allowedProjectIds: row.allowedProjectIds,
      allowedScopes: row.allowedScopes,
      createdByEmail: row.createdBy?.email,
    };
  }

  // MACHINE
  const row = await withTenantSchema(indexEntry.tenantSlug, (tx) =>
    tx.machineToken.findUnique({
      where: { tokenHash },
      include: {
        project: { select: { id: true, slug: true } },
        environment: { select: { id: true, name: true } },
      },
    }),
  );
  if (!row || row.revokedAt) return null;

  withTenantSchema(indexEntry.tenantSlug, (tx) =>
    tx.machineToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    }),
  ).catch((err) => console.error("Failed to update MachineToken.lastUsedAt", err));

  return {
    kind: "machine",
    tenantSlug: indexEntry.tenantSlug,
    projectId: row.project.id,
    projectSlug: row.project.slug,
    environmentId: row.environment.id,
    environmentName: row.environment.name,
    tokenId: row.id,
    tokenName: row.name,
  };
}

/** Helper : un OrgToken peut-il accéder à ce projet ?
 *  - allProjects=true   → toujours oui (peu importe allowedProjectIds)
 *  - sinon              → oui ssi projectId est dans allowedProjectIds
 */
export function orgTokenAllowsProject(
  ctx: { allProjects: boolean; allowedProjectIds: string[] },
  projectId: string,
): boolean {
  if (ctx.allProjects) return true;
  return ctx.allowedProjectIds.includes(projectId);
}

/** Helper : mappe un type de ressource (api/integrations/credentials)
 *  vers le scope OrgToken requis. */
export function scopeForType(
  type: "secret" | "service" | "account",
): OrgTokenScope {
  switch (type) {
    case "secret":
      return "SECRETS_READ";
    case "service":
      return "SERVICES_READ";
    case "account":
      return "ACCOUNTS_READ";
  }
}

/** Extrait le Bearer du header Authorization. Renvoie null si absent ou
 *  format invalide. */
export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
