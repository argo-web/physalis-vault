// Stub self-host : pas de provisioning de schéma per-tenant. Les fonctions
// existent pour ne pas casser les imports mais retournent ok=false.
// Signatures alignées sur le source SaaS.

export type ProvisionResult =
  | { ok: true; migrationsApplied: number }
  | { ok: false; error: string };

export type DeprovisionResult =
  | { ok: true; archivePath: string | null }
  | { ok: false; error: string };

export type SchemaStats = {
  orgCount: number;
  userCount: number;
  secretCount: number;
};

export type TenantAdminCreated = {
  userId: string;
  orgSlug: string;
};

export async function provisionClientSchema(
  _slug: string,
  _opts: { actor: string; clientId: string | null },
): Promise<ProvisionResult> {
  return { ok: false, error: "self-host: provisioning disabled" };
}

export async function deprovisionClientSchema(
  _slug: string,
  _opts: { actor: string; clientId: string | null },
): Promise<DeprovisionResult> {
  return { ok: false, error: "self-host: provisioning disabled" };
}

export async function getClientSchemaStats(_slug: string): Promise<SchemaStats> {
  return { orgCount: 0, userCount: 0, secretCount: 0 };
}

export async function createTenantAdminUser(
  _slug: string,
  _email: string,
  _password: string,
): Promise<TenantAdminCreated> {
  throw new Error("self-host: provisioning disabled");
}

export function splitSqlStatements(sql: string): string[] {
  return sql.split(";").map((s) => s.trim()).filter(Boolean);
}
