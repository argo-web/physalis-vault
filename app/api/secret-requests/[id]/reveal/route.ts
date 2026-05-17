// /api/secret-requests/[id]/reveal
//
// Retourne le ciphertext + IV + clé publique éphémère pour permettre à
// l'admin de déchiffrer LOCALEMENT dans son navigateur (avec sa clé
// privée). Le serveur ne déchiffre rien.
//
// Met à jour viewedAt à la première révélation. Audit SECRET_REQUEST_REVEALED.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { id } = await params;

  const sr = await prisma.secretRequest.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      organizationId: true,
      organization: {
        select: {
          members: {
            where: {
              userId: userRes.user.id,
              role: { in: ["OWNER", "ADMIN", "DEV"] },
            },
            select: { role: true },
          },
        },
      },
      projectId: true,
      encryptedSecret: true,
      secretIv: true,
      ephemeralPublicKey: true,
      submittedAt: true,
      revokedAt: true,
      viewedAt: true,
      expiresAt: true,
    },
  });
  if (!sr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (sr.organization.members.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (sr.revokedAt) {
    return NextResponse.json({ error: "Revoked" }, { status: 410 });
  }
  if (
    !sr.encryptedSecret ||
    !sr.secretIv ||
    !sr.ephemeralPublicKey ||
    !sr.submittedAt
  ) {
    return NextResponse.json(
      { error: "Secret not yet submitted" },
      { status: 404 },
    );
  }

  // Marque la première révélation (timestamp utile pour l'audit UI).
  if (!sr.viewedAt) {
    await prisma.secretRequest.update({
      where: { id: sr.id },
      data: { viewedAt: new Date() },
    });
  }

  logAction({
    action: "SECRET_REQUEST_REVEALED",
    actor: { kind: "user", userId: userRes.user.id, email: userRes.user.email },
    organizationId: sr.organizationId,
    projectId: sr.projectId,
    targetType: "SecretRequest",
    targetId: sr.id,
    metadata: { label: sr.label, firstReveal: !sr.viewedAt },
    req,
  });

  return NextResponse.json({
    encryptedSecret: sr.encryptedSecret,
    iv: sr.secretIv,
    ephemeralPublicJwk: sr.ephemeralPublicKey,
  });
}
