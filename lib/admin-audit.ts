// Stub self-host : pas de schéma admin, donc pas d'audit_log admin.
// L'audit utilisateur (lib/audit.ts → AccessLog) reste actif.
// Variants alignés sur le source SaaS.

export type AdminAuditAction =
  | "client.created"
  | "client.plan_changed"
  | "client.quotas_updated"
  | "client.comped_toggled"
  | "client.suspended"
  | "client.reactivated"
  | "client.trial_extended"
  | "client.deleted"
  | "schema.provisioned"
  | "schema.deleted"
  | "org.quota_exceeded"
  | "user.quota_exceeded";

export async function logAdminAction(_params: {
  action: AdminAuditAction;
  clientId: string | null;
  actor: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // no-op
}
