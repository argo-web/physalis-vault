// Quota de sièges à l'ajout d'un membre dans une organisation.
//
// Couvre proposal "Orgs & Users #2" — inviter un membre au-delà du quota de
// sièges est rejeté en 403 (cf. lib/quotas.checkSeatForOrgAdd +
// app/api/orgs/[slug]/members POST). On teste le pool CONFINÉ (org ajoutée,
// non principale) via `org.maxSeats`, ajusté par le test.
//
// Pré-requis plan : le client de test est SHARED → feature `multi_users` OK
// (sinon le feature-gate précède le check quota).
//
// Scénario :
//   1. Org ajoutée provisionnée (admin OWNER = 1 siège confiné) avec maxSeats=1.
//   2. Inviter un user (in-app) → 403 (quota de sièges atteint).
//   3. maxSeats relevé à 5 → la même invitation passe (≤ 200/201).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  postJson,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ORG_SLUG = `seat-${SUFFIX}`;
const INVITEE_EMAIL = `seat-invitee-${SUFFIX}@test.local`;

let admin: Session;
let adminUserId = "";
let inviteeId = "";

async function setMaxSeats(n: number) {
  await execSql(
    `UPDATE "${TENANT_SCHEMA}"."Organization" SET "maxSeats" = ${n} WHERE slug = '${ORG_SLUG}'`,
  );
}

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  // User invité (existe mais n'est membre d'aucune org → non global).
  inviteeId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."User" (id, email, password)
     VALUES ('${inviteeId}', '${INVITEE_EMAIL}', 'x')`,
  );

  // Org AJOUTÉE (isPrimary=false par défaut) avec 1 seul siège confiné.
  const orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt", "maxSeats")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW(), 1)`,
  );
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${adminUserId}', '${orgId}', 'OWNER', NOW())`,
  );
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${INVITEE_EMAIL}'`);
});

describe("Quota de sièges à l'ajout de membre (Orgs & Users #2)", () => {
  it("maxSeats=1 (déjà plein avec l'OWNER) → invitation refusée en 403", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/members`, {
      targetUserId: inviteeId,
      role: "MEMBER",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/quota de si[èe]ges/i);
  });

  it("maxSeats=5 → la même invitation passe", async () => {
    await setMaxSeats(5);
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/members`, {
      targetUserId: inviteeId,
      role: "MEMBER",
    });
    expect([200, 201]).toContain(res.status);
  });
});
