import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateToken, hashToken } from "@/lib/auth-token";

describe("lib/auth-token — fonctions pures", () => {
  describe("generateToken", () => {
    it("retourne un token au format `sv_<64 hex>`", () => {
      const token = generateToken();
      expect(token).toMatch(/^sv_[0-9a-f]{64}$/);
      expect(token.length).toBe(67); // "sv_" + 64
    });

    it("génère des tokens uniques (entropie suffisante)", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        tokens.add(generateToken());
      }
      expect(tokens.size).toBe(1000);
    });
  });

  describe("hashToken", () => {
    it("retourne un hash SHA-256 hexadécimal (64 chars)", () => {
      const hash = hashToken("sv_anything");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("est déterministe (même input → même hash)", () => {
      const token = generateToken();
      const a = hashToken(token);
      const b = hashToken(token);
      expect(a).toBe(b);
    });

    it("matche l'implémentation SHA-256 de référence", () => {
      const token = "sv_test";
      const expected = createHash("sha256").update(token).digest("hex");
      expect(hashToken(token)).toBe(expected);
    });

    it("deux tokens différents produisent des hashs différents", () => {
      const a = hashToken(generateToken());
      const b = hashToken(generateToken());
      expect(a).not.toBe(b);
    });

    it("le hash diffère du token (pas de fuite triviale)", () => {
      const token = generateToken();
      expect(hashToken(token)).not.toBe(token);
      // Ni un sous-ensemble du token (au-delà de la taille du préfixe).
      expect(hashToken(token).startsWith("sv_")).toBe(false);
    });
  });
});
