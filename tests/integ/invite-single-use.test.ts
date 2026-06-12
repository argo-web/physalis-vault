// Invitation à usage unique : un token accepté ne peut pas être rejoué.
//
// Couvre proposal "Orgs & Users #3" — le token d'invitation est invalidé
// après acceptation (champ `acceptedAt` posé en transaction, cf.
// app/api/invitations/[token]/register-and-accept). Un 2e usage → 404.
//
// Scénario :
//   1. Org provisionnée (admin OWNER) + invitation pendante (token connu).
//   2. POST register-and-accept (password) → 200, user créé + membre + acceptedAt.
//   3. DB : acceptedAt non NULL, 1 OrgMember pour le nouvel user.
//   4. 2e POST avec le MÊME token → 404 "Invitation invalid or expired".
//   5. DB : toujours 1 seul OrgMember (pas de doublon).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  BASE_URL,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
  TENANT_HOST,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const CAROL_EMAIL = `carol-invite-${SUFFIX}@test.local`;
const CAROL_PASSWORD = "caroltestpassword12";
const ORG_SLUG = `invite-${SUFFIX}`;

let orgId = "";
let adminUserId = "";
let carolUserId = "";
const token = "iv_" + randomBytes(32).toString("hex");

async function acceptWithToken(): Promise<Response> {
  return fetch(`${BASE_URL}/api/invitations/${token}/register-and-accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-host": TENANT_HOST,
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 254) + 1}`,
    },
    body: JSON.stringify({ password: CAROL_PASSWORD }),
  });
}

beforeAll(async () => {
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW())`,
  );
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${adminUserId}', '${orgId}', 'OWNER', NOW())`,
  );

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+00");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", "invitedById", "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${CAROL_EMAIL}', '${orgId}', 'MEMBER', '${tokenHash}', '${expiresAt}', '${adminUserId}', NOW())`,
  );
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${CAROL_EMAIL}'`);
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
});

describe("Invitation à usage unique (Orgs & Users #3)", () => {
  it("1er usage du token → 200, user créé et invitation acceptée", async () => {
    const res = await acceptWithToken();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);

    carolUserId = (
      await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${CAROL_EMAIL}'`)
    ).trim();
    expect(carolUserId).not.toBe("");

    const acceptedAt = await execSql(
      `SELECT "acceptedAt" FROM "${TENANT_SCHEMA}"."Invitation"
       WHERE "organizationId" = '${orgId}' AND email = '${CAROL_EMAIL}'`,
    );
    expect(acceptedAt.trim()).not.toBe("");

    const members = await execSql(
      `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
       WHERE "userId" = '${carolUserId}' AND "organizationId" = '${orgId}'`,
    );
    expect(members.trim()).toBe("1");
  });

  it("2e usage du MÊME token → 404 (invalidé)", async () => {
    const res = await acceptWithToken();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it("DB : pas de doublon de membre après le rejeu", async () => {
    const members = await execSql(
      `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."OrgMember"
       WHERE "userId" = '${carolUserId}' AND "organizationId" = '${orgId}'`,
    );
    expect(members.trim()).toBe("1");
  });
});
