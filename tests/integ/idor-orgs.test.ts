// Test IDOR cross-org : un user d'org A ne doit jamais accéder aux
// ressources d'org B (qu'il connaisse ou non son slug).
//
// Couvre proposal RBAC #2 — IDOR sur les organisations.
//
// Setup :
//   1. Admin crée orgA et orgB (DB direct).
//   2. Bob est invité à orgA en MEMBER (via le helper invitation existant).
//   3. Bob ne fait PAS partie d'orgB.
//   4. Bob essaie d'accéder à orgB sur tous les endpoints `/api/orgs/<slugB>/*`.
//
// Les endpoints doivent renvoyer **404 (et pas 403)** pour ne pas leak
// l'existence du slug. C'est la convention déjà appliquée par
// requireOrgMember() côté backend.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  loginAs,
  postJson,
  BASE_URL,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
  TENANT_HOST,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const BOB_EMAIL = `bob-idor-${SUFFIX}@test.local`;
const BOB_PASSWORD = "bobtestpassword12";
const ORG_A_SLUG = `idor-a-${SUFFIX}`;
const ORG_B_SLUG = `idor-b-${SUFFIX}`;

let bob: Session;
let orgAId = "";
let orgBId = "";
let adminUserId = "";

async function provisionOrg(slug: string, ownerId: string): Promise<string> {
  const id = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${id}', '${slug}', '${slug}', NOW())`,
  );
  // Admin (owner) en OrgMember.
  const memberId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('${memberId}', '${ownerId}', '${id}', 'OWNER', NOW())`,
  );
  return id;
}

async function inviteBobToOrg(orgId: string, invitedById: string) {
  const token = "iv_" + randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = "ck" + randomBytes(11).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+00");

  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", "invitedById", "createdAt")
     VALUES ('${id}', '${BOB_EMAIL}', '${orgId}', 'MEMBER', '${tokenHash}', '${expiresAt}', '${invitedById}', NOW())`,
  );

  // X-Forwarded-Host pour que la route déduise le tenant slug.
  const res = await fetch(
    `${BASE_URL}/api/invitations/${token}/register-and-accept`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": TENANT_HOST,
        "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 254) + 1}`,
      },
      body: JSON.stringify({ password: BOB_PASSWORD }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`register-and-accept failed: HTTP ${res.status} — ${text}`);
  }
}

beforeAll(async () => {
  await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) {
    throw new Error("Admin user not found in DB");
  }

  // Crée orgA + orgB (les 2 owned par admin pour simplifier).
  orgAId = await provisionOrg(ORG_A_SLUG, adminUserId);
  orgBId = await provisionOrg(ORG_B_SLUG, adminUserId);

  // Bob est invité à orgA SEULEMENT.
  await inviteBobToOrg(orgAId, adminUserId);
  bob = await loginAs(BOB_EMAIL, BOB_PASSWORD);

  // Sanity : Bob est bien membre d'orgA.
  const sanity = await bob.fetch(`/api/orgs/${ORG_A_SLUG}`);
  if (sanity.status !== 200) {
    throw new Error(
      `Bob devrait pouvoir GET orgA, got ${sanity.status} — setup foireux`,
    );
  }
});

afterAll(async () => {
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."Project" WHERE slug = 'injected-${SUFFIX}'`,
  );
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`,
  );
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug IN ('${ORG_A_SLUG}', '${ORG_B_SLUG}')`,
  );
});

describe("IDOR cross-org (RBAC #2)", () => {
  describe("Lecture orgB par Bob (membre orgA uniquement)", () => {
    it("GET /api/orgs/<slugB> → 404 (ne leak pas l'existence)", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugB>/members → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}/members`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugB>/secrets → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}/secrets`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugB>/audit → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}/audit`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugB>/servers → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}/servers`);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Écriture orgB par Bob → tous refusés", () => {
    it("POST /api/orgs/<slugB>/secrets → 404 (pas d'accès)", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/secrets`, {
        key: "INJECTED_BY_BOB",
        value: "should-never-be-stored",
      });
      expect([403, 404]).toContain(res.status);

      // Sanity : aucun secret avec ce nom n'a été créé en DB.
      const rows = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgSecret"
         WHERE "organizationId" = '${orgBId}'
           AND key = 'INJECTED_BY_BOB'`,
      );
      expect(rows.trim()).toBe("0");
    });

    it("POST /api/orgs/<slugB>/members → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/members`, {
        email: "evilfriend@test.local",
        role: "MEMBER",
      });
      expect([403, 404]).toContain(res.status);
    });

    it("POST /api/orgs/<slugB>/servers → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/servers`, {
        name: "rogue-vps",
        ip: "1.2.3.4",
        sshUser: "root",
        sshPrivateKey: "fake-key",
      });
      expect([403, 404]).toContain(res.status);
    });

    it("DELETE /api/orgs/<slugB> → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}`, {
        method: "DELETE",
      });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Liste des orgs côté Bob", () => {
    it("GET /api/orgs ne leak pas orgB", async () => {
      const res = await bob.fetch("/api/orgs");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { organizations?: { slug: string }[] };
      const slugs = (data.organizations ?? []).map((o) => o.slug);
      expect(slugs).toContain(ORG_A_SLUG);
      expect(slugs).not.toContain(ORG_B_SLUG);
    });
  });

  describe("Tampering du body — organizationId ignoré par l'API", () => {
    it("POST /api/projects avec organizationId d'orgB → projet créé dans l'org courante de Bob (pas orgB)", async () => {
      const res = await postJson(bob, "/api/projects", {
        name: `injected-${SUFFIX}`,
        slug: `injected-${SUFFIX}`,
        organizationId: orgBId,
      });
      // L'API ignore organizationId en body (utilise le cookie de Bob).
      // Test : le projet est créé MAIS dans orgA (légitime pour Bob), pas orgB.
      expect([200, 201]).toContain(res.status);

      // Sanity #1 : aucun projet créé dans orgB (l'attaque ne fonctionne pas).
      const inOrgB = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."Project"
         WHERE "organizationId" = '${orgBId}'
           AND name LIKE 'injected-%'`,
      );
      expect(inOrgB.trim()).toBe("0");

      // Sanity #2 : le projet a bien été créé dans orgA (org courante de Bob).
      const inOrgA = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."Project"
         WHERE "organizationId" = '${orgAId}'
           AND slug = 'injected-${SUFFIX}'`,
      );
      expect(inOrgA.trim()).toBe("1");
    });
  });
});
