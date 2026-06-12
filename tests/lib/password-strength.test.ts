import { describe, it, expect } from "vitest";
import { estimateStrength, strengthMeta } from "@/lib/password-strength";

describe("lib/password-strength — estimateStrength", () => {
  it("vide = 0 (très faible)", () => {
    expect(estimateStrength("").score).toBe(0);
  });

  it("très court = 0", () => {
    expect(estimateStrength("ab").score).toBe(0);
    expect(estimateStrength("abcd").score).toBe(0);
  });

  it("court mais une seule classe = 1", () => {
    expect(estimateStrength("xnzhqwm").score).toBe(1);
  });

  it("8-11 chars + 2 classes = 2", () => {
    expect(estimateStrength("Xnzhqwmp").score).toBe(2);
  });

  it("12-15 chars + 3 classes = 3", () => {
    expect(estimateStrength("Xnzhqwmp9285").score).toBe(3);
  });

  it("16+ chars + 3 classes = 4", () => {
    expect(estimateStrength("Xnzhqwmp9285!@#$").score).toBe(4);
  });

  it("décote sur motif faible (1234)", () => {
    // Sans motif : "Xz1234567890" → 12 chars 3 classes = score 3
    // Avec motif (1234) → décote à 2
    const score = estimateStrength("Xz1234567890").score;
    expect(score).toBe(2);
  });

  it("décote sur motif faible (qwerty)", () => {
    expect(estimateStrength("qwertyuiop").score).toBeLessThan(3);
  });

  it("décote sur 'password'", () => {
    expect(estimateStrength("MyPassword123!").score).toBeLessThan(4);
  });

  it("décote sur répétitions (aaaa)", () => {
    expect(estimateStrength("aaaaaaaaA1!").score).toBeLessThan(3);
  });

  it("retourne label + color non vides", () => {
    const r = estimateStrength("Abc123!@#xyz");
    expect(r.label).toBeTruthy();
    expect(r.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("renvoie un hint pour les scores faibles", () => {
    expect(estimateStrength("abc").hint).toBeTruthy();
    expect(estimateStrength("Abcdefgh1234!@#$").hint).toBe(null);
  });
});

describe("lib/password-strength — strengthMeta", () => {
  it("mappe chaque score 0-4 vers label + color", () => {
    for (let s = 0; s <= 4; s++) {
      const m = strengthMeta(s);
      expect(m.label).toBeTruthy();
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("cohérent avec estimateStrength pour un score donné", () => {
    const r = estimateStrength("Xnzhqwmp9285!@#$"); // score 4
    expect(strengthMeta(r.score)).toEqual({ label: r.label, color: r.color });
  });

  it("clampe les valeurs hors borne (DB corrompue)", () => {
    expect(strengthMeta(-3)).toEqual(strengthMeta(0));
    expect(strengthMeta(99)).toEqual(strengthMeta(4));
  });
});
