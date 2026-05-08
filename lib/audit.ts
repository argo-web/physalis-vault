import { Prisma, type AccessAction } from "@prisma/client";
import { getClientIp } from "./rate-limit";
import { withTenantSchema } from "./tenant";
import { getStoredTenantSlug } from "./tenant-context";

export type AuditActor =
  | { kind: "user"; userId: string; email?: string | null }
  | { kind: "token"; tokenId: string; tokenName?: string | null }
  | { kind: "anonymous" };

export type AuditEntry = {
  action: AccessAction;
  actor: AuditActor;
  organizationId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  secretKey?: string | null;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
  /**
   * Slug du tenant pour router l'écriture vers `client_<slug>.AccessLog`.
   * Si null/absent → l'événement est skippé (pas de fallback legacy sur
   * `public.AccessLog`). Concerne typiquement les logins SUPERADMIN sans
   * tenant et les rejets `tenant_required_for_non_superadmin`.
   */
  tenantSlug?: string | null;
};

/**
 * Records an audit log entry. Non-blocking: if the write fails, the error is
 * logged but the caller's request is not affected — auditing must never break
 * the operation it records.
 */
export function logAction(entry: AuditEntry): Promise<void> {
  const ipAddress = entry.req ? getClientIp(entry.req) : null;
  const userAgent = entry.req?.headers.get("user-agent") ?? null;

  const actorUserId = entry.actor.kind === "user" ? entry.actor.userId : null;
  const actorUserEmail =
    entry.actor.kind === "user" ? (entry.actor.email ?? null) : null;
  const actorTokenId =
    entry.actor.kind === "token" ? entry.actor.tokenId : null;
  const actorTokenName =
    entry.actor.kind === "token" ? (entry.actor.tokenName ?? null) : null;

  const data = {
    action: entry.action,
    organizationId: entry.organizationId ?? null,
    projectId: entry.projectId ?? null,
    environmentId: entry.environmentId ?? null,
    actorUserId,
    actorUserEmail,
    actorTokenId,
    actorTokenName,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    secretKey: entry.secretKey ?? null,
    ipAddress: ipAddress === "unknown" ? null : ipAddress,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
    metadata: entry.metadata ?? Prisma.JsonNull,
  };
  // Si le caller ne précise pas le slug, on lit l'AsyncLocalStorage
  // (posé par withTenantRequest / dashboard layout). En dehors d'un
  // contexte tenant → l'événement est skippé (pas d'écriture dans
  // `public.AccessLog` — drift cross-tenant interdit).
  const tenantSlug = entry.tenantSlug ?? getStoredTenantSlug();
  if (!tenantSlug) {
    // Côté SUPERADMIN ou rejet de login sans tenant : on log en console
    // pour observabilité mais on n'écrit pas en DB (le schéma admin n'a
    // pas de table équivalente à AccessLog ; à ajouter si besoin plus tard).
    console.info(
      `[audit] skip ${entry.action} (no tenant context)`,
      entry.actor.kind === "user" ? entry.actor.email : entry.actor.kind,
    );
    return Promise.resolve();
  }

  return withTenantSchema(tenantSlug, (tx) => tx.accessLog.create({ data }))
    .then(() => undefined)
    .catch((err) => {
      console.error("[audit] failed to record action:", err);
    });
}

const CSV_HEADERS = [
  "timestamp",
  "action",
  "actor_user_email",
  "actor_token_name",
  "ip_address",
  "organization_id",
  "project_id",
  "environment_id",
  "secret_key",
  "target_type",
  "target_id",
  "metadata",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "string"
      ? value
      : value instanceof Date
        ? value.toISOString()
        : JSON.stringify(value);
  // RFC 4180: wrap in double quotes if contains ", \n, or comma. Escape " as "".
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type CsvRow = {
  createdAt: Date;
  action: string;
  actorUserEmail: string | null;
  actorTokenName: string | null;
  ipAddress: string | null;
  organizationId: string | null;
  projectId: string | null;
  environmentId: string | null;
  secretKey: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
};

export function rowsToCsv(rows: CsvRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.createdAt),
        csvEscape(row.action),
        csvEscape(row.actorUserEmail),
        csvEscape(row.actorTokenName),
        csvEscape(row.ipAddress),
        csvEscape(row.organizationId),
        csvEscape(row.projectId),
        csvEscape(row.environmentId),
        csvEscape(row.secretKey),
        csvEscape(row.targetType),
        csvEscape(row.targetId),
        csvEscape(row.metadata),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
