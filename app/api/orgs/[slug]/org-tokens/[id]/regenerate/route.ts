// POST /api/orgs/[slug]/org-tokens/[id]/regenerate — Phase 11f.
//
// Rotation in-place du secret d'un OrgToken. Conserve l'ID logique, le
// nom, les scopes, les projets, l'expiration — seul le tokenHash est
// remplacé. Pattern GitHub PAT « Regenerate token ».
//
// Usage : éviter de créer un nouveau token + supprimer l'ancien quand on
// veut juste renouveler le secret (perte du brut, suspicion de fuite,
// rotation programmée). Avantages :
//   - Audit log lié au même tokenId (continuité de l'historique)
//   - Mêmes scopes/projets sans avoir à tout re-cocher dans le dialog
//   - Invalidation immédiate de l'ancien secret (l'attaquant éventuel
//     est éjecté à la prochaine validation)
//
// RBAC :
//   - OrgADMIN+ peut régénérer n'importe quel token de l'org
//   - OrgDEV peut régénérer SES propres tokens (filtrage par createdById)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/api";
import { logAction } from "@/lib/audit";
import {
  generateOrgToken,
  tokenPrefixForUi,
} from "@/lib/integration-token";
import { orgTokenAccessLevel } from "@/lib/org-token-rbac";
import { createHash } from "crypto";

type Params = { params: Promise<{ slug: string; id: string }> };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request, { params }: Params) {
  const { slug, id } = await params;
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const level = orgTokenAccessLevel(access.role);
  if (level === "denied") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.orgToken.findFirst({
    where: {
      id,
      organizationId: access.organization.id,
      // DEV ne peut régénérer que ses propres tokens.
      ...(level === "dev" ? { createdById: access.user.id } : {}),
    },
    select: { id: true, name: true, tokenHash: true, revokedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.revokedAt) {
    return NextResponse.json(
      { error: "Cannot regenerate a revoked token. Create a new one." },
      { status: 400 },
    );
  }

  const newToken = generateOrgToken();
  const newHash = hashToken(newToken);
  const newPrefix = tokenPrefixForUi(newToken);

  // Update in-place. lastUsedAt remis à null (ancien secret invalidé →
  // historique d'usage de l'ancien hash perd son sens). createdAt préservé
  // (continuité du token logique).
  const updated = await prisma.orgToken.update({
    where: { id: existing.id },
    data: {
      tokenHash: newHash,
      prefix: newPrefix,
      lastUsedAt: null,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      allProjects: true,
      allowedProjectIds: true,
      allowedScopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  logAction({
    action: "ORG_TOKEN_REGENERATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "OrgToken",
    targetId: existing.id,
    metadata: { name: existing.name },
    req,
  });

  // Le nouveau token brut est retourné UNE SEULE FOIS. L'ancien est
  // immédiatement invalide.
  return NextResponse.json({ token: newToken, orgToken: updated });
}
