// Helpers de validation/normalisation pour les secrets TOTP de sites tiers.
//
// On accepte deux formats en entree :
//   1. Secret base32 brut (ex. "JBSWY3DPEHPK3PXP")
//   2. URI otpauth:// complet (ex. "otpauth://totp/Acme:alice@example.com?secret=JBSWY...&issuer=Acme")
//
// Le retour est UN secret base32 normalise (uppercase, sans espaces). Pour
// la V1, on ignore les parametres algorithm/digits/period des URI otpauth
// — on suppose les defauts standards (SHA1 / 6 digits / 30s) qui couvrent
// >99% des sites. Si un cas non-standard apparait plus tard, on stockera
// les options dans un champ JSON dedie sans casser l'existant.

const BASE32_RE = /^[A-Z2-7]+=*$/;

/**
 * Valide qu'une chaine est du base32 valide (RFC 4648). Permet padding.
 */
export function isBase32(s: string): boolean {
  if (!s) return false;
  // Longueur minimale raisonnable pour un secret TOTP : 80 bits = 16 chars
  // base32. La plupart des sites utilisent 80-160 bits. On accepte 8+ pour
  // ne pas etre trop strict (certains tests utilisent des secrets courts).
  if (s.length < 8) return false;
  return BASE32_RE.test(s);
}

/**
 * Normalise un secret saisi par l'utilisateur :
 *   - Strip espaces et tirets (formats "JBSW Y3DP EHPK 3PXP")
 *   - Uppercase
 *   - Verifie base32
 */
function normalizeSecret(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  return isBase32(cleaned) ? cleaned : null;
}

/**
 * Parse une URI otpauth:// et retourne le secret normalise.
 * Retourne null si l'URI est invalide ou ne contient pas de secret valide.
 */
function parseOtpauthUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "otpauth:") return null;
  // url.host pour otpauth:// est "totp" ou "hotp" — on ne supporte que totp
  // V1. Pour hotp, le compteur n'est pas time-based donc inutilisable
  // automatiquement par l'extension.
  if (url.host !== "totp") return null;
  const secretParam = url.searchParams.get("secret");
  if (!secretParam) return null;
  return normalizeSecret(secretParam);
}

/**
 * Parse une entree utilisateur (secret brut OU otpauth://) vers un secret
 * base32 normalise. Retourne null si invalide.
 */
export function parseTotpInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("otpauth://")) {
    return parseOtpauthUrl(trimmed);
  }
  return normalizeSecret(trimmed);
}
