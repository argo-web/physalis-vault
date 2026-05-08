// Helpers Web Crypto pour le chiffrement zero-knowledge des OneTimeShare.
//
// Tournent UNIQUEMENT cote navigateur (pas de "use server" possible). Le
// serveur ne possede ni la cle ni la fonction de dechiffrement — il stocke
// juste le ciphertext + iv que le client a produit.
//
// Architecture :
//   1. CREATE  : cle aleatoire generee cote navigateur → encrypt → POST
//      ciphertext + iv. La cle n'est JAMAIS envoyee au serveur. L'URL
//      retournee a la forme `https://.../share/<token>#<keyB64>`.
//   2. CONSUME : navigateur extrait la cle du fragment `#`, GET le
//      ciphertext+iv, decrypt en local, affiche.
//
// Le fragment `#` n'est JAMAIS envoye dans les requetes HTTP (specifie
// par RFC 3986) — il vit uniquement cote navigateur. Le serveur ne peut
// donc pas le logger meme par accident.

const ALGO = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12;

function bytesToBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Genere une cle AES-256 aleatoire et l'exporte en base64url. La cle reste
 * cote navigateur (a placer dans le fragment `#` de l'URL).
 */
export async function generateShareKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: ALGO, length: KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return bytesToBase64Url(raw);
}

/**
 * Chiffre un texte avec une cle base64url. Retourne `{ ciphertext, iv }`
 * en base64url, prets a etre envoyes au serveur.
 */
export async function encryptShareContent(
  plaintext: string,
  keyB64Url: string,
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = base64UrlToBytes(keyB64Url);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as Uint8Array<ArrayBuffer>,
    ALGO,
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: ALGO, iv: iv as Uint8Array<ArrayBuffer> },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return {
    ciphertext: bytesToBase64Url(ct),
    iv: bytesToBase64Url(iv),
  };
}

/**
 * Dechiffre un ciphertext+iv avec une cle base64url. Lance si la cle est
 * mauvaise ou le ciphertext corrompu (auth tag GCM).
 */
export async function decryptShareContent(
  ciphertextB64Url: string,
  ivB64Url: string,
  keyB64Url: string,
): Promise<string> {
  const keyBytes = base64UrlToBytes(keyB64Url);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as Uint8Array<ArrayBuffer>,
    ALGO,
    false,
    ["decrypt"],
  );
  const iv = base64UrlToBytes(ivB64Url);
  const ct = base64UrlToBytes(ciphertextB64Url);
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv as Uint8Array<ArrayBuffer> },
    key,
    ct as Uint8Array<ArrayBuffer>,
  );
  return new TextDecoder().decode(plain);
}
