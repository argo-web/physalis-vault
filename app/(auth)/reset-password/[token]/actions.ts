"use server";

// Server action /reset-password/[token].
//
// Flow :
//   1. Resolve token via admin.password_reset_tokens (must exist, not expired,
//      not used).
//   2. Validate new password (≥12 chars).
//   3. Update user.password dans le bon schéma client_<slug>.
//   4. Mark token as used.
//   5. Audit `LOGIN_FAILURE` n'a pas de sens ici. On log un événement
//      générique côté audit serveur (console).
//
// Rate-limit : 5/h/IP (anti-brute si un attaquant tentait des tokens random).

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashResetToken,
  markResetTokenUsed,
  resolveResetToken,
} from "@/lib/password-reset";
import { withTenantSchema } from "@/lib/tenant";

export type ResetResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(
  _prev: ResetResult | null,
  formData: FormData,
): Promise<ResetResult> {
  const reqHeaders = await headers();
  const fakeReq = new Request("http://localhost", { headers: reqHeaders });
  const limited = rateLimit(fakeReq, "reset-password", {
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (limited) {
    return {
      ok: false,
      error: "Trop de tentatives, réessayez dans une heure.",
    };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    return {
      ok: false,
      error: "Le mot de passe doit faire au moins 12 caractères.",
    };
  }
  if (password !== confirm) {
    return { ok: false, error: "Les mots de passe ne correspondent pas." };
  }

  const record = await resolveResetToken(token);
  if (!record) {
    return {
      ok: false,
      error: "Lien invalide ou expiré. Demandez un nouveau lien.",
    };
  }
  if (!record.tenantSlug) {
    // Reset SUPERADMIN platform-level non implémenté pour l'instant.
    return { ok: false, error: "Reset non disponible pour ce compte." };
  }

  const hash = await bcrypt.hash(password, 12);
  try {
    await withTenantSchema(record.tenantSlug, async (tx) => {
      // Double-check l'email pour éviter un edge case où l'user aurait été
      // recréé avec un id différent (improbable mais paranoia OK).
      const user = await tx.user.findUnique({
        where: { id: record.userId },
        select: { id: true, email: true },
      });
      if (!user || user.email.toLowerCase() !== record.email.toLowerCase()) {
        throw new Error("user_changed");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { password: hash },
      });
    });
  } catch (err) {
    console.error("[reset-password] update failed:", err);
    return {
      ok: false,
      error: "Erreur lors du changement de mot de passe.",
    };
  }

  await markResetTokenUsed(hashResetToken(token));

  return { ok: true };
}
