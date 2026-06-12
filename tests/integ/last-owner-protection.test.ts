// Protection du dernier OWNER d'une organisation.
//
// Couvre proposal "Orgs & Users #7" — le dernier admin/owner ne peut pas être
// retiré. Deux chemins protégés (cf. app/api/orgs/[slug]/members/[userId]) :
//   - DELETE du dernier OWNER       → 409 "Cannot remove the last OWNER"
//   - PATCH demote du dernier OWNER → 409 "Cannot demote the last OWNER"
// Et le chemin positif : avec 2 OWNERs, en retirer un est autorisé.
//
// Scénario :
//   1. Org provisionnée avec admin comme unique OWNER + Bob (MEMBER).
//   2. DELETE admin (dernier OWNER) → 409, admin toujours membre.
//   3. PATCH admin → MEMBER (demote dernier OWNER) → 409, admin toujours OWNER.
//   4. PATCH Bob → OWNER (2 OWNERs) → 200.
//   5. DELETE Bob (n'est plus le dernier OWNER) → 200.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  postJson,
  patchJson,
  deleteReq,
  BASE_URL,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
  TENANT_HOST,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const BOB_EMAIL = `bob-lastowner-${SUFFIX}@test.local`;
const BOB_PASSWORD = "bobtestpassword12";
const ORG_SLUG = `lastowner-${SUFFIX}`;

let admin: Session;
let orgId = "";
let adminUserId = "";
let bobUserId = "";

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

async function inviteBob(orgId: string, invitedById: string) {
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
  if (!res.ok) throw new Error(`register-and-accept failed: HTTP ${res.status}`);
}

async function ownerCount(): Promise<number> {
  const c = await execSql(
    `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
     WHERE "organizationId" = '${orgId}' AND role = 'OWNER'`,
  );
  return Number(c.trim());
}

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  orgId = await provisionOrg(ORG_SLUG, adminUserId);
  await inviteBob(orgId, adminUserId);
  bobUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`)
  ).trim();
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`);
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
});

describe("Protection du dernier OWNER (Orgs & Users #7)", () => {
  it("sanity : admin est l'unique OWNER, Bob est MEMBER", async () => {
    expect(await ownerCount()).toBe(1);
  });

  it("DELETE du dernier OWNER (admin) → 409, admin conservé", async () => {
    const res = await deleteReq(admin, `/api/orgs/${ORG_SLUG}/members/${adminUserId}`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/last OWNER/i);
    expect(await ownerCount()).toBe(1);
  });

  it("PATCH demote du dernier OWNER (admin → MEMBER) → 409", async () => {
    const res = await patchJson(admin, `/api/orgs/${ORG_SLUG}/members/${adminUserId}`, {
      role: "MEMBER",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/last OWNER/i);
    expect(await ownerCount()).toBe(1);
  });

  it("PATCH promote Bob → OWNER → 200 (2 OWNERs)", async () => {
    const res = await patchJson(admin, `/api/orgs/${ORG_SLUG}/members/${bobUserId}`, {
      role: "OWNER",
    });
    expect(res.status).toBe(200);
    expect(await ownerCount()).toBe(2);
  });

  it("avec 2 OWNERs, retirer un OWNER (Bob) → 200", async () => {
    const res = await deleteReq(admin, `/api/orgs/${ORG_SLUG}/members/${bobUserId}`);
    expect(res.status).toBe(200);
    const remaining = await execSql(
      `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
       WHERE "userId" = '${bobUserId}' AND "organizationId" = '${orgId}'`,
    );
    expect(remaining.trim()).toBe("0");
    expect(await ownerCount()).toBe(1);
  });

  // Garde-fou de non-régression : la création de secret reste possible pour
  // l'OWNER restant (l'org n'est pas cassée par les opérations ci-dessus).
  it("l'OWNER restant peut toujours écrire dans l'org", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
      key: `LASTOWNER_${SUFFIX}`,
      value: "ok",
    });
    expect([200, 201]).toContain(res.status);
  });
});
