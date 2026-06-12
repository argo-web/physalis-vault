// /api/secret-requests/[token]/submit
//
// Endpoint public (sans auth). Reçoit le ciphertext + IV + clé publique
// éphémère du tiers. Stocke en base sans pouvoir déchiffrer.
//
// Rate-limit 5/h/IP pour éviter le brute-force sur des tokens devinés.
// Notification email à l'admin (best-effort).
// 410 si déjà soumis / expiré / révoqué (anti-replay sur lien copié-collé).

import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { readJson } from "@/lib/api";
import { isValidClientSlug } from "@/lib/validation";
import {
  hashSecretRequestToken,
  isSecretRequestTokenFormat,
  resolveSecretRequestTenantSlug,
} from "@/lib/secret-request";
import { sendSecretReceivedEmail } from "@/lib/email";

type Params = { params: Promise<{ token: string }> };

const SHARED_PORTAL =
  process.env.PHYSALIS_SHARED_PORTAL ?? "vault.physalis.cloud";

type Body = {
  ciphertext?: string;
  iv?: string;
  ephemeralPublicJwk?: string;
  // Volet hybride post-quantique (optionnel — legacy = ECDH seul).
  mlkemCiphertext?: string;
  hybridVersion?: number;
};

export async function POST(req: Request, { params }: Params) {
  const limited = rateLimit(req, "secret-request-submit", {
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;

  const { token } = await params;
  if (!isSecretRequestTokenFormat(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await readJson(req)) as Body | null;
  if (
    !body ||
    typeof body.ciphertext !== "string" ||
    typeof body.iv !== "string" ||
    typeof body.ephemeralPublicJwk !== "string"
  ) {
    return NextResponse.json(
      { error: "ciphertext, iv and ephemeralPublicJwk are required" },
      { status: 400 },
    );
  }
  // Sanity bounds : un secret raisonnable < 64 KiB en base64.
  if (
    body.ciphertext.length > 100_000 ||
    body.iv.length > 200 ||
    body.ephemeralPublicJwk.length > 1_000
  ) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Volet hybride : si hybridVersion=1, le ciphertext ML-KEM est requis et
  // de taille bornée (ML-KEM-768 = 1088 bytes → ~1452 chars base64).
  const isHybrid = body.hybridVersion === 1;
  if (isHybrid) {
    if (typeof body.mlkemCiphertext !== "string") {
      return NextResponse.json(
        { error: "mlkemCiphertext required for hybridVersion 1" },
        { status: 400 },
      );
    }
    if (body.mlkemCiphertext.length > 4_000) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
  }
  const mlkemCiphertext = isHybrid ? body.mlkemCiphertext! : null;
  const hybridVersion = isHybrid ? 1 : null;

  const tenantSlug = await resolveSecretRequestTenantSlug(token);
  if (!tenantSlug || !isValidClientSlug(tenantSlug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tokenHash = hashSecretRequestToken(token);
  const ip = getClientIp(req);
  const submitterIp = ip === "unknown" ? null : ip;

  // UPDATE conditionnel atomique : ne soumet QUE si pending (pas révoqué,
  // pas déjà soumis, pas expiré). Returns 0 rows si aucune des conditions
  // n'est remplie → on renvoie 410 (gone) sans distinction (anti-leak).
  const updateRows = await basePrisma.$executeRawUnsafe(
    `UPDATE "client_${tenantSlug}"."SecretRequest"
     SET "encryptedSecret" = $1,
         "secretIv" = $2,
         "ephemeralPublicKey" = $3,
         "mlkemCiphertext" = $4,
         "hybridVersion" = $5,
         "submittedAt" = NOW(),
         "submitterIp" = $6
     WHERE "tokenHash" = $7
       AND "revokedAt" IS NULL
       AND "submittedAt" IS NULL
       AND "expiresAt" > NOW()`,
    body.ciphertext,
    body.iv,
    body.ephemeralPublicJwk,
    mlkemCiphertext,
    hybridVersion,
    submitterIp,
    tokenHash,
  );

  if (updateRows === 0) {
    return NextResponse.json({ error: "Gone" }, { status: 410 });
  }

  // Audit + notification email (best-effort, hors transaction)
  const rows = await basePrisma.$queryRawUnsafe<
    Array<{
      id: string;
      label: string;
      organizationId: string;
      projectId: string | null;
      requestedByEmail: string;
      requestedById: string | null;
    }>
  >(
    `SELECT id, label, "organizationId", "projectId", "requestedByEmail", "requestedById"
     FROM "client_${tenantSlug}"."SecretRequest"
     WHERE "tokenHash" = $1`,
    tokenHash,
  );
  const sr = rows[0];
  if (sr) {
    // AccessLog : insertion raw qualifiée (pas de session/AsyncLocalStorage ici).
    await basePrisma
      .$executeRawUnsafe(
        `INSERT INTO "client_${tenantSlug}"."AccessLog"
           (id, action, "organizationId", "projectId", "actorUserEmail",
            "ipAddress", "secretKey", "targetType", "targetId", metadata, "createdAt")
         VALUES (gen_random_uuid()::text, 'SECRET_REQUEST_SUBMITTED'::"client_${tenantSlug}"."AccessAction",
                 $1, $2, $3, $4, NULL, 'SecretRequest', $5, $6::jsonb, NOW())`,
        sr.organizationId,
        sr.projectId,
        sr.requestedByEmail,
        submitterIp,
        sr.id,
        JSON.stringify({ label: sr.label, viaPublicLink: true }),
      )
      .catch((err) => {
        console.error("[secret-requests] failed to log SUBMITTED:", err);
      });

    sendSecretReceivedEmail({
      to: sr.requestedByEmail,
      label: sr.label,
      submitterIp,
      reviewUrl: `https://${SHARED_PORTAL}/shares?tab=external#req-${sr.id}`,
    }).catch((err) => {
      console.error("[secret-requests] failed to send received email:", err);
    });
  }

  return NextResponse.json({ ok: true });
}
