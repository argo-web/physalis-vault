// Stub self-host : pas de quotas (single-tenant — l'opérateur de
// l'instance gère lui-même la capacité de sa DB / VPS).
// Signatures alignées sur le source SaaS pour ne pas casser les consumers.

export type QuotaCheck = {
  allowed: boolean;
  current: number;
  max: number;
};

export async function checkOrgQuota(
  _tenantSlug: string | null,
): Promise<QuotaCheck> {
  return { allowed: true, current: 0, max: 999 };
}

export async function checkUserQuota(
  _tenantSlug: string | null,
): Promise<QuotaCheck> {
  return { allowed: true, current: 0, max: 999 };
}

export async function tenantUserExists(
  _tenantSlug: string | null,
  _email: string,
): Promise<boolean> {
  return false;
}

export async function findClientIdBySlug(
  _slug: string | null,
): Promise<string | null> {
  return null;
}
