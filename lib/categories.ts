// Catégories de Secret — liste hardcodée + ordre d'affichage figé.
//
// L'ordre du tableau est l'ordre d'affichage dans la liste des secrets
// (groupé par catégorie). Les secrets sans catégorie (`category === null`)
// sont affichés en dernier sous le label `UNCATEGORIZED_LABEL`.
//
// La validation côté API n'autorise que les valeurs présentes dans
// `SECRET_CATEGORIES`. Pour ajouter une catégorie : l'ajouter ici à la
// position voulue, ajouter le label en accord, redéployer. Aucune
// migration DB nécessaire — le champ `Secret.category` est un text libre
// avec validation app-level.

export const SECRET_CATEGORIES = [
  "ports",
  "database",
  "auth",
  "services",
  "email",
  "infra",
  "application",
] as const;

export type SecretCategory = (typeof SECRET_CATEGORIES)[number];

export const SECRET_CATEGORY_LABELS: Record<SecretCategory, string> = {
  ports: "Ports",
  database: "Database",
  auth: "Auth",
  services: "Services",
  email: "Email",
  infra: "Infra",
  application: "Application",
};

export const UNCATEGORIZED_LABEL = "Sans catégorie";

export function isValidCategory(value: unknown): value is SecretCategory {
  return (
    typeof value === "string" &&
    (SECRET_CATEGORIES as readonly string[]).includes(value)
  );
}
