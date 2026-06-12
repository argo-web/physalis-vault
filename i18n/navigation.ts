// Helpers de navigation next-intl — wrappent `next/link` et `next/navigation`
// pour préfixer automatiquement la locale courante dans les paths internes.
//
// Indispensable quand on est sur un sous-domaine tenant : un `router.push("/projects")`
// brut (sans locale) déclenche le middleware locale routing qui redirige vers
// `/{locale}/projects`, mais le calcul de l'URL absolue utilise `req.url` qui,
// derrière Cloudflare, perd le host original et renvoie vers le portail
// partagé (vault.physalis.cloud) — l'user se retrouve éjecté de son sous-domaine.
//
// Utilisation : remplacer `import Link from "next/link"` par
// `import { Link } from "@/i18n/navigation"`, et idem pour useRouter/usePathname/redirect.

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
