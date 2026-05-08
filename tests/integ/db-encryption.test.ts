import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Session, adminSession, postJson, deleteReq } from "./helpers/api";
import { execSql, selectRows } from "./helpers/db";

const PROJECT_NAME = `test-db-${Date.now()}`;
let PROJECT_SLUG = "";
const PLAINTEXT_VALUE = "postgres://USER:S3CR3T-MARKER-XXX@db/x";
const PLAINTEXT_VALUE2 = "another-secret-zzz";

let admin: Session;

beforeAll(async () => {
  admin = await adminSession();
  const res = await postJson(admin, "/api/projects", { name: PROJECT_NAME });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
  const data = (await res.json()) as { project: { slug: string } };
  PROJECT_SLUG = data.project.slug;

  // 2 secrets identiques pour vérifier l'IV unique.
  await postJson(admin, `/api/projects/${PROJECT_SLUG}/production/secrets`, {
    key: "DATABASE_URL",
    value: PLAINTEXT_VALUE,
  });
  await postJson(admin, `/api/projects/${PROJECT_SLUG}/staging/secrets`, {
    key: "DATABASE_URL",
    value: PLAINTEXT_VALUE, // même valeur, env différent
  });
  await postJson(admin, `/api/projects/${PROJECT_SLUG}/production/secrets`, {
    key: "API_KEY",
    value: PLAINTEXT_VALUE2,
  });
});

afterAll(async () => {
  if (admin) await deleteReq(admin, `/api/projects/${PROJECT_SLUG}`);
});

describe("DB-level encryption", () => {
  it("la valeur stockée n'est pas le plaintext", async () => {
    // SELECT direct dans la DB via docker exec.
    const rows = await selectRows(
      `SELECT key, "encryptedValue" FROM "Secret" s
       JOIN "Environment" e ON e.id = s."environmentId"
       JOIN "Project" p ON p.id = e."projectId"
       WHERE p.slug = '${PROJECT_SLUG}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const [, encryptedValue] = row.split("|");
      expect(encryptedValue).toBeDefined();
      expect(encryptedValue).not.toContain(PLAINTEXT_VALUE);
      expect(encryptedValue).not.toContain("S3CR3T-MARKER-XXX");
      // Doit être base64 (caractères standard).
      expect(encryptedValue).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });

  it("deux secrets avec la même valeur ont des IV différents", async () => {
    const rows = await selectRows(
      `SELECT iv, "encryptedValue" FROM "Secret" s
       JOIN "Environment" e ON e.id = s."environmentId"
       JOIN "Project" p ON p.id = e."projectId"
       WHERE p.slug = '${PROJECT_SLUG}' AND s.key = 'DATABASE_URL'`,
    );
    expect(rows.length).toBe(2);
    const [iv1] = rows[0]!.split("|");
    const [iv2] = rows[1]!.split("|");
    expect(iv1).not.toBe(iv2);
    // Les ciphertexts diffèrent aussi.
    const [, c1] = rows[0]!.split("|");
    const [, c2] = rows[1]!.split("|");
    expect(c1).not.toBe(c2);
  });

  it("le tag GCM est présent et au format base64 (16 octets = 24 chars)", async () => {
    const rows = await selectRows(
      `SELECT tag FROM "Secret" s
       JOIN "Environment" e ON e.id = s."environmentId"
       JOIN "Project" p ON p.id = e."projectId"
       WHERE p.slug = '${PROJECT_SLUG}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const tag of rows) {
      // Tag GCM = 16 octets bruts = 24 chars base64 (avec padding).
      expect(tag).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(tag.length).toBeLessThanOrEqual(24);
      expect(tag.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("MachineToken stocke le hash, pas le token", async () => {
    // Crée un token et vérifie qu'on ne retrouve pas la valeur en base.
    const tokRes = await postJson(admin, "/api/tokens", {
      project: PROJECT_SLUG,
      environment: "production",
      name: "db-test-token",
    });
    const { token } = (await tokRes.json()) as { token: string };
    expect(token).toMatch(/^sv_[0-9a-f]{64}$/);

    // SELECT du tokenHash : doit être un hex SHA-256, pas le token.
    const hash = await execSql(
      `SELECT "tokenHash" FROM "MachineToken" mt
       JOIN "Project" p ON p.id = mt."projectId"
       WHERE p.slug = '${PROJECT_SLUG}' AND mt.name = 'db-test-token'`,
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hash).not.toContain(token.slice(3)); // partie hex sans préfixe
  });
});
