import { describe, it, expect } from "vitest";
import {
  generatePassword,
  PASSWORD_LENGTH_BOUNDS,
} from "@/lib/generate-password";

describe("lib/generate-password", () => {
  it("retourne un mot de passe de la longueur demandee", () => {
    expect(generatePassword(12).length).toBe(12);
    expect(generatePassword(24).length).toBe(24);
    expect(generatePassword(64).length).toBe(64);
  });

  it("longueur par defaut = 24", () => {
    expect(generatePassword().length).toBe(24);
  });

  it("caracteres uniquement dans l'alphabet base64url [A-Za-z0-9_-]", () => {
    const pwd = generatePassword(64);
    expect(pwd).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("entropie : 1000 generations distinctes a 24 chars", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generatePassword(24));
    expect(set.size).toBe(1000);
  });

  it("refuse longueur < 12", () => {
    expect(() => generatePassword(11)).toThrow();
    expect(() => generatePassword(0)).toThrow();
    expect(() => generatePassword(-1)).toThrow();
  });

  it("refuse longueur > 64", () => {
    expect(() => generatePassword(65)).toThrow();
    expect(() => generatePassword(1000)).toThrow();
  });

  it("refuse longueur non-entiere", () => {
    expect(() => generatePassword(24.5)).toThrow();
    expect(() => generatePassword(NaN)).toThrow();
    expect(() => generatePassword(Infinity)).toThrow();
  });

  it("PASSWORD_LENGTH_BOUNDS expose min/max/default", () => {
    expect(PASSWORD_LENGTH_BOUNDS.min).toBe(12);
    expect(PASSWORD_LENGTH_BOUNDS.max).toBe(64);
    expect(PASSWORD_LENGTH_BOUNDS.default).toBe(24);
  });
});
