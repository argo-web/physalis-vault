// Validation des entrées : champs invalides → 400 propre, payload énorme →
// pas de 500.
//
// Couvre proposal "Qualité & Robustesse #1-2" — inputs vides/mal formés
// rejetés avec un message d'erreur (pas de crash), et un payload volumineux
// ne provoque pas d'erreur serveur non gérée.
//
// Scénario :
//   1. POST /api/orgs sans nom → 400 (avant même le quota).
//   2. POST secret clé vide / clé minuscule (format .env) → 400.
//   3. POST secret avec une valeur de 100 Ko → pas de 500 (géré).

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
const ORG_SLUG = `inputval-${SUFFIX}`;

let admin: Session;
let adminUserId = "";

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  const orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW())`,
  );
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${adminUserId}', '${orgId}', 'OWNER', NOW())`,
  );
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
});

describe("Validation des entrées (Qualité & Robustesse #1-2)", () => {
  it("POST /api/orgs sans nom → 400", async () => {
    const res = await postJson(admin, "/api/orgs", {});
    expect(res.status).toBe(400);
  });

  it("POST /api/orgs nom vide (espaces) → 400", async () => {
    const res = await postJson(admin, "/api/orgs", { name: "   " });
    expect(res.status).toBe(400);
  });

  it("POST secret clé vide → 400", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
      key: "",
      value: "x",
    });
    expect(res.status).toBe(400);
  });

  it("POST secret clé non conforme (.env UPPERCASE) → 400", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
      key: "badlower",
      value: "x",
    });
    expect(res.status).toBe(400);
  });

  it("POST secret valeur de 100 Ko → pas de 500 (géré)", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
      key: `BIGVAL_${SUFFIX}`,
      value: "A".repeat(100_000),
    });
    expect(res.status).toBeLessThan(500);
  });
});
