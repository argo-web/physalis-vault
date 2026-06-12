// Helpers pour les rôles globaux (User.role). Distincts des rôles d'org
// (OrgRole) et de projet (ProjectRole).
//
//   ADMIN       — god-mode tenant (legacy testing)
//   MEMBER      — défaut, pas de pouvoir spécial
//   SUPERADMIN  — opérateur de la plateforme Physalis : /admin dashboard +
//                 hérite des pouvoirs ADMIN tenant pour pouvoir tester /
//                 dépanner.
//
// Convention : `isPlatformAdmin` couvre toutes les zones où un god-mode
// tenant est attendu (visibilite cross-org, lecture de tous les secrets…).
// `isSuperadmin` est strictement réservé aux gates `/admin`.

import type { Role, OrgRole } from "@prisma/client";

export function isPlatformAdmin(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

/**
 * Vrai si le rôle d'org dispose des droits DEV. ADMIN_DEV hérite de TOUS les
 * droits DEV (EDITOR implicite sur les projets, accès vault DEV, vue projets,
 * tokens, etc.) — en plus du CRUD serveurs/secrets d'org géré ailleurs.
 * À utiliser partout où un droit DEV était gardé par `role === "DEV"`.
 */
export function hasDevPrivileges(role: OrgRole | null | undefined): boolean {
  return role === "DEV" || role === "ADMIN_DEV";
}

export function isSuperadmin(role: Role | string | null | undefined): boolean {
  return role === "SUPERADMIN";
}
