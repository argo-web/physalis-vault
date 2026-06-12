// Suppression d'organisation = cascade complète.
//
// Couvre proposal "Orgs & Users #8" — supprimer une org nettoie ses enfants
// (membres, invitations, secrets d'org). Cascade assurée par les
// `onDelete: Cascade` du schéma Prisma (Organization → members/invitations/
// secrets/projects/servers) + le DELETE handler app/api/orgs/[slug].
//
// Scénario :
//   1. Org provisionnée (admin OWNER) + 1 OrgSecret (API) + 1 invitation pendante.
//   2. Sanity DB : les 3 enfants existent.
//   3. OWNER DELETE /api/orgs/<slug> → 200 { ok: true }.
//   4. DB : Organization + OrgMember + OrgSecret + Invitation tous purgés.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  postJson,
  deleteReq,
  ADMIN_EMAIL,
  TENANT_SCHEMA,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ORG_SLUG = `cascade-${SUFFIX}`;
const SECRET_KEY = `CASCADE_${SUFFIX}`;
const INVITE_EMAIL = `pending-${SUFFIX}@test.local`;

let admin: Session;
let orgId = "";
let adminUserId = "";

async function countWhere(table: string, where: string): Promise<number> {
  const c = await execSql(
    `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."${table}" WHERE ${where}`,
  );
  return Number(c.trim());
}

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  // Org + OWNER membership.
  orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW())`,
  );
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${adminUserId}', '${orgId}', 'OWNER', NOW())`,
  );

  // Invitation pendante (enfant non accepté).
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+00");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", "invitedById", "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${INVITE_EMAIL}', '${orgId}', 'MEMBER', '${randomBytes(32).toString("hex")}', '${expiresAt}', '${adminUserId}', NOW())`,
  );

  // OrgSecret via l'API (chiffrement géré côté serveur).
  const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
    key: SECRET_KEY,
    value: "to-be-cascaded",
  });
  if (![200, 201].includes(res.status)) {
    throw new Error(`OrgSecret create failed: HTTP ${res.status}`);
  }
});

afterAll(async () => {
  // Filet : si le DELETE org a échoué, on nettoie quand même.
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
});

describe("Cascade delete d'organisation (Orgs & Users #8)", () => {
  it("sanity : org + membre + invitation + secret existent", async () => {
    expect(await countWhere("Organization", `id = '${orgId}'`)).toBe(1);
    expect(await countWhere("OrgMember", `"organizationId" = '${orgId}'`)).toBe(1);
    expect(await countWhere("Invitation", `"organizationId" = '${orgId}'`)).toBe(1);
    expect(await countWhere("OrgSecret", `"organizationId" = '${orgId}'`)).toBe(1);
  });

  it("OWNER DELETE /api/orgs/<slug> → 200 { ok: true }", async () => {
    const res = await deleteReq(admin, `/api/orgs/${ORG_SLUG}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("DB : l'org et TOUS ses enfants sont purgés (cascade)", async () => {
    expect(await countWhere("Organization", `id = '${orgId}'`)).toBe(0);
    expect(await countWhere("OrgMember", `"organizationId" = '${orgId}'`)).toBe(0);
    expect(await countWhere("Invitation", `"organizationId" = '${orgId}'`)).toBe(0);
    expect(await countWhere("OrgSecret", `"organizationId" = '${orgId}'`)).toBe(0);
  });
});
