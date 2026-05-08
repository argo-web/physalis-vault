import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

describe("lib/crypto — AES-256-GCM", () => {
  describe("roundtrip", () => {
    it("encrypte puis déchiffre la valeur originale", () => {
      const plain = "DATABASE_URL=postgresql://user:pwd@db/x";
      const enc = encrypt(plain);
      const dec = decrypt(enc);
      expect(dec).toBe(plain);
    });

    it("supporte les caractères spéciaux et l'unicode", () => {
      const plain = 'sk-prod with $$ "quotes" and `backticks` + 日本語';
      const enc = encrypt(plain);
      expect(decrypt(enc)).toBe(plain);
    });

    it("supporte une chaîne vide", () => {
      const enc = encrypt("");
      expect(decrypt(enc)).toBe("");
    });

    it("supporte une grande chaîne (10 KB)", () => {
      const plain = "X".repeat(10 * 1024);
      const enc = encrypt(plain);
      expect(decrypt(enc)).toBe(plain);
    });
  });

  describe("IV unique par chiffrement", () => {
    it("deux chiffrements de la même valeur produisent des IV différents", () => {
      const plain = "secret";
      const a = encrypt(plain);
      const b = encrypt(plain);
      expect(a.iv).not.toBe(b.iv);
      // Les ciphertexts diffèrent aussi (IV impacte le keystream).
      expect(a.encryptedValue).not.toBe(b.encryptedValue);
      // Mais les deux déchiffrent vers la même valeur.
      expect(decrypt(a)).toBe(plain);
      expect(decrypt(b)).toBe(plain);
    });
  });

  describe("intégrité GCM", () => {
    it("lève une erreur si le tag est altéré", () => {
      const enc = encrypt("hello");
      // Flip un bit du tag (décodé puis ré-encodé).
      const tagBuf = Buffer.from(enc.tag, "base64");
      tagBuf[0] ^= 0x01;
      const tampered = { ...enc, tag: tagBuf.toString("base64") };
      expect(() => decrypt(tampered)).toThrow();
    });

    it("lève une erreur si l'IV est altéré", () => {
      const enc = encrypt("hello");
      const ivBuf = Buffer.from(enc.iv, "base64");
      ivBuf[0] ^= 0x01;
      const tampered = { ...enc, iv: ivBuf.toString("base64") };
      expect(() => decrypt(tampered)).toThrow();
    });

    it("lève une erreur si le ciphertext est altéré", () => {
      const enc = encrypt("hello");
      const cipherBuf = Buffer.from(enc.encryptedValue, "base64");
      cipherBuf[0] ^= 0x01;
      const tampered = {
        ...enc,
        encryptedValue: cipherBuf.toString("base64"),
      };
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("ENCRYPTION_KEY", () => {
    const originalKey = process.env.ENCRYPTION_KEY;

    afterEach(() => {
      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("lève une erreur si la clé est manquante", () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    });

    it("lève une erreur si la clé n'a pas la bonne longueur", () => {
      process.env.ENCRYPTION_KEY = "tooshort";
      expect(() => encrypt("x")).toThrow(/32 bytes/);
    });

    it("un secret chiffré avec une clé X ne se déchiffre pas avec une clé Y", () => {
      // Chiffre avec la clé par défaut (du setup).
      const enc = encrypt("hello");
      // Bascule sur une autre clé valide.
      process.env.ENCRYPTION_KEY =
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      expect(() => decrypt(enc)).toThrow();
    });
  });
});
