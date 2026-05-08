// GET /api/me/invitations
//
// Liste les invitations in-app en attente pour l'user connecte. Affichees
// sur le dashboard avec boutons Valider/Refuser.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const invitations = await prisma.invitation.findMany({
    where: {
      inviteeUserId: user.id,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      organization: { select: { slug: true, name: true } },
      invitedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invitations });
}
