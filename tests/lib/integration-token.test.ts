import { describe, it, expect } from "vitest";
import {
  extractBearer,
  generateUserToken,
  tokenPrefixForUi,
} from "@/lib/integration-token";

describe("lib/integration-token — generateUserToken", () => {
  it("produit un token avec le préfixe sv_user_", () => {
    const t = generateUserToken();
    expect(t.startsWith("sv_user_")).toBe(true);
  });

  it("produit 32 hex chars après le préfixe (64 total)", () => {
    const t = generateUserToken();
    const hex = t.slice("sv_user_".length);
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });

  it("génère des tokens uniques (statistiquement)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateUserToken());
    expect(set.size).toBe(100);
  });
});

describe("lib/integration-token — tokenPrefixForUi", () => {
  it("retourne les 12 premiers chars (sv_user_xxxx)", () => {
    const t = "sv_user_abcdef0123456789";
    expect(tokenPrefixForUi(t)).toBe("sv_user_abcd");
  });
});

describe("lib/integration-token — extractBearer", () => {
  function req(headers: Record<string, string> = {}): Request {
    return new Request("http://x", { headers });
  }

  it("extrait après Bearer", () => {
    expect(extractBearer(req({ authorization: "Bearer abc123" }))).toBe("abc123");
  });

  it("trim les espaces", () => {
    expect(extractBearer(req({ authorization: "Bearer   abc123  " }))).toBe("abc123");
  });

  it("case-insensitive sur Bearer", () => {
    expect(extractBearer(req({ authorization: "bearer abc" }))).toBe("abc");
    expect(extractBearer(req({ authorization: "BEARER abc" }))).toBe("abc");
  });

  it("null si pas de header", () => {
    expect(extractBearer(req())).toBe(null);
  });

  it("null si format invalide", () => {
    expect(extractBearer(req({ authorization: "Basic abc" }))).toBe(null);
    expect(extractBearer(req({ authorization: "abc" }))).toBe(null);
  });
});
