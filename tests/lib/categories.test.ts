import { describe, it, expect } from "vitest";
import {
  SECRET_CATEGORIES,
  SECRET_CATEGORY_LABELS,
  isValidCategory,
} from "@/lib/categories";

describe("lib/categories", () => {
  it("la liste est non vide et chaque entree a un label", () => {
    expect(SECRET_CATEGORIES.length).toBeGreaterThan(0);
    for (const cat of SECRET_CATEGORIES) {
      expect(SECRET_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });

  it("isValidCategory accepte chaque valeur de la liste", () => {
    for (const cat of SECRET_CATEGORIES) {
      expect(isValidCategory(cat)).toBe(true);
    }
  });

  it("isValidCategory refuse les valeurs hors liste", () => {
    expect(isValidCategory("misc")).toBe(false);
    expect(isValidCategory("Database")).toBe(false); // casse
    expect(isValidCategory("DATABASE")).toBe(false);
    expect(isValidCategory("")).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(42)).toBe(false);
    expect(isValidCategory({})).toBe(false);
  });

  it("l'ordre est figé : ports, database, auth, services, email, infra, application", () => {
    expect([...SECRET_CATEGORIES]).toEqual([
      "ports",
      "database",
      "auth",
      "services",
      "email",
      "infra",
      "application",
    ]);
  });
});
