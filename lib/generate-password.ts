// Generateur de mot de passe universel — fonctionne en Node et browser
// (utilise globalThis.crypto.getRandomValues, Web Crypto API).
//
// Format : base64url (62 alphanum + `-` + `_`), pas de symboles. Suffisant
// cryptographiquement (>= 12 chars = 72 bits d'entropie minimum) et accepte
// par 95% des sites. Symboles repoussés en V2 si besoin (cf. coffres.md
// section Todo V2).

const MIN_LENGTH = 12;
const MAX_LENGTH = 64;
const DEFAULT_LENGTH = 24;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  // btoa est universel (Node 16+, browser).
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePassword(length: number = DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(
      `password length must be an integer in [${MIN_LENGTH}, ${MAX_LENGTH}]`,
    );
  }
  // base64url = 6 bits par char, donc on a besoin de ceil(length * 6 / 8)
  // bytes pour avoir au moins `length` chars apres encoding.
  const byteCount = Math.ceil((length * 6) / 8);
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes).slice(0, length);
}

export const PASSWORD_LENGTH_BOUNDS = {
  min: MIN_LENGTH,
  max: MAX_LENGTH,
  default: DEFAULT_LENGTH,
} as const;
