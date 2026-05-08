// Phase 9 — Helpers WebCrypto pour SecretRequest (browser-safe).
//
// Crypto : ECDH P-256 + AES-GCM 256.
//
// Côté serveur (création) : génère une paire ECDH éphémère, stocke la
// PUBLIQUE en base, RETOURNE la PRIVÉE à l'admin (jamais persistée).
//
// Côté navigateur du destinataire externe : récupère la pub serveur,
// génère SA paire éphémère, dérive AES-256-GCM via ECDH(privateClient,
// pubServer), chiffre le secret, envoie {ciphertext, iv, ephemeralPubClient}.
//
// Côté admin (reveal) : récupère {ciphertext, iv, ephemeralPubClient},
// dérive AES-256-GCM via ECDH(privateAdmin, ephemeralPubClient), déchiffre
// localement dans le navigateur — le ciphertext ne sort jamais du navigateur.
//
// Ce fichier est browser-only (utilise `crypto.subtle`). Pour les tests
// Node, vitest avec `happy-dom` ou `node:crypto.webcrypto` fait l'affaire.

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** Buffer → base64 url-safe sans padding (pratique pour transport URL/JSON). */
function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  // .buffer est un ArrayBuffer (pas SharedArrayBuffer) car on vient de
  // créer le Uint8Array nous-mêmes — TypeScript ne le sait pas, on cast.
  return bytes.buffer as ArrayBuffer;
}

// ─── Key generation ─────────────────────────────────────────────────

/**
 * Génère une paire ECDH P-256 éphémère.
 * Retourne les clés sous forme JWK sérialisée JSON pour transport (la
 * privée doit être traitée comme un secret strict côté caller).
 */
export async function generateEcdhKeypair(): Promise<{
  publicJwk: string;
  privateJwk: string;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return {
    publicJwk: JSON.stringify(pub),
    privateJwk: JSON.stringify(priv),
  };
}

async function importPublicJwk(json: string): Promise<CryptoKey> {
  const jwk = JSON.parse(json) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function importPrivateJwk(json: string): Promise<CryptoKey> {
  const jwk = JSON.parse(json) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

/**
 * Dérive une clé AES-GCM 256 bits depuis (privKey, pubKey) ECDH.
 * Algorithme déterministe : (privA, pubB) = (privB, pubA).
 */
async function deriveAesKey(
  privateJwk: string,
  publicJwk: string,
): Promise<CryptoKey> {
  const priv = await importPrivateJwk(privateJwk);
  const pub = await importPublicJwk(publicJwk);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    priv,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── Encryption / decryption ────────────────────────────────────────

export type EncryptedPayload = {
  /** Ciphertext base64. */
  ciphertext: string;
  /** IV base64 (12 bytes). */
  iv: string;
  /** Clé publique éphémère du chiffreur, JWK sérialisée JSON. */
  ephemeralPublicJwk: string;
};

/**
 * Chiffre un secret pour le destinataire (= la clé publique serveur).
 * Génère une paire ECDH éphémère côté chiffreur, retourne aussi la pub.
 *
 * Appelé côté navigateur du tiers externe sur la page `/request/[token]`.
 */
export async function encryptForRecipient(
  plaintext: string,
  recipientPublicJwk: string,
): Promise<EncryptedPayload> {
  const ephemeral = await generateEcdhKeypair();
  const aesKey = await deriveAesKey(ephemeral.privateJwk, recipientPublicJwk);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ENC.encode(plaintext),
  );

  return {
    ciphertext: bufToB64(ciphertext),
    iv: bufToB64(iv),
    ephemeralPublicJwk: ephemeral.publicJwk,
  };
}

/**
 * Déchiffre un secret reçu, à partir de la clé privée du destinataire
 * (= l'admin) et de la clé publique éphémère du chiffreur.
 *
 * Appelé côté navigateur de l'admin au moment du "Révéler".
 */
export async function decryptFromSender(
  payload: EncryptedPayload,
  recipientPrivateJwk: string,
): Promise<string> {
  const aesKey = await deriveAesKey(
    recipientPrivateJwk,
    payload.ephemeralPublicJwk,
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(payload.iv) },
    aesKey,
    b64ToBuf(payload.ciphertext),
  );
  return DEC.decode(plain);
}
