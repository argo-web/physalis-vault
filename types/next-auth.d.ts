import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /**
       * Phase 3 — slug du client SaaS auquel appartient l'utilisateur,
       * sert à router les requêtes Prisma vers le schéma `client_<slug>`
       * via withTenantSchema(). `null` = utilisateur legacy (schéma
       * `public`) ou superadmin (hors tenant).
       */
      tenantSlug: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    tenantSlug?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    tenantSlug?: string | null;
  }
}
