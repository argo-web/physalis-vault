// Couvre proposal Audit #6 (cloisonnement) + Audit #7 (cleartext absent).
//
//   #6 : GET /api/orgs/<slugA>/audit ne doit jamais contenir d'entrées
//        d'orgB (même si AccessLog est physiquement la même table — la
//        query doit filtrer strictement sur organizationId).
//
//   #7 : la valeur cleartext d'un secret ne doit JAMAIS apparaître dans
//        une entrée d'audit log retournée à l'utilisateur (key OK, value
//        absente — incluant les metadata.before/after).
//
// Setup : 2 orgs (orgA + orgB), admin OWNER des 2. Création de secrets
// dans chaque, qui génère des entrées audit. On stringify les réponses
// JSON et on grep pour les marqueurs uniques.

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
const ORG_A_SLUG = `audit-iso-a-${SUFFIX}`;
const ORG_B_SLUG = `audit-iso-b-${SUFFIX}`;
const KEY_A = `KEY_A_${SUFFIX}`;
const KEY_B = `KEY_B_${SUFFIX}`;
// Marqueurs uniques pour grep — pas un secret réel, juste un canari.
const VALUE_A_MARKER = `cleartext-canary-A-${randomBytes(8).toString("hex")}`;
const VALUE_B_MARKER = `cleartext-canary-B-${randomBytes(8).toString("hex")}`;

let admin: Session;
let orgAId = "";
let orgBId = "";
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

beforeAll(async () => {
  admin = await adminSession();
  adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${ADMIN_EMAIL}'`)
  ).trim();
  if (!adminUserId) throw new Error("Admin user not found");

  orgAId = await provisionOrg(ORG_A_SLUG, adminUserId);
  orgBId = await provisionOrg(ORG_B_SLUG, adminUserId);

  // Crée un OrgSecret dans chaque org via API (génère une entrée audit
  // ORG_SECRET_CREATE ou similaire).
  const resA = await postJson(admin, `/api/orgs/${ORG_A_SLUG}/secrets`, {
    key: KEY_A,
    value: VALUE_A_MARKER,
  });
  if (!resA.ok && resA.status !== 201) {
    throw new Error(`Setup secret orgA failed: HTTP ${resA.status}`);
  }
  const resB = await postJson(admin, `/api/orgs/${ORG_B_SLUG}/secrets`, {
    key: KEY_B,
    value: VALUE_B_MARKER,
  });
  if (!resB.ok && resB.status !== 201) {
    throw new Error(`Setup secret orgB failed: HTTP ${resB.status}`);
  }

  // logAction est fire-and-forget côté route — laisser le temps au write
  // d'AccessLog de se committer avant les assertions.
  await new Promise((r) => setTimeout(r, 500));
});

afterAll(async () => {
  await execSql(
    `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug IN ('${ORG_A_SLUG}', '${ORG_B_SLUG}')`,
  );
});

type AuditLog = {
  id: string;
  action: string;
  organizationId: string | null;
  secretKey: string | null;
  metadata: unknown;
};

async function fetchAuditOf(slug: string): Promise<AuditLog[]> {
  const res = await admin.fetch(`/api/orgs/${slug}/audit?limit=500`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { logs?: AuditLog[]; entries?: AuditLog[] };
  // Le format peut être { logs: [...] } ou { entries: [...] } selon l'impl.
  return data.logs ?? data.entries ?? [];
}

describe("Audit log — cloisonnement par org (Audit #6)", () => {
  it("GET orgA/audit contient les actions sur KEY_A", async () => {
    const logs = await fetchAuditOf(ORG_A_SLUG);
    const keys = logs.map((l) => l.secretKey).filter(Boolean);
    expect(keys).toContain(KEY_A);
  });

  it("GET orgA/audit ne contient AUCUNE entrée de orgB", async () => {
    const logs = await fetchAuditOf(ORG_A_SLUG);
    // Aucun log avec organizationId === orgBId.
    const orgBLogs = logs.filter((l) => l.organizationId === orgBId);
    expect(orgBLogs).toHaveLength(0);
    // Aucun log avec secretKey === KEY_B (double-check via la clé).
    const orgBKeys = logs.filter((l) => l.secretKey === KEY_B);
    expect(orgBKeys).toHaveLength(0);
  });

  it("GET orgB/audit contient les actions sur KEY_B", async () => {
    const logs = await fetchAuditOf(ORG_B_SLUG);
    const keys = logs.map((l) => l.secretKey).filter(Boolean);
    expect(keys).toContain(KEY_B);
  });

  it("GET orgB/audit ne contient AUCUNE entrée de orgA", async () => {
    const logs = await fetchAuditOf(ORG_B_SLUG);
    const orgALogs = logs.filter((l) => l.organizationId === orgAId);
    expect(orgALogs).toHaveLength(0);
    const orgAKeys = logs.filter((l) => l.secretKey === KEY_A);
    expect(orgAKeys).toHaveLength(0);
  });
});

describe("Audit log — cleartext absent (Audit #7)", () => {
  it("GET orgA/audit ne contient JAMAIS la value cleartext de KEY_A", async () => {
    const logs = await fetchAuditOf(ORG_A_SLUG);
    const fullJson = JSON.stringify(logs);
    expect(fullJson).not.toContain(VALUE_A_MARKER);
  });

  it("GET orgB/audit ne contient JAMAIS la value cleartext de KEY_B", async () => {
    const logs = await fetchAuditOf(ORG_B_SLUG);
    const fullJson = JSON.stringify(logs);
    expect(fullJson).not.toContain(VALUE_B_MARKER);
  });

  it("la clé (KEY_*) EST présente — vérifie qu'on cherche bien dans des logs réels", async () => {
    // Sanity : si KEY_A n'est pas non plus dans la réponse, on ne teste
    // rien d'utile (les logs sont peut-être vides). Cette assertion fait
    // échouer le test si l'audit n'a pas tracé le secret.
    const logs = await fetchAuditOf(ORG_A_SLUG);
    const fullJson = JSON.stringify(logs);
    expect(fullJson).toContain(KEY_A);
  });

  it("la value cleartext n'est pas non plus stockée en DB dans AccessLog.metadata", async () => {
    // Vérification DB-side : grep direct sur la colonne metadata du
    // schéma tenant (client_test). Le schéma public n'est pas censé
    // avoir cette table en multi-tenant.
    const rows = await execSql(
      `SELECT COUNT(*) FROM "${TENANT_SCHEMA}"."AccessLog"
       WHERE metadata::text LIKE '%${VALUE_A_MARKER}%'
          OR metadata::text LIKE '%${VALUE_B_MARKER}%'`,
    );
    expect(rows.trim()).toBe("0");
  });
});
