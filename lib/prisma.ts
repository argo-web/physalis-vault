// Self-host single-tenant : un seul PrismaClient pointant sur le schéma
// principal (généré depuis prisma/schema.prisma).
//
// `prisma`       — alias de référence, à utiliser partout
// `basePrisma`   — alias historique (compatibilité avec le code SaaS)
// `adminPrisma`  — alias historique. En self-host, les modèles admin
//                  (Client, Subscription, AuditLog, etc.) n'existent pas
//                  dans la DB. Les stubs typés ci-dessous permettent au
//                  code de compiler ; toute opération réelle sur ces
//                  modèles échouera au runtime (à brancher dans les
//                  patches de routes qui en dépendent).

import { PrismaClient, Prisma as PrismaTypes } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const basePrisma = prisma;
export const adminPrisma = prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export du namespace Prisma (types runtime — TransactionClient, etc.)
export { PrismaTypes as Prisma };

export type TokenKind = "MACHINE" | "PLUGIN" | "SHARE";

export type TokenIndex = {
  tokenHash: string;
  tenantSlug: string;
  kind: TokenKind;
  createdAt: Date;
};
