// RBAC resolver pour les TeamVaultCollection (cf. coffres.md §Règles d'accès).
//
// Une collection est scopée à UNE org OU UN projet (XOR strict, garanti par
// CHECK constraint Postgres). La logique d'accès diffère :
//
//   ┌─────────────┬──────────────────────────────────────────────────────────┐
//   │ Scope org   │ • OrgADMIN / OrgOWNER → OWNER implicite                  │
//   │             │ • global ADMIN → OWNER implicite                         │
//   │             │ • TeamVaultMember explicite → role du member             │
//   │             │ • Sinon → 404 (jamais 403, anti-leak)                    │
//   ├─────────────┼──────────────────────────────────────────────────────────┤
//   │ Scope projet│ • OrgADMIN / OrgOWNER de l'org du projet → OWNER         │
//   │             │ • global ADMIN → OWNER                                   │
//   │             │ • ProjectMember : VIEWER → VIEWER, EDITOR → EDITOR,      │
//   │             │   OWNER → OWNER (mapping 1:1)                            │
//   │             │ • Sinon → 404                                            │
//   │             │ • TeamVaultMember sur ce type de collection : IGNORÉ     │
//   │             │   (validation app-level refuse leur création)            │
//   └─────────────┴──────────────────────────────────────────────────────────┘

import { NextResponse } from "next/server";
import type { ProjectRole, Role, VaultRole } from "@prisma/client";
import { prisma } from "./prisma";
import { requireUser, type AuthedUser } from "./api";
import { isPlatformAdmin } from "./roles";
import { withTenantSchema } from "./tenant";

const VAULT_ROLE_RANK: Record<VaultRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

const PROJECT_TO_VAULT: Record<ProjectRole, VaultRole> = {
  VIEWER: "VIEWER",
  EDITOR: "EDITOR",
  OWNER: "OWNER",
};

export type CollectionRow = {
  id: string;
  name: string;
  slug: string;
  organizationId: string | null;
  projectId: string | null;
};

export type CollectionAccess = {
  user: AuthedUser;
  collection: CollectionRow;
  role: VaultRole;
  /** Pour les audit logs : org du scope (ou de l'org parent si scope projet). */
  organizationId: string | null;
  /** Pour les audit logs : projet du scope si applicable, sinon null. */
  projectId: string | null;
};

export function hasVaultRole(actual: VaultRole, required: VaultRole): boolean {
  return VAULT_ROLE_RANK[actual] >= VAULT_ROLE_RANK[required];
}

/**
 * Calcule l'ensemble des `TeamVaultCollection.id` accessibles a un user
 * en lecture (VIEWER ou plus). Combine les 4 voies d'acces :
 *   1. Global ADMIN → toutes les collections
 *   2. OrgADMIN/OWNER → toutes les collections org de cette org + toutes
 *      les collections projet des projets de cette org
 *   3. TeamVaultMember explicite (role quelconque) → la collection
 *   4. ProjectMember (role quelconque) → toutes les collections du projet
 *
 * Utilise par /api/plugin/match pour agreger les coffres d'equipe dans
 * le bundle de l'extension. Ce helper ne fait PAS de match URL — c'est
 * au caller de filtrer les entries selon le hostname.
 */
export async function getAccessibleCollectionIds(
  userId: string,
  userRole: Role,
  tenantSlug: string | null,
): Promise<string[]> {
  // Wrap dans withTenantSchema(slug) pour router vers le bon schéma.
  // Si tenantSlug=null (cas théorique : token sans entrée dans
  // admin.token_index), on retourne un set vide — pas de fallback public.
  if (!tenantSlug) return [];
  return withTenantSchema(tenantSlug, async (tx) => {
    if (isPlatformAdmin(userRole)) {
      const all = await tx.teamVaultCollection.findMany({
        select: { id: true },
      });
      return all.map((c) => c.id);
    }

    // Toutes les requetes en parallele.
    const [direct, adminOrgs, projectMemberships] = await Promise.all([
      tx.teamVaultMember.findMany({
        where: { userId },
        select: { collectionId: true },
      }),
      tx.orgMember.findMany({
        where: { userId, role: { in: ["ADMIN", "OWNER"] } },
        select: { organizationId: true },
      }),
      tx.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      }),
    ]);

    const adminOrgIds = adminOrgs.map((o) => o.organizationId);
    const projectMemberIds = projectMemberships.map((p) => p.projectId);

    const collections = await tx.teamVaultCollection.findMany({
      where: {
        OR: [
          // 1. Membership direct sur la collection (via TeamVaultMember)
          { id: { in: direct.map((d) => d.collectionId) } },
          // 2. Collections org dont l'user est OrgADMIN/OWNER
          ...(adminOrgIds.length > 0
            ? [{ organizationId: { in: adminOrgIds } }]
            : []),
          // 3. Collections projet dont l'user est ProjectMember (any role)
          ...(projectMemberIds.length > 0
            ? [{ projectId: { in: projectMemberIds } }]
            : []),
          // 4. Collections projet dont le projet appartient a une org ou
          //    l'user est OrgADMIN/OWNER (heritage transitif)
          ...(adminOrgIds.length > 0
            ? [
                {
                  projectId: { not: null },
                  project: { organizationId: { in: adminOrgIds } },
                } as const,
              ]
            : []),
        ],
      },
      select: { id: true },
    });

    return collections.map((c) => c.id);
  });
}

/**
 * Resout l'acces a une collection org-scoped. Retourne soit `{ access }`
 * soit `{ error: NextResponse }` avec le bon code HTTP.
 *
 * Le 404 est volontairement utilise pour les cas "pas de droits" pour ne
 * pas leak l'existence de la collection a un user non autorise.
 */
export async function requireOrgCollectionAccess(
  orgSlug: string,
  collectionSlug: string,
  requiredRole: VaultRole = "VIEWER",
): Promise<{ access: CollectionAccess } | { error: NextResponse }> {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes;
  const { user } = userRes;

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });
  if (!org) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const collection = await prisma.teamVaultCollection.findUnique({
    where: {
      organizationId_slug: { organizationId: org.id, slug: collectionSlug },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      projectId: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });
  if (!collection) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  // Calcul du role effectif : org admin/owner OU global admin → OWNER
  // implicite ; sinon role TeamVaultMember si present.
  const orgRole = org.members[0]?.role;
  let effective: VaultRole | null = null;
  if (
    isPlatformAdmin(user.role) ||
    orgRole === "OWNER" ||
    orgRole === "ADMIN"
  ) {
    effective = "OWNER";
  } else {
    const memberRole = collection.members[0]?.role;
    if (memberRole) effective = memberRole;
  }

  if (!effective || !hasVaultRole(effective, requiredRole)) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return {
    access: {
      user,
      collection: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        organizationId: collection.organizationId,
        projectId: collection.projectId,
      },
      role: effective,
      organizationId: org.id,
      projectId: null,
    },
  };
}

/**
 * Resout l'acces a une collection project-scoped. RBAC herite directement
 * du projet : VIEWER projet → VIEWER collection, etc. Aucun role
 * TeamVaultMember n'est pris en compte ici (validation API refuse leur
 * creation sur ce type de collection).
 */
export async function requireProjectCollectionAccess(
  projectSlug: string,
  collectionSlug: string,
  requiredRole: VaultRole = "VIEWER",
): Promise<{ access: CollectionAccess } | { error: NextResponse }> {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes;
  const { user } = userRes;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: {
      id: true,
      organizationId: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
      organization: {
        select: {
          members: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!project) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const collection = await prisma.teamVaultCollection.findUnique({
    where: {
      projectId_slug: { projectId: project.id, slug: collectionSlug },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      projectId: true,
    },
  });
  if (!collection) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  // Calcul du role projet effectif (cf. requireProjectMember dans lib/api.ts).
  const projectRole = project.members[0]?.role;
  const orgRole = project.organization.members[0]?.role;

  let effective: VaultRole | null = null;
  if (
    isPlatformAdmin(user.role) ||
    orgRole === "OWNER" ||
    orgRole === "ADMIN"
  ) {
    effective = "OWNER";
  } else if (projectRole) {
    effective = PROJECT_TO_VAULT[projectRole];
  }

  if (!effective || !hasVaultRole(effective, requiredRole)) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return {
    access: {
      user,
      collection: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        organizationId: collection.organizationId,
        projectId: collection.projectId,
      },
      role: effective,
      organizationId: project.organizationId,
      projectId: project.id,
    },
  };
}

/**
 * Resout l'org parente par slug avec les memberships du user. Utilise pour
 * l'endpoint LIST des collections (POST création) ou la gestion des members.
 */
export async function requireOrgScope(
  orgSlug: string,
  requiredOrgRole: "MEMBER" | "DEV" | "ADMIN" | "OWNER" = "MEMBER",
): Promise<
  | {
      user: AuthedUser;
      organizationId: string;
      orgRole: "OWNER" | "ADMIN" | "DEV" | "MEMBER";
    }
  | { error: NextResponse }
> {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes;
  const { user } = userRes;

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });
  if (!org) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const ORG_RANK = { MEMBER: 1, DEV: 2, ADMIN: 3, OWNER: 4 } as const;
  const orgRole: "OWNER" | "ADMIN" | "DEV" | "MEMBER" | null =
    org.members[0]?.role ?? (isPlatformAdmin(user.role) ? "OWNER" : null);
  if (!orgRole || ORG_RANK[orgRole] < ORG_RANK[requiredOrgRole]) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return { user, organizationId: org.id, orgRole };
}

/**
 * Resout le projet parent par slug avec les memberships du user. Utilise
 * pour l'endpoint LIST des collections projet (POST creation).
 */
export async function requireProjectScope(
  projectSlug: string,
  requiredRole: ProjectRole = "VIEWER",
): Promise<
  | {
      user: AuthedUser;
      projectId: string;
      organizationId: string;
      role: ProjectRole;
    }
  | { error: NextResponse }
> {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes;
  const { user } = userRes;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: {
      id: true,
      organizationId: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
      organization: {
        select: {
          members: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!project) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const PROJECT_RANK = { VIEWER: 1, EDITOR: 2, OWNER: 3 } as const;
  const projectRole = project.members[0]?.role;
  const orgRole = project.organization.members[0]?.role;

  let effective: ProjectRole | null = null;
  if (
    isPlatformAdmin(user.role) ||
    orgRole === "OWNER" ||
    orgRole === "ADMIN"
  ) {
    effective = "OWNER";
  } else if (projectRole) {
    effective = projectRole;
  }

  if (!effective || PROJECT_RANK[effective] < PROJECT_RANK[requiredRole]) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return {
    user,
    projectId: project.id,
    organizationId: project.organizationId,
    role: effective,
  };
}
