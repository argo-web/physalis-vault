// 2FA TOTP — helpers purs autour d'otplib v13.
//
// Le secret TOTP est chiffré au repos avec lib/crypto.ts (même ENCRYPTION_KEY
// que les secrets métier). Les backup codes sont bcrypt-hashés. Le hash et
// les opérations crypto sont gérés ici, mais l'IO DB est laissée aux routes.

import { generateSecret, generateURI, verify } from "otplib";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";

const APP_NAME = "Physalis";
const BACKUP_CODE_BYTES = 8; // 64 bits d'entropie, hex = 16 chars
const BACKUP_CODES_COUNT = 8;
const BCRYPT_ROUNDS = 12;

// Tolérance de ±30 s autour de la fenêtre courante pour gérer la dérive
// d'horloge entre serveur et téléphone.
const EPOCH_TOLERANCE = 30;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function generateOtpauthUrl(email: string, secret: string): string {
  return generateURI({
    issuer: APP_NAME,
    label: email,
    secret,
  });
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M" });
}

export async function verifyTotp(
  code: string,
  secret: string,
): Promise<boolean> {
  // otplib throw `TokenLengthError` si le token n'a pas la longueur attendue
  // (6 digits par défaut). Notre flow tente d'abord verifyTotp avant de
  // fallback sur les backup codes (16 chars hex). On catch les erreurs de
  // format pour retourner false plutôt que de crasher l'auth.
  try {
    const result = await verify({
      token: code.trim(),
      secret,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/**
 * Génère N backup codes plaintext. Format : `randomBytes(8).hex()` = 16 chars
 * lowercase, lisibles sans confusion.
 */
export function generateBackupCodes(count = BACKUP_CODES_COUNT): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(BACKUP_CODE_BYTES).toString("hex"),
  );
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));
}

/**
 * Vérifie un code candidat contre la liste de hashes en base. Retourne
 * l'index du hash qui matche (>= 0) ou -1 si aucun ne matche. Comparaisons
 * séquentielles (8 codes max → 8 × ~250 ms en pire cas).
 */
export async function findBackupCodeIndex(
  candidate: string,
  hashes: string[],
): Promise<number> {
  const trimmed = candidate.trim().toLowerCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(trimmed, hashes[i]!)) return i;
  }
  return -1;
}
