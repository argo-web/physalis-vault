// Les headers d'identité forgés (X-User-Id / X-Org-Id) ne donnent aucun accès.
//
// Couvre proposal "RBAC #6" — l'authent/autorisation repose sur la session
// NextAuth (JWT signé), jamais sur des headers entrants. Forger X-User-Id /
// X-Org-Id sans session ne doit pas usurper d'identité → 401.

import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers/api";

const FORGED = {
  "x-user-id": "ckfixtureadmin0000000000",
  "x-org-id": "ckorgforged000000000000",
  "x-forwarded-for": "198.51.100.77",
} as const;

describe("RBAC — headers d'identité forgés ignorés (RBAC #6)", () => {
  it("GET /api/orgs sans session + X-User-Id/X-Org-Id forgés → 401", async () => {
    const res = await fetch(`${BASE_URL}/api/orgs`, { headers: FORGED });
    expect([401, 403]).toContain(res.status);
  });

  it("baseline : sans header non plus → même statut (les headers ne changent rien)", async () => {
    const res = await fetch(`${BASE_URL}/api/orgs`, {
      headers: { "x-forwarded-for": "198.51.100.78" },
    });
    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/orgs (mutation) avec headers forgés → refus (pas d'usurpation)", async () => {
    const res = await fetch(`${BASE_URL}/api/orgs`, {
      method: "POST",
      headers: { ...FORGED, "content-type": "application/json" },
      body: JSON.stringify({ name: "Forged Org" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
