// Stub self-host : un seul PrismaClient — on retourne toujours le client
// global, indépendamment du slug demandé.

import { prisma } from "./prisma";

export function getTenantPrisma(_slug: string) {
  return prisma;
}

export async function disconnectTenantPrisma(_slug: string): Promise<void> {
  // no-op
}
