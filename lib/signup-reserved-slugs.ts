// Slugs réservés — interdits comme tenant slug pour éviter collision
// avec les sous-domaines système et pages publiques.
//
// Partagé entre /api/signup/check-slug (vérif temps réel) et le server
// action /signup (vérif côté serveur à la soumission).

export const RESERVED_SIGNUP_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "blog",
  "cdn",
  "docs",
  "help",
  "login",
  "mail",
  "pricing",
  "public",
  "register",
  "signup",
  "static",
  "support",
  "vault",
  "www",
]);
