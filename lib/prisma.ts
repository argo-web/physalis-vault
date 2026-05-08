// Trois clients Prisma — voir prisma/schema.prisma + prisma/tenant-schema.prisma
// pour le contexte architectural.
//
//   prisma       — client TENANT STRICT. Émis depuis tenant-schema.prisma
//                  (pas de multiSchema, queries non-qualifiées). Chaque
//                  opération est interceptée et exécutée dans une
//                  transaction qui pose `SET LOCAL search_path TO
//                  "client_<slug>", "public"` au préalable. Le slug est
//                  lu depuis AsyncLocalStorage (lib/tenant-context.ts).
//                  Si le contexte est absent → throw (pas de fallback
//                  silencieux sur public, sécurité critique).
//
//   basePrisma   — client TENANT brut (sans extension). À utiliser
//                  uniquement quand on a besoin de poser le search_path
//                  manuellement OU d'opérer hors contexte tenant
//                  (auth.ts authorize, lib/provisioning.ts).
//
//   adminPrisma  — client ADMIN (multiSchema). Émet du SQL qualifié
//                  (`"admin"."clients"`). Aucun lien avec le contexte
//                  tenant — séparation stricte.

import { PrismaClient, Prisma as TenantPrismaTypes } from "@prisma/client";
import { PrismaClient as AdminPrismaClient } from "../node_modules/.prisma/admin-client";
import { getStoredTenantSlug } from "./tenant-context";
import { getTenantPrisma } from "./tenant-prisma";
import { isValidClientSlug } from "./validation";

const globalForPrisma = globalThis as unknown as {
  basePrisma: PrismaClient | undefined;
  adminPrisma: AdminPrismaClient | undefined;
};

/** Client tenant brut — sans auto-injection search_path. */
export const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/**
 * Client TENANT-AWARE — chaque opération est dispatchée vers le PrismaClient
 * du tenant courant (lib/tenant-prisma.ts), instancié avec
 * `?schema=client_<slug>` dans son URL. Prisma qualifie alors les queries
 * ORM avec le bon schéma.
 *
 * L'ancien design (un seul client + SET LOCAL search_path) ne marchait pas :
 * Prisma ORM qualifie systématiquement avec le schéma de l'URL (default
 * "public") et ignore le SET LOCAL pour les queries non-raw.
 *
 * Throw si pas de slug en contexte (sécurité : pas de fallback public).
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, model, operation }) {
        // Priorité : AsyncLocalStorage (posé par requireUser /
        // requireTenantContext / withTenantRoute / withTenantAction).
        let slug = getStoredTenantSlug();
        // Fallback : lecture session NextAuth. Nécessaire pour les
        // Server Components RSC où `enterWith` posé dans la layout
        // ne propage pas systématiquement aux pages enfants en build
        // prod (Next.js crée des async resources distincts pour
        // chaque sous-arbre RSC).
        //
        // Import dynamique pour casser le cycle prisma ↔ auth ↔ prisma.
        // Le coût d'auth() est amorti par React `cache()` : 1 seul
        // appel par requête même si appelé 100 fois.
        if (!slug) {
          try {
            const { auth } = await import("./auth");
            const session = await auth();
            slug = session?.user?.tenantSlug ?? null;
          } catch {
            // hors contexte de requête (cron, scripts, tests) →
            // session indisponible, on passe au throw ci-dessous.
            slug = null;
          }
        }
        if (!slug) {
          throw new Error(
            `[prisma] Tenant context required for ${model}.${operation}. ` +
              `Wrap the call in withTenantRequest() / runWithTenant() / use basePrisma explicitly.`,
          );
        }
        if (!isValidClientSlug(slug)) {
          throw new Error(`[prisma] Invalid tenant slug in store: ${slug}`);
        }
        const tenantClient = getTenantPrisma(slug);
        // ⚠️ Prisma `model` arrive en PascalCase ("User", "OrgMember")
        // dans $allOperations, mais les méthodes du client sont en
        // camelCase (client.user, client.orgMember) — d'où le lowercase
        // du 1er char.
        const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
        return (
          tenantClient as unknown as Record<
            string,
            Record<string, (a: unknown) => Promise<unknown>>
          >
        )[modelKey]![operation]!(args);
      },
    },
  },
});

/** Client ADMIN — pas d'auto-injection, toujours qualifié `"admin"."..."`. */
export const adminPrisma =
  globalForPrisma.adminPrisma ??
  new AdminPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.adminPrisma = adminPrisma;
}

// Re-exports admin types — pratique pour les pages /admin et lib/* (un
// seul import depuis @/lib/prisma).
export type {
  Client,
  ClientStatus,
  Plan,
  Prisma as AdminPrisma,
  Subscription,
  SubscriptionStatus,
  AuditLog,
  TokenIndex,
  TokenKind,
  OidcPolicy,
} from "../node_modules/.prisma/admin-client";

// Re-export Prisma namespace tenant pour les types côté tenant
// (ex: TransactionClient pour les helpers withTenantSchema).
export { TenantPrismaTypes as Prisma };
