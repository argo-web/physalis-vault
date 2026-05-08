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

// ─── Stubs des types admin (self-host n'a pas le schema admin) ───────
// Ces types existaient dans le SaaS via le client `admin-client` Prisma.
// En self-host on les déclare comme types vides/literal pour que les
// imports `import type { Plan } from "@/lib/prisma"` continuent à
// compiler. Les valeurs runtime ne sont jamais utilisées.

export type Plan = "FREE" | "SHARED" | "DEDICATED";
export type ClientStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED";
export type TokenKind = "MACHINE" | "PLUGIN" | "SHARE";

export type Client = {
  id: string;
  slug: string;
  name: string;
  plan: Plan;
  status: ClientStatus;
  maxOrgs: number;
  maxUsers: number;
  comped: boolean;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Subscription = {
  id: string;
  clientId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  action: string;
  actorId: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type TokenIndex = {
  tokenHash: string;
  tenantSlug: string;
  kind: TokenKind;
  createdAt: Date;
};

export type OidcPolicy = {
  id: string;
  tenantSlug: string;
  repo: string;
  workflow: string;
  branch: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
};

// Namespace AdminPrisma — utilisé pour les types `WhereInput` etc.
// dans le code SaaS. En self-host, on aliase sur le namespace tenant.
export type AdminPrisma = typeof PrismaTypes;
