// Stub self-host : pas de contexte tenant, on retourne un slug fixe
// "default" qui ne sert à rien (pas de schémas par tenant).

export function getStoredTenantSlug(): string | null {
  return null;
}

export function runWithTenant<T>(_slug: string, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(fn());
}

export function enterTenantContext(_slug: string): void {
  // no-op
}

export function maybeRunWithTenant<T>(
  _slug: string | null,
  fn: () => Promise<T> | T,
): Promise<T> {
  return Promise.resolve(fn());
}
