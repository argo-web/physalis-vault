// Tokens pour OneTimeShare. Format : `sv_share_<32 hex bytes>` = 256 bits
// d'entropie. Stocke uniquement le SHA-256 en base, jamais le brut.
// Le prefixe permet de distinguer les tokens dans les logs / scans.

import { createHash, randomBytes } from "crypto";

const TOKEN_PREFIX = "sv_share_";

export const SHARE_ALLOWED_TTLS = [900, 3600, 14400, 86400] as const; // 15min, 1h, 4h, 24h
export type ShareTtl = (typeof SHARE_ALLOWED_TTLS)[number];

export function isAllowedShareTtl(value: unknown): value is ShareTtl {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (SHARE_ALLOWED_TTLS as readonly number[]).includes(value)
  );
}

export function generateShareToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("hex");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isShareTokenFormat(value: string): boolean {
  return /^sv_share_[0-9a-f]{64}$/.test(value);
}
