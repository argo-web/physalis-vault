// Test HTTP : l'audit log n'expose aucune route de mutation.
//
// Complète tests/lib/audit-immutability.test.ts (qui scanne le code) en
// vérifiant côté Next.js routing que :
//   - GET /api/orgs/[slug]/audit retourne 200
//   - POST/PATCH/DELETE/PUT sur la même URL renvoient 405 (Next.js refuse
//     les méthodes non exportées par le route handler)
//   - Aucune route enfant /audit/[id] n'est exposée (404)
//
// Couvre proposal Audit #2 (immuabilité au niveau HTTP).

import { describe, it, expect, beforeAll } from "vitest";
import { execSql } from "./helpers/db";
import { Session, adminSession } from "./helpers/api";

let admin: Session;
let adminOrgSlug = "";

beforeAll(async () => {
  admin = await adminSession();
  adminOrgSlug = (
    await execSql(`SELECT slug FROM "Organization" WHERE slug = 'admin'`)
  ).trim();
  if (!adminOrgSlug) {
    throw new Error("Admin org not found");
  }
});

describe("Audit log immutability — HTTP (Audit #2)", () => {
  describe("/api/orgs/[slug]/audit — méthodes acceptées", () => {
    it("GET → 200 (lecture autorisée)", async () => {
      const res = await admin.fetch(`/api/orgs/${adminOrgSlug}/audit`);
      expect(res.status).toBe(200);
    });

    it("POST → 405 Method Not Allowed", async () => {
      const res = await admin.fetch(`/api/orgs/${adminOrgSlug}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "INJECTED" }),
      });
      expect(res.status).toBe(405);
    });

    it("PATCH → 405 Method Not Allowed", async () => {
      const res = await admin.fetch(`/api/orgs/${adminOrgSlug}/audit`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "any", action: "TAMPERED" }),
      });
      expect(res.status).toBe(405);
    });

    it("PUT → 405 Method Not Allowed", async () => {
      const res = await admin.fetch(`/api/orgs/${adminOrgSlug}/audit`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "any" }),
      });
      expect(res.status).toBe(405);
    });

    it("DELETE → 405 Method Not Allowed", async () => {
      const res = await admin.fetch(`/api/orgs/${adminOrgSlug}/audit`, {
        method: "DELETE",
      });
      expect(res.status).toBe(405);
    });
  });

  describe("/api/orgs/[slug]/audit/[id] — sous-route inexistante", () => {
    it("DELETE sur un id quelconque → 404 (pas de route)", async () => {
      const res = await admin.fetch(
        `/api/orgs/${adminOrgSlug}/audit/some-fake-id`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(404);
    });

    it("PATCH sur un id quelconque → 404 (pas de route)", async () => {
      const res = await admin.fetch(
        `/api/orgs/${adminOrgSlug}/audit/some-fake-id`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "TAMPERED" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("GET sur un id quelconque → 404 (pas de route)", async () => {
      const res = await admin.fetch(
        `/api/orgs/${adminOrgSlug}/audit/some-fake-id`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("/api/projects/[slug]/audit — symétrie côté projet", () => {
    it("POST → 405", async () => {
      // On utilise un slug de projet quelconque ; même si le projet
      // n'existe pas, le routing rejette POST avant même de chercher.
      const res = await admin.fetch(`/api/projects/any-slug/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "INJECTED" }),
      });
      // 405 si la méthode est rejetée avant le lookup du projet, OU
      // 404 si le route handler résout d'abord le slug. Les 2 sont OK.
      expect([404, 405]).toContain(res.status);
    });

    it("DELETE → 405 ou 404", async () => {
      const res = await admin.fetch(`/api/projects/any-slug/audit`, {
        method: "DELETE",
      });
      expect([404, 405]).toContain(res.status);
    });
  });
});
