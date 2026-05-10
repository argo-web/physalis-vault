// DELETE /api/user-tokens/[id] — révocation d'un UserToken.
//
// Révocation soft (revokedAt = now()) — pas de hard delete pour préserver
// les liens AccessLog → tokenId. L'entrée admin.token_index reste : la
// validation Bearer constate revokedAt != null et refuse.

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

  const existing = await prisma.userToken.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.userToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  logAction({
    action: "USER_TOKEN_REVOKE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "UserToken",
    targetId: existing.id,
    metadata: { name: existing.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
