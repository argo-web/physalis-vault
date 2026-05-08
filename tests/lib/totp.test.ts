import { describe, it, expect } from "vitest";
import { generate } from "otplib";
import {
  generateTotpSecret,
  generateOtpauthUrl,
  generateBackupCodes,
  hashBackupCodes,
  findBackupCodeIndex,
  verifyTotp,
} from "@/lib/totp";

describe("lib/totp", () => {
  describe("generateTotpSecret", () => {
    it("retourne un secret base32 non vide", () => {
      const secret = generateTotpSecret();
      expect(secret).toBeTypeOf("string");
      expect(secret.length).toBeGreaterThan(10);
      // base32 = A-Z et 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it("génère des secrets uniques", () => {
      const set = new Set<string>();
      for (let i = 0; i < 50; i++) set.add(generateTotpSecret());
      expect(set.size).toBe(50);
    });
  });

  describe("generateOtpauthUrl", () => {
    it("retourne une URI otpauth valide", () => {
      const secret = generateTotpSecret();
      const url = generateOtpauthUrl("user@example.com", secret);
      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain("user%40example.com");
      expect(url).toContain(`secret=${secret}`);
      expect(url).toContain("issuer=Physalis");
    });
  });

  describe("verifyTotp", () => {
    it("accepte un code valide généré par otplib", async () => {
      const secret = generateTotpSecret();
      const code = await generate({ secret });
      expect(await verifyTotp(code, secret)).toBe(true);
    });

    it("refuse un code invalide", async () => {
      const secret = generateTotpSecret();
      expect(await verifyTotp("000000", secret)).toBe(false);
    });

    it("refuse un code généré avec un autre secret", async () => {
      const a = generateTotpSecret();
      const b = generateTotpSecret();
      const codeA = await generate({ secret: a });
      expect(await verifyTotp(codeA, b)).toBe(false);
    });

    it("trim les espaces autour du code", async () => {
      const secret = generateTotpSecret();
      const code = await generate({ secret });
      expect(await verifyTotp(`  ${code}  `, secret)).toBe(true);
    });
  });

  describe("backup codes", () => {
    it("generateBackupCodes retourne 8 codes hex 16-chars uniques", () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(8);
      for (const c of codes) {
        expect(c).toMatch(/^[0-9a-f]{16}$/);
      }
      expect(new Set(codes).size).toBe(8);
    });

    it("hashBackupCodes produit autant de hash que de codes", async () => {
      const codes = generateBackupCodes(3);
      const hashes = await hashBackupCodes(codes);
      expect(hashes).toHaveLength(3);
      for (const h of hashes) {
        // bcrypt hash : commence par $2a$, $2b$, ou $2y$.
        expect(h).toMatch(/^\$2[aby]\$\d+\$/);
      }
    });

    it("findBackupCodeIndex retourne l'index du code matchant", async () => {
      const codes = generateBackupCodes(3);
      const hashes = await hashBackupCodes(codes);
      expect(await findBackupCodeIndex(codes[1]!, hashes)).toBe(1);
      expect(await findBackupCodeIndex(codes[2]!, hashes)).toBe(2);
    });

    it("findBackupCodeIndex retourne -1 si aucun ne matche", async () => {
      const codes = generateBackupCodes(3);
      const hashes = await hashBackupCodes(codes);
      expect(await findBackupCodeIndex("nope-not-a-code", hashes)).toBe(-1);
    });

    it("findBackupCodeIndex est insensible à la casse + espaces", async () => {
      const codes = generateBackupCodes(2);
      const hashes = await hashBackupCodes(codes);
      const c = codes[0]!;
      expect(await findBackupCodeIndex(c.toUpperCase(), hashes)).toBe(0);
      expect(await findBackupCodeIndex(`  ${c}  `, hashes)).toBe(0);
    });
  });
});
