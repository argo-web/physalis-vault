// Tests unitaires des fonctions pures de lib/password-reset.
// (Format token, hash, entropie. Le DB-side est testé en intégration.)
//
// Couvre proposal Auth #12 (single-use) + #13 (expiration) via la branche
// pure ; la branche DB est dans tests/integ/password-reset.test.ts.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  generateResetToken,
  hashResetToken,
  isResetTokenFormat,
} from "@/lib/password-reset";

describe("lib/password-reset — fonctions pures", () => {
  describe("generateResetToken", () => {
    it("retourne un token au format `sv_reset_<64 hex>`", () => {
      const token = generateResetToken();
      expect(token).toMatch(/^sv_reset_[0-9a-f]{64}$/);
    });

    it("génère des tokens uniques (entropie suffisante sur 1000 itérations)", () => {
      const set = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        set.add(generateResetToken());
      }
      expect(set.size).toBe(1000);
    });
  });

  describe("hashResetToken", () => {
    it("retourne un SHA-256 hexadécimal (64 chars)", () => {
      const hash = hashResetToken("sv_reset_" + "a".repeat(64));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("est déterministe (même input → même hash)", () => {
      const token = generateResetToken();
      expect(hashResetToken(token)).toBe(hashResetToken(token));
    });

    it("matche l'implémentation SHA-256 de référence", () => {
      const token = "sv_reset_" + "0".repeat(64);
      const expected = createHash("sha256").update(token).digest("hex");
      expect(hashResetToken(token)).toBe(expected);
    });

    it("le hash ne ressemble jamais au token brut (pas de fuite triviale)", () => {
      const token = generateResetToken();
      expect(hashResetToken(token)).not.toBe(token);
      expect(hashResetToken(token).startsWith("sv_reset_")).toBe(false);
    });
  });

  describe("isResetTokenFormat", () => {
    it("accepte un token bien formé", () => {
      const token = generateResetToken();
      expect(isResetTokenFormat(token)).toBe(true);
    });

    it("refuse un préfixe différent", () => {
      const token = "sv_share_" + "0".repeat(64);
      expect(isResetTokenFormat(token)).toBe(false);
    });

    it("refuse une longueur de hex incorrecte (trop court / trop long)", () => {
      expect(isResetTokenFormat("sv_reset_abc")).toBe(false);
      expect(isResetTokenFormat("sv_reset_" + "0".repeat(63))).toBe(false);
      expect(isResetTokenFormat("sv_reset_" + "0".repeat(65))).toBe(false);
    });

    it("refuse les caractères non-hex (majuscules, alpha hors a-f)", () => {
      expect(isResetTokenFormat("sv_reset_" + "A".repeat(64))).toBe(false);
      expect(isResetTokenFormat("sv_reset_" + "g".repeat(64))).toBe(false);
    });

    it("refuse les chaînes vides ou non-string-like", () => {
      expect(isResetTokenFormat("")).toBe(false);
      expect(isResetTokenFormat("sv_reset_")).toBe(false);
    });
  });
});
