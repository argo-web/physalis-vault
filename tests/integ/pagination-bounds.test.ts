// Pagination bornée sur le journal d'audit.
//
// Couvre proposal "API & Headers #9" — le param `limit` est borné (clamp
// [1, 200], cf. app/api/orgs/[slug]/audit MAX_LIMIT) : un `limit` énorme ne
// permet pas d'aspirer toute la table, et un `limit` petit est bien appliqué.
//
// Scénario :
//   1. Org provisionnée (admin OWNER) + 3 secrets créés (→ 3+ logs d'audit).
//   2. limit=1 → 1 log ; limit=2 → 2 logs (le param est respecté).
//   3. limit=99999 → ≤ 200 logs (cap), et ≥ 3 (nos créations sont là).

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
const ORG_SLUG = `paginate-${SUFFIX}`;

let admin: Session;
let adminUserId = "";

type AuditResp = { logs: { id: string }[]; nextCursor: string | null };

async function getLogs(limit: number): Promise<{ id: string }[]> {
  const res = await admin.fetch(`/api/orgs/${ORG_SLUG}/audit?limit=${limit}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as AuditResp;
  return body.logs;
}

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

  // 3 secrets → 3 entrées d'audit ORG_SECRET_CREATE dans cette org.
  for (let i = 1; i <= 3; i++) {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/secrets`, {
      key: `PAGINATE_${i}_${SUFFIX}`,
      value: "v",
    });
    if (![200, 201].includes(res.status)) {
      throw new Error(`secret create ${i} failed: HTTP ${res.status}`);
    }
  }

  // L'écriture d'audit est asynchrone : on attend d'avoir ≥ 3 logs.
  for (let i = 0; i < 12; i++) {
    if ((await getLogs(200)).length >= 3) break;
    await new Promise((r) => setTimeout(r, 300));
  }
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
});

describe("Pagination bornée du journal d'audit (API & Headers #9)", () => {
  it("limit=1 → exactement 1 log (param respecté)", async () => {
    expect((await getLogs(1)).length).toBe(1);
  });

  it("limit=2 → exactement 2 logs", async () => {
    expect((await getLogs(2)).length).toBe(2);
  });

  it("limit=99999 → ≤ 200 (cap) et ≥ 3 (pas de dump illimité)", async () => {
    const logs = await getLogs(99999);
    expect(logs.length).toBeLessThanOrEqual(200);
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});
