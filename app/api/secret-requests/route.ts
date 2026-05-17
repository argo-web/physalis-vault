// /api/secret-requests
//
// GET  : liste les demandes de secret externe sur toutes les orgs où le user
//        est DEV+ (multi-org global). Filtres : ?org=<slug>&project=<slug>&status=...
// POST : crée une nouvelle demande. Body :
//        { label, description?, organizationId, projectId?, environmentName?,
//          secretKey?, recipientEmail? }
//        Retourne { id, requestUrl, privateKey } — privateKey UNE SEULE FOIS.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser } from "@/lib/api";
import { isValidEmail, isValidSecretKey } from "@/lib/validation";
import { logAction } from "@/lib/audit";
import { generateEcdhKeypair } from "@/lib/secret-request-crypto";
import {
  SECRET_REQUEST_TTL_MS,
  deriveStatus,
  generateSecretRequestToken,
  hashSecretRequestToken,
  type SecretRequestStatus,
} from "@/lib/secret-request";
import { sendSecretRequestEmail } from "@/lib/email";

const SHARED_PORTAL =
  process.env.PHYSALIS_SHARED_PORTAL ?? "vault.physalis.cloud";

const VALID_STATUSES: SecretRequestStatus[] = [
  "pending",
  "received",
  "imported",
  "revoked",
  "expired",
];

export async function GET(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const url = new URL(req.url);
  const orgSlugFilter = url.searchParams.get("org");
  const projectSlugFilter = url.searchParams.get("project");
  const statusFilter = url.searchParams.get("status");

  // Toutes les orgs où l'user est DEV+ (donc ADMIN ou OWNER aussi).
  const memberships = await prisma.orgMember.findMany({
    where: {
      userId: user.id,
      role: { in: ["OWNER", "ADMIN", "DEV"] },
    },
    select: { organization: { select: { id: true, slug: true, name: true } } },
  });
  const orgIds = memberships.map((m) => m.organization.id);
  if (orgIds.length === 0) {
    return NextResponse.json({ requests: [], orgs: [] });
  }

  // Filtre org optionnel
  let scopedOrgIds = orgIds;
  if (orgSlugFilter) {
    const match = memberships.find((m) => m.organization.slug === orgSlugFilter);
    if (!match) {
      return NextResponse.json({ requests: [], orgs: memberships.map((m) => m.organization) });
    }
    scopedOrgIds = [match.organization.id];
  }

  // Filtre project optionnel (par slug, scopé sur les orgs du user)
  let projectIdFilter: string | undefined;
  if (projectSlugFilter) {
    const proj = await prisma.project.findFirst({
      where: {
        slug: projectSlugFilter,
        organizationId: { in: scopedOrgIds },
      },
      select: { id: true },
    });
    if (!proj) {
      return NextResponse.json({ requests: [], orgs: memberships.map((m) => m.organization) });
    }
    projectIdFilter = proj.id;
  }

  const rows = await prisma.secretRequest.findMany({
    where: {
      organizationId: { in: scopedOrgIds },
      ...(projectIdFilter ? { projectId: projectIdFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      label: true,
      description: true,
      requestedByEmail: true,
      recipientEmail: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
      projectId: true,
      project: { select: { name: true, slug: true } },
      environmentName: true,
      secretKey: true,
      submittedAt: true,
      viewedAt: true,
      importedAt: true,
      revokedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // Statut dérivé en JS (pas filtrable en SQL trivialement)
  const enriched = rows.map((r) => ({
    ...r,
    status: deriveStatus(r),
  }));

  const filtered =
    statusFilter && VALID_STATUSES.includes(statusFilter as SecretRequestStatus)
      ? enriched.filter((r) => r.status === statusFilter)
      : enriched;

  return NextResponse.json({
    requests: filtered,
    orgs: memberships.map((m) => m.organization),
  });
}

type PostBody = {
  label?: string;
  description?: string;
  organizationId?: string;
  projectId?: string;
  environmentName?: string;
  secretKey?: string;
  recipientEmail?: string;
};

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const body = (await readJson(req)) as PostBody | null;
  if (
    !body ||
    typeof body.label !== "string" ||
    body.label.trim().length === 0 ||
    typeof body.organizationId !== "string"
  ) {
    return NextResponse.json(
      { error: "label and organizationId are required" },
      { status: 400 },
    );
  }
  const label = body.label.trim().slice(0, 200);
  const description = body.description?.trim().slice(0, 500) || null;
  const recipientEmail = body.recipientEmail?.trim().toLowerCase() || null;
  if (recipientEmail && !isValidEmail(recipientEmail)) {
    return NextResponse.json(
      { error: "Invalid recipientEmail" },
      { status: 400 },
    );
  }
  const environmentName =
    body.environmentName?.trim().slice(0, 100) || null;
  const secretKey = body.secretKey?.trim() || null;
  if (secretKey && !isValidSecretKey(secretKey)) {
    return NextResponse.json(
      { error: "secretKey invalide (format ^[A-Z][A-Z0-9_]*$)" },
      { status: 400 },
    );
  }

  // Org access : user doit être DEV+ sur l'org.
  const orgMembership = await prisma.orgMember.findFirst({
    where: {
      userId: user.id,
      organizationId: body.organizationId,
      role: { in: ["OWNER", "ADMIN", "DEV"] },
    },
    select: { organization: { select: { id: true, slug: true, name: true } } },
  });
  if (!orgMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const org = orgMembership.organization;

  // Project access optionnel : doit appartenir à l'org choisie + non hidden
  // pour ce user (l'admin pourrait avoir caché ce projet à un dev).
  let projectId: string | null = null;
  if (body.projectId) {
    const proj = await prisma.project.findFirst({
      where: {
        id: body.projectId,
        organizationId: org.id,
        members: { none: { userId: user.id, hidden: true } },
      },
      select: { id: true },
    });
    if (!proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = proj.id;
  }

  // Crypto : génère paire ECDH éphémère côté serveur.
  const keypair = await generateEcdhKeypair();
  const token = generateSecretRequestToken();
  const tokenHash = hashSecretRequestToken(token);
  const expiresAt = new Date(Date.now() + SECRET_REQUEST_TTL_MS);

  const created = await prisma.secretRequest.create({
    data: {
      tokenHash,
      label,
      description,
      requestedById: user.id,
      requestedByEmail: user.email,
      recipientEmail,
      organizationId: org.id,
      projectId,
      environmentName,
      secretKey,
      publicKeyJwk: keypair.publicJwk,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  const requestUrl = `https://${SHARED_PORTAL}/request/${token}`;

  // Envoi email automatique si destinataire fourni (best-effort).
  if (recipientEmail) {
    sendSecretRequestEmail({
      to: recipientEmail,
      requesterEmail: user.email,
      label,
      description,
      requestUrl,
      expiresAt: created.expiresAt,
    }).catch((err) => {
      console.error("[secret-requests] failed to send invite email:", err);
    });
  }

  logAction({
    action: "SECRET_REQUEST_CREATED",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: org.id,
    projectId,
    targetType: "SecretRequest",
    targetId: created.id,
    metadata: {
      label,
      recipientEmail,
      hasProject: Boolean(projectId),
      hasImportTarget: Boolean(environmentName && secretKey),
    },
    req,
  });

  return NextResponse.json(
    {
      id: created.id,
      requestUrl,
      // Privée renvoyée UNE SEULE FOIS — l'admin doit la stocker
      // (coffre Physalis ou ailleurs).
      privateKey: keypair.privateJwk,
      expiresAt: created.expiresAt,
    },
    { status: 201 },
  );
}
