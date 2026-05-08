import { describe, it, expect } from "vitest";
import {
  generateShareToken,
  hashShareToken,
  isAllowedShareTtl,
  isShareTokenFormat,
  SHARE_ALLOWED_TTLS,
} from "@/lib/share-token";

describe("share-token", () => {
  it("generateShareToken renvoie un token au format strict", () => {
    const t = generateShareToken();
    expect(isShareTokenFormat(t)).toBe(true);
    expect(t.startsWith("sv_share_")).toBe(true);
  });

  it("generateShareToken produit des tokens differents", () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });

  it("hashShareToken est deterministe et 64 hex", () => {
    const t = generateShareToken();
    const h1 = hashShareToken(t);
    const h2 = hashShareToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("isShareTokenFormat rejette les formats invalides", () => {
    expect(isShareTokenFormat("not-a-token")).toBe(false);
    expect(isShareTokenFormat("sv_share_xyz")).toBe(false);
    expect(isShareTokenFormat("sv_<otherprefix>_" + "a".repeat(64))).toBe(false);
    expect(isShareTokenFormat("sv_share_" + "A".repeat(64))).toBe(false); // uppercase
  });

  it("isAllowedShareTtl whitelist 15min/1h/4h/24h", () => {
    expect(isAllowedShareTtl(900)).toBe(true);
    expect(isAllowedShareTtl(3600)).toBe(true);
    expect(isAllowedShareTtl(14400)).toBe(true);
    expect(isAllowedShareTtl(86400)).toBe(true);
    expect(isAllowedShareTtl(60)).toBe(false);
    expect(isAllowedShareTtl(7200)).toBe(false);
    expect(isAllowedShareTtl("3600")).toBe(false);
    expect(isAllowedShareTtl(null)).toBe(false);
  });

  it("SHARE_ALLOWED_TTLS expose les valeurs documentees", () => {
    expect(SHARE_ALLOWED_TTLS).toEqual([900, 3600, 14400, 86400]);
  });
});
