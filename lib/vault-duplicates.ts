// Détection de doublons dans le coffre perso (V2.1).
//
// Critère : même domaine canonique + même login (case-insensitive).
// Ignore les entries sans domaine OU sans login (pas comparable).
// Calcul O(n) — purement client-side, pas de change API.

export type DuplicateCandidate = {
  id: string;
  url: string | null;
  username: string | null;
};

/** Extrait le domaine canonique d'une URL. Strip protocole + www + path
 *  + port. Renvoie chaîne vide si url invalide ou null. */
export function extractDomain(url: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  const hasProtocol = /^[a-z]+:\/\//i.test(trimmed);
  try {
    const u = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Fallback : "example.com/path" sans protocole valide
    const m = trimmed.toLowerCase().match(/^([a-z0-9.-]+)/);
    return m ? m[1].replace(/^www\./, "") : "";
  }
}

/** Renvoie l'ensemble des IDs en doublon (groupe de taille >= 2 sur
 *  domain + login). */
export function computeDuplicates(entries: DuplicateCandidate[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const e of entries) {
    const domain = extractDomain(e.url);
    const login = (e.username ?? "").trim().toLowerCase();
    if (!domain || !login) continue;
    const key = `${domain}::${login}`;
    const arr = groups.get(key) ?? [];
    arr.push(e.id);
    groups.set(key, arr);
  }
  const dup = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length >= 2) for (const id of ids) dup.add(id);
  }
  return dup;
}
