// Test élévation horizontale : Bob est OWNER d'orgA, mais ses privilèges
// d'OWNER ne doivent JAMAIS s'étendre à orgB où il n'a aucun rôle.
//
// Couvre proposal RBAC #4 — un attaquant disposant déjà d'un rôle
// privilégié dans une org ne doit pas pouvoir l'utiliser pour muter
// d'autres orgs (même en connaissant leurs IDs/slugs).
//
// Pattern : pour chaque endpoint de mutation `/api/orgs/<slug>/*`, vérifier
//   - Bob réussit dans orgA (sanity, son rôle OWNER fonctionne)
//   - Bob échoue avec 404 dans orgB (cloisonnement strict)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  loginAs,
  postJson,
  patchJson,
  BASE_URL,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
  TENANT_HOST,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const BOB_EMAIL = `bob-horiz-${SUFFIX}@test.local`;
const BOB_PASSWORD = "bobtestpassword12";
const ORG_A_SLUG = `horiz-a-${SUFFIX}`;
const ORG_B_SLUG = `horiz-b-${SUFFIX}`;

let admin: Session;
let bob: Session;
let orgAId = "";
let orgBId = "";
let adminUserId = "";
const orgBSecretKey = `LEGITIMATE_SECRET_${SUFFIX}`;
let orgBAdminMemberId = ""; // OrgMember row d'admin dans orgB

async function provisionOrg(slug: string, ownerId: string): Promise<{
  id: string;
  ownerMemberId: string;
}> {
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
  return { id, ownerMemberId: memberId };
}

async function inviteBobToOrg(
  orgId: string,
  invitedById: string,
  role: "OWNER" | "ADMIN" | "DEV" | "MEMBER",
) {
  const token = "iv_" + randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = "ck" + randomBytes(11).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+00");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", "invitedById", "createdAt")
     VALUES ('${id}', '${BOB_EMAIL}', '${orgId}', '${role}', '${tokenHash}', '${expiresAt}', '${invitedById}', NOW())`,
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

/** Insère un OrgSecret minimal (valeur encryption garbage : test ne décrypte pas). */
async function seedOrgSecret(orgId: string, key: string) {
  const id = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgSecret" (id, "organizationId", key, "encryptedValue", iv, tag, "createdAt", "updatedAt")
     VALUES ('${id}', '${orgId}', '${key}', 'fake-cipher', 'fake-iv-123456', 'fake-tag-1234', NOW(), NOW())`,
  );
  return id;
}

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  // orgA : Bob sera OWNER (via invitation)
  // orgB : seul admin est OWNER, Bob n'a aucun rôle
  const a = await provisionOrg(ORG_A_SLUG, adminUserId);
  const b = await provisionOrg(ORG_B_SLUG, adminUserId);
  orgAId = a.id;
  orgBId = b.id;
  orgBAdminMemberId = b.ownerMemberId;

  // Pré-remplit orgB avec un OrgSecret pour permettre des tentatives
  // de DELETE / PATCH ciblées.
  await seedOrgSecret(orgBId, orgBSecretKey);

  // Bob invité dans orgA avec rôle OWNER (privilège max).
  await inviteBobToOrg(orgAId, adminUserId, "OWNER");
  bob = await loginAs(BOB_EMAIL, BOB_PASSWORD);

  // Sanity : Bob peut bien gérer orgA (preuve qu'il est OWNER)
  const sanity = await patchJson(bob, `/api/orgs/${ORG_A_SLUG}`, {
    name: `${ORG_A_SLUG}-renamed`,
  });
  if (sanity.status !== 200) {
    throw new Error(
      `Sanity échouée : Bob OWNER de orgA n'arrive pas à PATCH (HTTP ${sanity.status})`,
    );
  }
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`);
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug IN ('${ORG_A_SLUG}', '${ORG_B_SLUG}')`,
  );
});

describe("Élévation horizontale OWNER cross-org (RBAC #4)", () => {
  describe("Mutations sur orgB par Bob (OWNER orgA, étranger à orgB)", () => {
    it("PATCH /api/orgs/<slugB> (rename) → 404", async () => {
      const res = await patchJson(bob, `/api/orgs/${ORG_B_SLUG}`, {
        name: "renamed-by-bob",
      });
      expect([403, 404]).toContain(res.status);

      // Sanity : le nom n'a pas changé en DB.
      const name = await execSql(
        `SELECT name FROM "${TENANT_SCHEMA}"."Organization" WHERE id = '${orgBId}'`,
      );
      expect(name.trim()).toBe(ORG_B_SLUG);
    });

    it("DELETE /api/orgs/<slugB> → 404", async () => {
      const res = await bob.fetch(`/api/orgs/${ORG_B_SLUG}`, {
        method: "DELETE",
      });
      expect([403, 404]).toContain(res.status);

      // Sanity : org toujours en DB.
      const exists = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."Organization" WHERE id = '${orgBId}'`,
      );
      expect(exists.trim()).toBe("1");
    });

    it("POST /api/orgs/<slugB>/members (inviter dans orgB) → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/members`, {
        email: `evil-${SUFFIX}@test.local`,
        role: "OWNER",
      });
      expect([403, 404]).toContain(res.status);

      const count = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."Invitation"
         WHERE "organizationId" = '${orgBId}'
           AND email LIKE 'evil-%'`,
      );
      expect(count.trim()).toBe("0");
    });

    it("PATCH /api/orgs/<slugB>/members/<adminUserId> (changer rôle d'admin) → 404", async () => {
      // Tentative : Bob essaie de rétrograder admin pour s'auto-élever.
      const res = await patchJson(
        bob,
        `/api/orgs/${ORG_B_SLUG}/members/${adminUserId}`,
        { role: "MEMBER" },
      );
      expect([403, 404]).toContain(res.status);

      // Sanity : admin reste OWNER de orgB.
      const role = await execSql(
        `SELECT role FROM "${TENANT_SCHEMA}"."OrgMember" WHERE id = '${orgBAdminMemberId}'`,
      );
      expect(role.trim()).toBe("OWNER");
    });

    it("DELETE /api/orgs/<slugB>/members/<adminUserId> (kicker admin) → 404", async () => {
      const res = await bob.fetch(
        `/api/orgs/${ORG_B_SLUG}/members/${adminUserId}`,
        { method: "DELETE" },
      );
      expect([403, 404]).toContain(res.status);

      // Sanity : admin toujours présent.
      const exists = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember" WHERE id = '${orgBAdminMemberId}'`,
      );
      expect(exists.trim()).toBe("1");
    });

    it("DELETE /api/orgs/<slugB>/secrets/<key> (effacer un secret) → 404", async () => {
      const res = await bob.fetch(
        `/api/orgs/${ORG_B_SLUG}/secrets/${orgBSecretKey}`,
        { method: "DELETE" },
      );
      expect([403, 404]).toContain(res.status);

      // Sanity : secret toujours en DB.
      const exists = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgSecret"
         WHERE "organizationId" = '${orgBId}' AND key = '${orgBSecretKey}'`,
      );
      expect(exists.trim()).toBe("1");
    });

    it("POST /api/orgs/<slugB>/secrets (créer un secret) → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/secrets`, {
        key: `INJECTED_${SUFFIX}`,
        value: "rogue",
      });
      expect([403, 404]).toContain(res.status);

      const count = await execSql(
        `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgSecret"
         WHERE "organizationId" = '${orgBId}' AND key = 'INJECTED_${SUFFIX}'`,
      );
      expect(count.trim()).toBe("0");
    });

    it("POST /api/orgs/<slugB>/servers (créer un Server) → 404", async () => {
      const res = await postJson(bob, `/api/orgs/${ORG_B_SLUG}/servers`, {
        name: "rogue-vps",
        ip: "1.2.3.4",
        sshUser: "root",
        sshPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----",
      });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Confirmation que Bob a bien les droits sur orgA", () => {
    it("POST /api/orgs/<slugA>/secrets fonctionne pour Bob (OWNER)", async () => {
      const slug = ORG_A_SLUG; // le name a été renommé, pas le slug
      const res = await postJson(bob, `/api/orgs/${slug}/secrets`, {
        key: `LEGIT_BOB_${SUFFIX}`,
        value: "valid-secret",
      });
      // 200 ou 201 selon implémentation
      expect([200, 201]).toContain(res.status);
    });
  });
});
