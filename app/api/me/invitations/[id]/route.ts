// DELETE /api/me/invitations/[id]
//
// L'invite refuse une invitation in-app. La ligne est supprimee (vs
// flagged decline) — l'inviteur peut renvoyer s'il veut. Audit
// `MEMBER_INVITE_DECLINE`.

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

  // 404 anti-leak si l'invitation n'est pas pour ce user.
  const invitation = await prisma.invitation.findFirst({
    where: { id, inviteeUserId: user.id, acceptedAt: null },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.invitation.delete({ where: { id: invitation.id } });

  logAction({
    action: "MEMBER_INVITE_DECLINE",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: invitation.organizationId,
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, kind: "in_app" },
    req,
  });

  return NextResponse.json({ ok: true });
}
