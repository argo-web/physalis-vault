// Quota de création d'organisation par plan.
//
// Couvre proposal "Orgs & Users #1" — créer une org au-delà de `maxOrgs`
// (= max_orgs + extra_orgs du client) est rejeté en 403 (cf. lib/quotas.ts
// checkOrgQuota + app/api/orgs POST).
//
// Méthode déterministe : on ajuste TEMPORAIREMENT la limite du client de
// test dans admin.clients (save/restore en afterAll), au lieu de créer des
// dizaines d'orgs dans le tenant partagé.
//
// Scénario :
//   1. Limite forcée à 0 (< nb d'orgs existantes) → POST /api/orgs → 403.
//   2. Limite forcée haute → POST /api/orgs → 201 ; org créée puis nettoyée.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Session,
  adminSession,
  postJson,
  deleteReq,
  TENANT_SLUG,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const NEW_ORG_NAME = `Quota Test ${SUFFIX}`;

let admin: Session;
let origMaxOrgs = "";
let origExtraOrgs = "";
let createdSlug = "";

async function setLimits(maxOrgs: number, extraOrgs: number) {
  await execSql(
    `UPDATE admin."clients" SET max_orgs = ${maxOrgs}, extra_orgs = ${extraOrgs}
     WHERE slug = '${TENANT_SLUG}'`,
  );
}

beforeAll(async () => {
  admin = await adminSession();
  const row = await execSql(
    `SELECT max_orgs, extra_orgs FROM admin."clients" WHERE slug = '${TENANT_SLUG}'`,
  );
  [origMaxOrgs, origExtraOrgs] = row.trim().split("|");
  if (!origMaxOrgs) throw new Error("Client de test introuvable dans admin.clients");
});

afterAll(async () => {
  // Restaure la limite d'origine.
  await setLimits(Number(origMaxOrgs), Number(origExtraOrgs));
  // Nettoie l'org éventuellement créée par le test "autorisé".
  if (createdSlug) {
    await deleteReq(admin, `/api/orgs/${createdSlug}`);
  }
});

describe("Quota de création d'organisation (Orgs & Users #1)", () => {
  it("au-delà du quota (limite 0) → 403", async () => {
    await setLimits(0, 0);
    const res = await postJson(admin, "/api/orgs", { name: NEW_ORG_NAME });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/quota d'organisations/i);
  });

  it("sous le quota (limite haute) → 201 et org créée", async () => {
    await setLimits(Number(origMaxOrgs) + 50, Number(origExtraOrgs));
    const res = await postJson(admin, "/api/orgs", { name: NEW_ORG_NAME });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { organization?: { slug?: string } };
    createdSlug = body.organization?.slug ?? "";
    expect(createdSlug).not.toBe("");
  });
});
