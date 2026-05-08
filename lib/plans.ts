// Phase 5 — Centralisation pure des définitions de plans.
//
// ⚠️ Ce fichier doit rester importable depuis des CLIENT COMPONENTS.
// Aucun import vers `./prisma` (qui pull AsyncLocalStorage / Node APIs
// non supportées en client bundle).
//
// Le runtime DB lookup (getPlanForTenant) vit dans `./plan-lookup.ts`
// (server-only) — l'importer uniquement depuis du code serveur.
//
// Le type `Plan` est défini localement (literal union) plutôt qu'importé
// depuis Prisma, pour les mêmes raisons : webpack tire la chaîne d'imports
// même pour un `import type`.

// ─── Type local (synchroniser manuellement avec admin.Plan enum) ──────

export type Plan = "FREE" | "SHARED" | "DEDICATED";

// ─── Quotas ───────────────────────────────────────────────────────────

export type PlanQuota = {
  maxOrgs: number;
  maxUsers: number;
};

export const PLAN_QUOTAS: Record<Plan, PlanQuota> = {
  FREE: { maxOrgs: 1, maxUsers: 1 },
  SHARED: { maxOrgs: 2, maxUsers: 5 },
  DEDICATED: { maxOrgs: 5, maxUsers: 15 },
};

// ─── Features ─────────────────────────────────────────────────────────

export type PlanFeature =
  | "personal_vault"
  | "custom_domain"
  | "multi_users"
  | "server_management"
  | "github_actions_oidc"
  | "dedicated_instance"
  | "support"
  | "backups";

const PLAN_FEATURES: Record<Plan, ReadonlySet<PlanFeature>> = {
  FREE: new Set<PlanFeature>(["personal_vault", "backups"]),
  SHARED: new Set<PlanFeature>([
    "personal_vault",
    "custom_domain",
    "multi_users",
    "server_management",
    "github_actions_oidc",
    "support",
    "backups",
  ]),
  DEDICATED: new Set<PlanFeature>([
    "personal_vault",
    "custom_domain",
    "multi_users",
    "server_management",
    "github_actions_oidc",
    "dedicated_instance",
    "support",
    "backups",
  ]),
};

export function canUseFeature(plan: Plan, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

// ─── Métadonnées UI ───────────────────────────────────────────────────

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: "free",
  SHARED: "shared",
  DEDICATED: "dedicated",
};

export const PLAN_PRICES: Record<Plan, string> = {
  FREE: "Gratuit",
  SHARED: "5€/mois",
  DEDICATED: "25€/mois",
};

export const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  FREE:
    "1 org, 1 user, coffre personnel + backups. Permanent gratuit, sans engagement.",
  SHARED: "2 orgs, 5 users. Multi-utilisateurs, gestion serveurs, OIDC.",
  DEDICATED:
    "5 orgs, 15 users. Sous-domaine dédié + tout shared + support prioritaire.",
};

/**
 * Indique si un plan démarre en TRIAL ou directement en ACTIVE. Le plan
 * FREE est gratuit-permanent (pas de trial → trial_ends_at = null).
 */
export function planHasTrial(plan: Plan): boolean {
  return plan !== "FREE";
}

/**
 * URL de connexion d'un tenant selon son plan :
 *   FREE             → https://{shared}/login?tenant={slug}
 *   SHARED/DEDICATED → https://{slug}.{tenantDomain}/login
 *
 * Les opts sont passés explicitement (pas lus depuis process.env) pour
 * que ce helper reste importable depuis des client components.
 */
export function getTenantLoginUrl(
  plan: Plan,
  slug: string,
  opts: { tenantDomain: string; sharedPortal: string },
): string {
  if (plan === "FREE") {
    return `https://${opts.sharedPortal}/login?tenant=${encodeURIComponent(slug)}`;
  }
  return `https://${slug}.${opts.tenantDomain}/login`;
}
