// Stub self-host : un seul tenant, plan virtuel "DEDICATED" (toutes
// les features activées). Évite les pulls vers admin.clients.

import type { Plan } from "./plans";

export async function getPlanForTenant(
  _slug?: string | null,
): Promise<Plan> {
  return "DEDICATED";
}
