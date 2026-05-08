// DELETE /api/me/shares/[id] — revoque un OneTimeShare cree par l'user.
//
// Idempotent (re-appel sur deja-revoque/consomme = no-op + 200). 404 si
// l'id n'appartient pas au user (anti-leak — pas 403 pour ne pas leak
// l'existence).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const share = await prisma.oneTimeShare.findFirst({
    where: { id, createdById: user.id },
  });
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Si deja revoque ou consomme : no-op, 200 idempotent.
  if (share.revokedAt || share.consumedAt) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }

  await prisma.oneTimeShare.update({
    where: { id: share.id },
    data: {
      revokedAt: new Date(),
      // Zero le ciphertext aussi — un attaquant qui aurait l'URL ne pourra
      // plus rien dechiffrer meme s'il bypass le check revokedAt.
      ciphertext: "",
      iv: "",
    },
  });

  logAction({
    action: "SHARE_REVOKE",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: share.organizationId,
    targetType: "OneTimeShare",
    targetId: share.id,
    metadata: { hasTitle: share.title !== null },
    req,
  });

  return NextResponse.json({ ok: true });
}
