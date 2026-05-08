import { createHash, randomBytes } from "crypto";
import { resolveTokenIndex } from "./token-index";
import { withTenantSchema } from "./tenant";

const TOKEN_PREFIX = "sv_";

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Validation tenant-aware d'un machine token.
 *
 * Flow :
 *   1. Lookup admin.token_index par hash → { tenantSlug, kind }
 *   2. kind doit être MACHINE
 *   3. Enter tenant context (withTenantSchema) et lookup
 *      `client_<slug>.MachineToken` pour obtenir les détails (project,
 *      environment, revokedAt).
 *   4. Retourne `{ ...machineToken, tenantSlug }` ou null.
 *
 * Le retour inclut tenantSlug pour que le caller puisse continuer
 * en runWithTenant(slug, ...) sans re-query l'index.
 *
 * Pas de fallback legacy `public.MachineToken` : tout token actif doit
 * avoir une entrée dans admin.token_index (cf. scripts/migrate-tokens-to-admin.mjs).
 */
export async function validateToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashToken(token);

  const indexEntry = await resolveTokenIndex(tokenHash);
  if (!indexEntry || indexEntry.kind !== "MACHINE") return null;

  const machineToken = await withTenantSchema(indexEntry.tenantSlug, (tx) =>
    tx.machineToken.findUnique({
      where: { tokenHash },
      include: { project: true, environment: true },
    }),
  );
  if (!machineToken || machineToken.revokedAt) return null;

  withTenantSchema(indexEntry.tenantSlug, (tx) =>
    tx.machineToken.update({
      where: { id: machineToken.id },
      data: { lastUsedAt: new Date() },
    }),
  ).catch((err) => console.error("Failed to update lastUsedAt", err));

  return { ...machineToken, tenantSlug: indexEntry.tenantSlug };
}
