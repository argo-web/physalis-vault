// Test révocation utilisateur : quand un OrgMember est retiré d'une org,
// ses sessions actives doivent perdre l'accès **immédiatement** (pas
// seulement au prochain login).
//
// Couvre proposal RBAC #5 — accès après révocation.
//
// L'enjeu : NextAuth utilise des JWT stateless. Le JWT reste cryptographi-
// quement valide jusqu'à expiration (8h). Pour que la révocation soit
// effective, l'API doit re-vérifier la membership à CHAQUE requête (et
// non pas se reposer uniquement sur les claims du JWT).
//
// Scénario :
//   1. Bob est OrgMember (MEMBER) de orgA, login → bobSession (JWT valide).
//   2. Sanity : Bob accède à orgA via sa session.
//   3. Admin DELETE le OrgMember row de Bob.
//   4. Bob retente avec la MÊME session → 404 sur tous les endpoints orgA.
//   5. Bob peut toujours s'authentifier (User existe) mais n'a aucune org.

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
const BOB_EMAIL = `bob-revoke-${SUFFIX}@test.local`;
const BOB_PASSWORD = "bobtestpassword12";
const ORG_A_SLUG = `revoke-${SUFFIX}`;

let admin: Session;
let bob: Session; // session pré-révocation
let orgAId = "";
let bobUserId = "";
let adminUserId = "";

async function provisionOrg(slug: string, ownerId: string): Promise<string> {
  const id = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${id}', '${slug}', '${slug}', NOW())`,
  );
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
    throw new Error(`register-and-accept failed: HTTP ${res.status}`);
  }
}

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  orgAId = await provisionOrg(ORG_A_SLUG, adminUserId);
  await inviteBobToOrg(orgAId, adminUserId);
  bobUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`)
  ).trim();
  bob = await loginAs(BOB_EMAIL, BOB_PASSWORD);
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`);
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_A_SLUG}'`,
  );
});

describe("Révocation utilisateur (RBAC #5)", () => {
  // Tests séquentiels : l'ordre dans le fichier compte (vitest config integ
  // a `sequence.concurrent: false`).

  describe("Pré-révocation : Bob est bien actif", () => {
    it("Bob accède à orgA via sa session", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_A_SLUG}`);
      expect(res.status).toBe(200);
    });

    it("Bob voit orgA dans GET /api/orgs", async () => {
      const res = await bob.fetch("/api/orgs");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { organizations?: { slug: string }[] };
      const slugs = (data.organizations ?? []).map((o) => o.slug);
      expect(slugs).toContain(ORG_A_SLUG);
    });

    it("DB confirme : Bob est OrgMember de orgA", async () => {
      const count = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
         WHERE "userId" = '${bobUserId}' AND "organizationId" = '${orgAId}'`,
      );
      expect(count.trim()).toBe("1");
    });
  });

  describe("Révocation par admin (DELETE OrgMember)", () => {
    it("Admin DELETE /api/orgs/<slug>/members/<bobUserId> → 200", async () => {
      const res = await admin.fetch(
        `/api/orgs/${ORG_A_SLUG}/members/${bobUserId}`,
        { method: "DELETE" },
      );
      expect([200, 204]).toContain(res.status);

      // Sanity DB : la row OrgMember est supprimée.
      const count = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
         WHERE "userId" = '${bobUserId}' AND "organizationId" = '${orgAId}'`,
      );
      expect(count.trim()).toBe("0");
    });
  });

  describe("Post-révocation, MÊME session de Bob (JWT inchangé)", () => {
    it("GET /api/orgs/<slugA> → 404 (l'API re-vérifie la membership)", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_A_SLUG}`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugA>/secrets → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_A_SLUG}/secrets`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugA>/members → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_A_SLUG}/members`);
      expect([403, 404]).toContain(res.status);
    });

    it("GET /api/orgs/<slugA>/audit → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_A_SLUG}/audit`);
      expect([403, 404]).toContain(res.status);
    });

    it("POST /api/orgs/<slugA>/secrets (écriture) → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_A_SLUG}/secrets`, {
        key: `INJECTED_${SUFFIX}`,
        value: "post-revoke",
      });
      expect([403, 404]).toContain(res.status);

      // Sanity DB : aucun secret écrit.
      const count = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgSecret"
         WHERE "organizationId" = '${orgAId}' AND key = 'INJECTED_${SUFFIX}'`,
      );
      expect(count.trim()).toBe("0");
    });

    it("GET /api/orgs (liste) ne contient plus orgA", async () => {
      const res = await bob.fetch("/api/orgs");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { organizations?: { slug: string }[] };
      const slugs = (data.organizations ?? []).map((o) => o.slug);
      expect(slugs).not.toContain(ORG_A_SLUG);
    });
  });

  describe("Re-login post-révocation", () => {
    it("Bob peut toujours s'authentifier (User existe)", async () => {
      const fresh = await loginAs(BOB_EMAIL, BOB_PASSWORD);
      expect(fresh).toBeDefined();
    });

    it("Re-loggué, Bob ne voit toujours pas orgA", async () => {
      const fresh = await loginAs(BOB_EMAIL, BOB_PASSWORD);
      const res = await fresh.fetch(`/api/orgs/${ORG_A_SLUG}`);
      expect([403, 404]).toContain(res.status);
    });
  });
});
