// lib/tags.ts — validation des tags techniques (Phase 11b).
//
// Tags = identifiants techniques libres pour le filtrage dans les
// intégrations N8n / Make. Ex: ["postgres", "production"], ["stripe"].
// Distinct de `Secret.category` (organisation visuelle UI hardcodée).

const TAG_MAX_LEN = 50;
const TAGS_MAX_COUNT = 20;
// Tags : alphanumérique + tiret/underscore + point. Pas d'espace ni
// caractère exotique pour rester filtrable proprement côté SQL/N8n.
const TAG_RE = /^[a-z0-9][a-z0-9._-]{0,49}$/;

/** Normalise un tableau de tags en input (lowercase, dédupe, trim).
 *  Renvoie null si invalide (longueur dépassée, format non conforme). */
export function normalizeTags(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  if (input.length > TAGS_MAX_COUNT) return null;
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t.length > TAG_MAX_LEN) return null;
    if (!TAG_RE.test(t)) return null;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export const TAG_VALIDATION_ERROR = `tags must be an array of <= ${TAGS_MAX_COUNT} entries, each 1-${TAG_MAX_LEN} chars matching ^[a-z0-9][a-z0-9._-]*$`;
