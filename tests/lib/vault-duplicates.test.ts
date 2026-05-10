import { describe, it, expect } from "vitest";
import { computeDuplicates, extractDomain } from "@/lib/vault-duplicates";

describe("lib/vault-duplicates — extractDomain", () => {
  it("strip protocole et www", () => {
    expect(extractDomain("https://www.gmail.com")).toBe("gmail.com");
    expect(extractDomain("http://gmail.com/inbox")).toBe("gmail.com");
  });

  it("strip path et port", () => {
    expect(extractDomain("https://gmail.com:8080/inbox/foo")).toBe("gmail.com");
  });

  it("normalise en minuscules", () => {
    expect(extractDomain("HTTPS://GMAIL.COM")).toBe("gmail.com");
  });

  it("fallback sans protocole", () => {
    expect(extractDomain("gmail.com/inbox")).toBe("gmail.com");
    expect(extractDomain("www.example.org")).toBe("example.org");
  });

  it("retourne vide pour null/empty/invalide", () => {
    expect(extractDomain(null)).toBe("");
    expect(extractDomain("")).toBe("");
    expect(extractDomain("!!@#$")).toBe("");
  });
});

describe("lib/vault-duplicates — computeDuplicates", () => {
  it("aucun doublon → set vide", () => {
    const set = computeDuplicates([
      { id: "1", url: "gmail.com", username: "alice" },
      { id: "2", url: "github.com", username: "alice" },
    ]);
    expect(set.size).toBe(0);
  });

  it("détecte 2 entrées avec même domain+login", () => {
    const set = computeDuplicates([
      { id: "1", url: "gmail.com", username: "alice@gmail.com" },
      { id: "2", url: "https://www.gmail.com/inbox", username: "alice@gmail.com" },
      { id: "3", url: "github.com", username: "alice" },
    ]);
    expect(set).toEqual(new Set(["1", "2"]));
  });

  it("login case-insensitive", () => {
    const set = computeDuplicates([
      { id: "1", url: "gmail.com", username: "Alice@Gmail.com" },
      { id: "2", url: "gmail.com", username: "alice@gmail.com" },
    ]);
    expect(set).toEqual(new Set(["1", "2"]));
  });

  it("ignore entries sans username", () => {
    const set = computeDuplicates([
      { id: "1", url: "gmail.com", username: null },
      { id: "2", url: "gmail.com", username: null },
    ]);
    expect(set.size).toBe(0);
  });

  it("ignore entries sans url", () => {
    const set = computeDuplicates([
      { id: "1", url: null, username: "alice" },
      { id: "2", url: null, username: "alice" },
    ]);
    expect(set.size).toBe(0);
  });

  it("groupe de 3 → 3 IDs marqués", () => {
    const set = computeDuplicates([
      { id: "1", url: "gmail.com", username: "alice" },
      { id: "2", url: "gmail.com", username: "alice" },
      { id: "3", url: "gmail.com", username: "alice" },
      { id: "4", url: "gmail.com", username: "bob" },
    ]);
    expect(set).toEqual(new Set(["1", "2", "3"]));
  });
});
