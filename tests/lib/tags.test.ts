import { describe, it, expect } from "vitest";
import { normalizeTags } from "@/lib/tags";

describe("lib/tags — normalizeTags", () => {
  it("undefined / null → []", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it("array vide → []", () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it("lowercase + trim", () => {
    expect(normalizeTags(["  Postgres ", "STRIPE"])).toEqual(["postgres", "stripe"]);
  });

  it("dédupe", () => {
    expect(normalizeTags(["postgres", "Postgres", "POSTGRES"])).toEqual(["postgres"]);
  });

  it("ignore les chaînes vides après trim", () => {
    expect(normalizeTags(["postgres", "  ", ""])).toEqual(["postgres"]);
  });

  it("accepte tirets, underscores, points", () => {
    expect(normalizeTags(["my-tag", "my_tag", "v1.2"])).toEqual([
      "my-tag",
      "my_tag",
      "v1.2",
    ]);
  });

  it("rejette les caractères exotiques", () => {
    expect(normalizeTags(["my tag"])).toBe(null);
    expect(normalizeTags(["@stripe"])).toBe(null);
    expect(normalizeTags(["café"])).toBe(null);
  });

  it("rejette les tags trop longs (> 50 chars)", () => {
    expect(normalizeTags(["a".repeat(51)])).toBe(null);
    expect(normalizeTags(["a".repeat(50)])).toEqual(["a".repeat(50)]);
  });

  it("rejette > 20 tags", () => {
    expect(normalizeTags(Array.from({ length: 21 }, (_, i) => `tag${i}`))).toBe(null);
  });

  it("rejette si pas un array", () => {
    expect(normalizeTags("postgres")).toBe(null);
    expect(normalizeTags(42)).toBe(null);
    expect(normalizeTags({ tags: [] })).toBe(null);
  });

  it("rejette si élément non-string", () => {
    expect(normalizeTags(["postgres", 42])).toBe(null);
  });

  it("rejette tag commençant par tiret/underscore/point", () => {
    expect(normalizeTags(["-postgres"])).toBe(null);
    expect(normalizeTags(["_postgres"])).toBe(null);
    expect(normalizeTags([".postgres"])).toBe(null);
  });
});
