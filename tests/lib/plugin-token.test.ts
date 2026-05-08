import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generatePluginToken,
  hashPluginToken,
  isPluginTokenFormat,
  getPluginSessionTtl,
  isAllowedTtl,
  ALLOWED_TTLS,
} from "@/lib/plugin-token";

describe("lib/plugin-token", () => {
  describe("generatePluginToken", () => {
    it("retourne un token au format `sv_plugin_<64 hex>`", () => {
      const t = generatePluginToken();
      expect(t).toMatch(/^sv_plugin_[0-9a-f]{64}$/);
    });

    it("genere des tokens distincts a chaque appel (entropie)", () => {
      const set = new Set();
      for (let i = 0; i < 1000; i++) {
        set.add(generatePluginToken());
      }
      expect(set.size).toBe(1000);
    });
  });

  describe("hashPluginToken", () => {
    it("retourne un SHA-256 deterministe (64 hex chars)", () => {
      const t = "sv_plugin_" + "a".repeat(64);
      const h1 = hashPluginToken(t);
      const h2 = hashPluginToken(t);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("le hash n'inclut jamais le token brut", () => {
      const t = generatePluginToken();
      const h = hashPluginToken(t);
      expect(h).not.toContain(t);
      expect(h).not.toContain(t.slice(10)); // partie hex du token
    });

    it("hashes distincts pour tokens distincts", () => {
      const a = generatePluginToken();
      const b = generatePluginToken();
      expect(hashPluginToken(a)).not.toBe(hashPluginToken(b));
    });
  });

  describe("isPluginTokenFormat", () => {
    it("accepte un token bien forme", () => {
      expect(isPluginTokenFormat(generatePluginToken())).toBe(true);
    });

    it("refuse les tokens machine `sv_<hex>`", () => {
      expect(isPluginTokenFormat("sv_" + "a".repeat(64))).toBe(false);
    });

    it("refuse les longueurs incorrectes", () => {
      expect(isPluginTokenFormat("sv_plugin_" + "a".repeat(63))).toBe(false);
      expect(isPluginTokenFormat("sv_plugin_" + "a".repeat(65))).toBe(false);
      expect(isPluginTokenFormat("sv_plugin_")).toBe(false);
      expect(isPluginTokenFormat("")).toBe(false);
    });

    it("refuse des caracteres non-hex", () => {
      expect(isPluginTokenFormat("sv_plugin_" + "Z".repeat(64))).toBe(false);
      expect(isPluginTokenFormat("sv_plugin_" + "g".repeat(64))).toBe(false);
    });

    it("refuse une majuscule dans la partie hex", () => {
      const t = "sv_plugin_" + "A".repeat(64);
      expect(isPluginTokenFormat(t)).toBe(false);
    });
  });

  describe("isAllowedTtl", () => {
    it("accepte les 3 valeurs autorisees", () => {
      expect(isAllowedTtl(3600)).toBe(true); // 1h
      expect(isAllowedTtl(14400)).toBe(true); // 4h
      expect(isAllowedTtl(28800)).toBe(true); // 8h
    });

    it("la liste est exactement [3600, 14400, 28800]", () => {
      expect([...ALLOWED_TTLS]).toEqual([3600, 14400, 28800]);
    });

    it("refuse une valeur hors liste", () => {
      expect(isAllowedTtl(7200)).toBe(false); // 2h, pas autorise
      expect(isAllowedTtl(86400)).toBe(false); // 24h, pas autorise
      expect(isAllowedTtl(0)).toBe(false);
      expect(isAllowedTtl(-3600)).toBe(false);
    });

    it("refuse les types non-numeriques", () => {
      expect(isAllowedTtl("3600")).toBe(false);
      expect(isAllowedTtl(null)).toBe(false);
      expect(isAllowedTtl(undefined)).toBe(false);
      expect(isAllowedTtl({})).toBe(false);
      expect(isAllowedTtl([])).toBe(false);
    });

    it("refuse les flottants meme tres proches d'une valeur valide", () => {
      expect(isAllowedTtl(3600.5)).toBe(false);
      expect(isAllowedTtl(14400.0001)).toBe(false);
    });

    it("refuse NaN et Infinity", () => {
      expect(isAllowedTtl(NaN)).toBe(false);
      expect(isAllowedTtl(Infinity)).toBe(false);
    });
  });

  describe("getPluginSessionTtl", () => {
    const original = process.env.PLUGIN_SESSION_TTL;

    beforeEach(() => {
      delete process.env.PLUGIN_SESSION_TTL;
    });

    afterEach(() => {
      if (original !== undefined) {
        process.env.PLUGIN_SESSION_TTL = original;
      } else {
        delete process.env.PLUGIN_SESSION_TTL;
      }
    });

    it("defaut 14400s (4h) si l'env var est absente", () => {
      expect(getPluginSessionTtl()).toBe(14400);
    });

    it("respecte la valeur env si entier positif", () => {
      process.env.PLUGIN_SESSION_TTL = "300";
      expect(getPluginSessionTtl()).toBe(300);
    });

    it("fallback au defaut si valeur invalide", () => {
      process.env.PLUGIN_SESSION_TTL = "abc";
      expect(getPluginSessionTtl()).toBe(14400);
      process.env.PLUGIN_SESSION_TTL = "0";
      expect(getPluginSessionTtl()).toBe(14400);
      process.env.PLUGIN_SESSION_TTL = "-100";
      expect(getPluginSessionTtl()).toBe(14400);
    });
  });
});
