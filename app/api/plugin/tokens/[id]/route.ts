// DELETE /api/plugin/tokens/[id]
//
// Revoque un PluginToken du user connecte. Soft-delete : `revokedAt = now()`.
// Cascade : a partir de cet instant, toute requete `/api/plugin/match` avec
// ce token retourne 401.
//
// Securite : un user ne peut revoquer que SES propres tokens. Chercher un
// token avec un `userId` different → 404 (pas 403, pour ne pas leak l'existence).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const { id } = await params;

  const existing = await prisma.pluginToken.findFirst({
    where: { id, userId: user.id },
    select: { id: true, revokedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.revokedAt) {
    // Idempotent : deja revoque → 200, pas de re-audit.
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.pluginToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  // L'org primaire pour le scope de l'audit (cf. pattern login dans lib/auth.ts).
  const orgMember = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  logAction({
    action: "PLUGIN_TOKEN_REVOKED",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: orgMember?.organizationId ?? null,
    targetType: "PluginToken",
    targetId: existing.id,
    req,
  });

  return NextResponse.json({ ok: true });
}
