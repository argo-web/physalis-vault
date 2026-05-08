// Stub self-host : pas de feature gating, tout est activé.

import type { NextResponse } from "next/server";
import type { PlanFeature } from "./plans";

export async function requireFeature(
  _feature: PlanFeature,
  _tenantSlug: string | null,
): Promise<NextResponse | null> {
  return null;
}
