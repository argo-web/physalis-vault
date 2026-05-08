// GET /api/me/shares — liste des OneTimeShare crees par l'user.
//
// Aucun ciphertext ni iv renvoyes (il a ete zero apres consume de toute
// facon, et avant consume on ne veut pas exposer les donnees chiffrees ici
// — la seule facon legitime de lire est via le token URL public).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  // Limite a 100 derniers + 30 jours pour ne pas faire grossir indefiniment.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const shares = await prisma.oneTimeShare.findMany({
    where: { createdById: user.id, createdAt: { gte: cutoff } },
    select: {
      id: true,
      title: true,
      createdAt: true,
      expiresAt: true,
      consumedAt: true,
      viewedFromIp: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Calcule le statut pour la UI : active | consumed | expired | revoked.
  const now = new Date();
  const enriched = shares.map((s) => {
    let status: "active" | "consumed" | "expired" | "revoked";
    if (s.revokedAt) status = "revoked";
    else if (s.consumedAt) status = "consumed";
    else if (s.expiresAt <= now) status = "expired";
    else status = "active";
    return { ...s, status };
  });

  return NextResponse.json({ shares: enriched });
}
