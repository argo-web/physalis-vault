import { describe, it, expect } from "vitest";
import { parseTotpInput, isBase32 } from "@/lib/otpauth-parse";

describe("isBase32", () => {
  it("accepte un secret base32 standard", () => {
    expect(isBase32("JBSWY3DPEHPK3PXP")).toBe(true);
  });
  it("accepte le padding =", () => {
    expect(isBase32("JBSWY3DP===")).toBe(true);
  });
  it("rejette les caracteres hors base32", () => {
    expect(isBase32("jbswy3dpehpk3pxp")).toBe(false); // lowercase pas accepte
    expect(isBase32("JBSWY3DP019")).toBe(false); // 0/1/8/9 hors base32
  });
  it("rejette les chaines trop courtes", () => {
    expect(isBase32("ABC")).toBe(false);
  });
});

describe("parseTotpInput", () => {
  it("normalise un secret brut avec espaces", () => {
    expect(parseTotpInput("jbsw y3dp ehpk 3pxp")).toBe("JBSWY3DPEHPK3PXP");
  });
  it("normalise un secret brut avec tirets", () => {
    expect(parseTotpInput("JBSW-Y3DP-EHPK-3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });
  it("parse une URI otpauth:// totp avec secret", () => {
    const url =
      "otpauth://totp/Acme:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme";
    expect(parseTotpInput(url)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("parse une URI otpauth:// avec secret en lowercase", () => {
    const url = "otpauth://totp/x?secret=jbswy3dpehpk3pxp";
    expect(parseTotpInput(url)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("retourne null pour hotp (non supporte)", () => {
    expect(
      parseTotpInput("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=0"),
    ).toBeNull();
  });
  it("retourne null pour otpauth:// sans secret", () => {
    expect(parseTotpInput("otpauth://totp/x?issuer=Acme")).toBeNull();
  });
  it("retourne null pour une URI malformee", () => {
    expect(parseTotpInput("not a url")).toBeNull();
    expect(parseTotpInput("")).toBeNull();
    expect(parseTotpInput("   ")).toBeNull();
  });
  it("retourne null pour un secret base32 invalide", () => {
    expect(parseTotpInput("not!base32")).toBeNull();
    expect(parseTotpInput("0019")).toBeNull(); // 0,1 hors base32
  });
});
