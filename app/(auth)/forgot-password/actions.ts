"use server";

// Server action /forgot-password.
//
// Flow :
//   1. Lit le slug tenant depuis le Host header (<slug>.physalis.cloud).
//   2. Lookup user dans client_<slug>.User par email.
//   3. Si trouvé : génère un PasswordResetToken dans admin.password_reset_tokens
//      + envoie un email avec le lien `<slug>.physalis.cloud/reset-password/<token>`.
//   4. Toujours retourne { ok: true } (anti-leak : ne révèle pas si l'email
//      correspond à un compte).
//   5. Rate limit 5/h/IP.
//
// Audit `LOGIN_FAILURE` n'est PAS loggé (le user n'est pas authentifié,
// et on ne veut pas remplir la table d'audit avec des tentatives anonymes).

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { isValidClientSlug, isValidEmail } from "@/lib/validation";
import { adminPrisma } from "@/lib/prisma";
import { withTenantSchema } from "@/lib/tenant";
import { createResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";

export type ForgotResult = { ok: true } | { ok: false; error: string };

function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname || !hostname.endsWith(`.${TENANT_DOMAIN}`)) return null;
  const sub = hostname.slice(0, -(TENANT_DOMAIN.length + 1));
  if (sub.includes(".") || !isValidClientSlug(sub)) return null;
  return sub;
}

export async function requestPasswordReset(
  _prev: ForgotResult | null,
  formData: FormData,
): Promise<ForgotResult> {
  const reqHeaders = await headers();
  const fakeReq = new Request("http://localhost", { headers: reqHeaders });
  const limited = rateLimit(fakeReq, "forgot-password", {
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (limited) {
    return {
      ok: false,
      error: "Trop de tentatives, réessayez dans une heure.",
    };
  }

  // X-Forwarded-Host prioritaire : derrière un reverse proxy (NPM,
  // etc.) le Host header pointe sur l'IP interne — c'est le
  // X-Forwarded-Host qui contient le hostname public vu par l'user.
  const tenantSlug = tenantSlugFromHost(
    reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host"),
  );
  if (!tenantSlug) {
    return {
      ok: false,
      error:
        "Cette page doit être ouverte depuis l'URL de votre workspace (ex: monworkspace.physalis.cloud).",
    };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "Email invalide." };
  }

  // Vérifie que le tenant existe et est actif.
  const client = await adminPrisma.client.findUnique({
    where: { slug: tenantSlug },
    select: { status: true },
  });
  if (
    !client ||
    client.status === "SUSPENDED" ||
    client.status === "CANCELLED"
  ) {
    // On répond OK quand même pour ne pas leak l'existence du tenant.
    return { ok: true };
  }

  // Lookup user dans le schéma tenant. Si absent → on répond OK quand même.
  const user = await withTenantSchema(tenantSlug, (tx) =>
    tx.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    }),
  );

  if (user) {
    try {
      const token = await createResetToken({
        tenantSlug,
        userId: user.id,
        email: user.email,
      });

      const baseUrl = `https://${tenantSlug}.${TENANT_DOMAIN}`;
      const resetUrl = `${baseUrl}/reset-password/${token}`;

      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
    } catch (err) {
      // En cas d'erreur d'envoi, on log côté serveur mais on retourne quand
      // même OK pour ne pas leak l'existence de l'email.
      console.error("[forgot-password] failed to send reset email:", err);
    }
  }

  return { ok: true };
}
