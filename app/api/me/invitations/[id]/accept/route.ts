// POST /api/me/invitations/[id]/accept
//
// L'invite valide une invitation in-app : cree le OrgMember, marque
// l'invitation acceptedAt. Audit `MEMBER_INVITE_ACCEPT`.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const invitation = await prisma.invitation.findFirst({
    where: {
      id,
      inviteeUserId: user.id,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Race-safe : transaction qui cree OrgMember + marque acceptedAt.
  // Si l'user est deja membre (race / double click), on ne crash pas.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
    });
    if (!existing) {
      await tx.orgMember.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });

  logAction({
    action: "MEMBER_INVITE_ACCEPT",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: invitation.organizationId,
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, kind: "in_app" },
    req,
  });

  return NextResponse.json({
    ok: true,
    organizationId: invitation.organizationId,
  });
}
