// /api/secret-requests/[token]/public
//
// Endpoint public (sans authentification). Retourne les metadata de la
// demande pour permettre au tiers d'afficher le formulaire `/request/[token]`.
//
// Anti-leak : 404 générique si invalide / expirée / révoquée / déjà soumise.
// Pas de distinction entre "n'existe pas" et "expiré" pour ne pas leak
// l'existence du token à un attaquant.

import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import {
  hashSecretRequestToken,
  isSecretRequestTokenFormat,
  resolveSecretRequestTenantSlug,
} from "@/lib/secret-request";
import { isValidClientSlug } from "@/lib/validation";

type Params = { params: Promise<{ token: string }> };

const NOT_FOUND = NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!isSecretRequestTokenFormat(token)) return NOT_FOUND;

  const tenantSlug = await resolveSecretRequestTenantSlug(token);
  if (!tenantSlug || !isValidClientSlug(tenantSlug)) return NOT_FOUND;

  const tokenHash = hashSecretRequestToken(token);

  // Lookup raw SQL avec qualification explicite — comme on n'a pas de
  // session NextAuth ici, on bypass l'extension `prisma` qui exige un
  // contexte tenant.
  const rows = await basePrisma.$queryRawUnsafe<
    Array<{
      label: string;
      description: string | null;
      requestedByEmail: string;
      publicKeyJwk: string;
      submittedAt: Date | null;
      revokedAt: Date | null;
      expiresAt: Date;
    }>
  >(
    `SELECT label, description, "requestedByEmail", "publicKeyJwk",
            "submittedAt", "revokedAt", "expiresAt"
     FROM "client_${tenantSlug}"."SecretRequest"
     WHERE "tokenHash" = $1
     LIMIT 1`,
    tokenHash,
  );
  const sr = rows[0];
  if (!sr) return NOT_FOUND;
  if (sr.revokedAt || sr.submittedAt || sr.expiresAt <= new Date()) {
    return NOT_FOUND;
  }

  return NextResponse.json({
    label: sr.label,
    description: sr.description,
    requestedByEmail: sr.requestedByEmail,
    publicKeyJwk: sr.publicKeyJwk,
    expiresAt: sr.expiresAt,
  });
}
