"use server";

// Server action pour /signup public — Phase 4.1.
//
// Flow :
//   1. Validation inputs (name, slug, email, password, plan)
//   2. Vérification unicité du slug
//   3. Création admin.clients (status=TRIAL, trial_ends_at=now()+14d)
//   4. provisionClientSchema(slug)
//   5. createTenantAdminUser(slug, email, hash) avec le password choisi
//      par l'utilisateur (pas de password temporaire — c'est lui qui
//      l'a saisi)
//   6. logAdminAction client.created
//   7. Email de bienvenue (best-effort)
//   8. Retour des infos pour l'écran de confirmation
//
// Rollback complet (DROP SCHEMA + DELETE row) en cas d'échec post-création.

import bcrypt from "bcryptjs";
import { adminPrisma, type Plan } from "@/lib/prisma";
import {
  isValidClientSlug,
  isValidEmail,
} from "@/lib/validation";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createTenantAdminUser,
  deprovisionClientSchema,
  provisionClientSchema,
} from "@/lib/provisioning";
import { sendWelcomeEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { RESERVED_SIGNUP_SLUGS } from "@/lib/signup-reserved-slugs";
import { PLAN_QUOTAS, getTenantLoginUrl, planHasTrial } from "@/lib/plans";

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";
const SHARED_PORTAL = process.env.PHYSALIS_SHARED_PORTAL ?? "vault.physalis.cloud";

export type SignupResult =
  | {
      ok: true;
      slug: string;
      adminEmail: string;
      loginUrl: string;
      plan: Plan;
    }
  | { ok: false; error: string };

export async function signupTenant(
  _prev: SignupResult | null,
  formData: FormData,
): Promise<SignupResult> {
  // Anti-abus : 5 signups / heure / IP. Tient compte du fait que
  // chaque tentative coûte des ressources DB (CREATE SCHEMA + replay).
  const reqHeaders = await headers();
  const fakeReq = new Request("http://localhost", {
    headers: reqHeaders,
  });
  const limited = rateLimit(fakeReq, "signup", {
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (limited) {
    return { ok: false, error: "Trop de tentatives, réessayez dans une heure." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const plan = String(formData.get("plan") ?? "");

  // ─── Validation ──────────────────────────────────────────────────
  if (!name || name.length > 255) {
    return { ok: false, error: "Le nom est requis (1-255 caractères)." };
  }
  if (!isValidClientSlug(slug)) {
    return {
      ok: false,
      error:
        "Slug invalide. Lowercase, alphanumérique et tirets uniquement, 1-50 caractères, sans tiret en début/fin.",
    };
  }
  if (RESERVED_SIGNUP_SLUGS.has(slug)) {
    return { ok: false, error: `Le slug "${slug}" est réservé.` };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "Email invalide." };
  }
  if (password.length < 12) {
    return { ok: false, error: "Mot de passe de 12 caractères minimum requis." };
  }
  if (plan !== "FREE" && plan !== "SHARED" && plan !== "DEDICATED") {
    return { ok: false, error: "Plan invalide." };
  }

  // ─── 1. Unicité slug ─────────────────────────────────────────────
  const existing = await adminPrisma.client.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, error: `Le slug "${slug}" est déjà utilisé.` };
  }

  // ─── 2. Création admin.clients ───────────────────────────────────
  // FREE : status=ACTIVE direct, trial_ends_at=null (gratuit-permanent).
  // SHARED/DEDICATED : status=TRIAL via default DB, trial_ends_at=now()+14d.
  const planTyped = plan as Plan;
  const quotas = PLAN_QUOTAS[planTyped];
  const hasTrial = planHasTrial(planTyped);
  const created = await adminPrisma.client.create({
    data: {
      name,
      slug,
      plan: planTyped,
      maxOrgs: quotas.maxOrgs,
      maxUsers: quotas.maxUsers,
      ...(hasTrial
        ? {} // status=TRIAL et trial_ends_at=now()+14d via les defaults
        : { status: "ACTIVE", trialEndsAt: null }),
    },
    select: { id: true, trialEndsAt: true },
  });

  // ─── 3. Provisioning du schéma ───────────────────────────────────
  const provResult = await provisionClientSchema(slug, {
    actor: email, // self-signup, l'acteur est l'user lui-même
    clientId: created.id,
  });
  if (!provResult.ok) {
    await adminPrisma.client.delete({ where: { id: created.id } }).catch(() => null);
    return {
      ok: false,
      error: `Provisioning échoué : ${provResult.error}`,
    };
  }

  // ─── 4. Création du user admin tenant ────────────────────────────
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await createTenantAdminUser(slug, email, passwordHash);
  } catch (err) {
    await deprovisionClientSchema(slug, {
      actor: email,
      clientId: null,
    }).catch(() => null);
    await adminPrisma.client.delete({ where: { id: created.id } }).catch(() => null);
    return {
      ok: false,
      error: `Création du compte échouée : ${(err as Error).message}`,
    };
  }

  // ─── 5. Log audit ────────────────────────────────────────────────
  await logAdminAction({
    action: "client.created",
    clientId: created.id,
    actor: email,
    metadata: {
      slug,
      plan,
      adminEmail: email,
      schemaProvisioned: true,
      origin: "self-signup",
    },
  });

  // ─── 6. URL de login (FREE = portal partagé, SHARED/DEDICATED = subdomain) ───
  const loginUrl = getTenantLoginUrl(planTyped, slug, {
    tenantDomain: TENANT_DOMAIN,
    sharedPortal: SHARED_PORTAL,
  });

  // ─── 7. Email de bienvenue (best-effort) ─────────────────────────
  try {
    await sendWelcomeEmail({
      to: email,
      clientName: name,
      loginUrl,
      trialEndsAt: created.trialEndsAt,
      plan:
        plan === "DEDICATED" ? "dedicated" : plan === "FREE" ? "free" : "shared",
    });
  } catch (err) {
    console.warn("[signup] welcome email failed:", err);
  }

  return {
    ok: true,
    slug,
    adminEmail: email,
    loginUrl,
    plan: plan as Plan,
  };
}
