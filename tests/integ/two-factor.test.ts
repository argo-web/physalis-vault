import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generate } from "otplib";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  Session,
  loginAs,
  postJson,
  deleteReq,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ALICE_EMAIL = `alice-2fa-${SUFFIX}@test.local`;
const ALICE_PASSWORD = "alicetestpassword12";
let aliceUserId = "";

/**
 * Crée Alice via insert direct (la registration publique est off). Bypass
 * volontaire pour avoir un compte de test indépendant de admin.
 */
async function provisionAlice() {
  const id = "ck" + randomBytes(11).toString("hex");
  const passwordHash = await bcrypt.hash(ALICE_PASSWORD, 12);
  await execSql(
    `INSERT INTO "User" (id, email, password, role, "createdAt")
     VALUES ('${id}', '${ALICE_EMAIL}', '${passwordHash}', 'MEMBER', NOW())`,
  );
  // Créer une org pour elle (sinon LOGIN_SUCCESS ne sait pas où rattacher).
  const orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', 'alice org', 'alice-2fa-${SUFFIX}', NOW())`,
  );
  const memId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('${memId}', '${id}', '${orgId}', 'OWNER', NOW())`,
  );
  return id;
}

beforeAll(async () => {
  aliceUserId = await provisionAlice();
});

afterAll(async () => {
  if (aliceUserId) {
    await execSql(
      `DELETE FROM "User" WHERE id = '${aliceUserId}'`,
    ).catch(() => {});
    await execSql(
      `DELETE FROM "Organization" WHERE slug = 'alice-2fa-${SUFFIX}'`,
    ).catch(() => {});
  }
});

describe("2FA — flow d'activation", () => {
  let aliceSession: Session;
  let setupSecret: string;
  let backupCodes: string[] = [];

  it("Alice peut se logger sans 2FA initialement", async () => {
    aliceSession = await loginAs(ALICE_EMAIL, ALICE_PASSWORD);
    expect(aliceSession).toBeDefined();
  });

  it("GET /api/me/2fa retourne enabled=false", async () => {
    const res = await aliceSession.fetch("/api/me/2fa");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });

  it("POST /api/me/2fa/setup retourne secret + qrDataUrl", async () => {
    const res = await postJson(aliceSession, "/api/me/2fa/setup", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      secret: string;
      otpauthUrl: string;
      qrDataUrl: string;
    };
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    setupSecret = body.secret;
  });

  it("le secret est chiffré en base (pas en clair)", async () => {
    const stored = await execSql(
      `SELECT "twoFactorSecret" FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(setupSecret);
    // Doit être base64.
    expect(stored).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("verify avec mauvais code → 401, 2FA reste off", async () => {
    const res = await postJson(aliceSession, "/api/me/2fa/verify", {
      code: "000000",
    });
    expect(res.status).toBe(401);

    const enabled = await execSql(
      `SELECT "twoFactorEnabled" FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(enabled).toBe("f");
  });

  it("verify avec bon code → 200 + 8 backup codes + 2FA active", async () => {
    const code = await generate({ secret: setupSecret });
    const res = await postJson(aliceSession, "/api/me/2fa/verify", { code });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { backupCodes: string[] };
    expect(body.backupCodes).toHaveLength(8);
    backupCodes = body.backupCodes;

    const enabled = await execSql(
      `SELECT "twoFactorEnabled" FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(enabled).toBe("t");
  });

  it("setup à nouveau alors que 2FA active → 409", async () => {
    const res = await postJson(aliceSession, "/api/me/2fa/setup", {});
    expect(res.status).toBe(409);
  });

  // ── Login avec 2FA ──────────────────────────────────────────────────────

  it("login sans totpCode → erreur 2fa_required", async () => {
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: ALICE_EMAIL,
      password: ALICE_PASSWORD,
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error=");
    // Pas de cookie session valide créé.
    expect(session.hasCookie("authjs.session-token")).toBe(false);
  });

  it("login avec totpCode invalide → erreur 2fa_invalid", async () => {
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: ALICE_EMAIL,
      password: ALICE_PASSWORD,
      totpCode: "000000",
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(302);
    expect(session.hasCookie("authjs.session-token")).toBe(false);
  });

  it("login avec bon totpCode → session créée", async () => {
    const code = await generate({ secret: setupSecret });
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: ALICE_EMAIL,
      password: ALICE_PASSWORD,
      totpCode: code,
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(302);
    // La session doit être créée.
    expect(session.hasCookie("authjs.session-token")).toBe(true);
  });

  it("login avec backup code valide → session créée + code retiré", async () => {
    const usedBackup = backupCodes[0]!;
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: ALICE_EMAIL,
      password: ALICE_PASSWORD,
      totpCode: usedBackup,
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(302);
    expect(session.hasCookie("authjs.session-token")).toBe(true);

    // Le code utilisé est retiré : il reste 7 codes dans backupCodes.
    const remaining = await execSql(
      `SELECT cardinality("backupCodes") FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(remaining).toBe("7");
  });

  it("réutilisation du même backup code → refus", async () => {
    const usedBackup = backupCodes[0]!; // déjà utilisé
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: ALICE_EMAIL,
      password: ALICE_PASSWORD,
      totpCode: usedBackup,
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(302);
    expect(session.hasCookie("authjs.session-token")).toBe(false);
  });

  // ── Désactivation ───────────────────────────────────────────────────────

  it("désactivation sans code → 400", async () => {
    const res = await deleteReq(aliceSession, "/api/me/2fa");
    // deleteReq ne passe pas de body, donc 400 attendu.
    expect(res.status).toBe(400);
  });

  it("désactivation avec mauvais code → 401, 2FA reste active", async () => {
    const res = await aliceSession.fetch("/api/me/2fa", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "000000" }),
    });
    expect(res.status).toBe(401);

    const enabled = await execSql(
      `SELECT "twoFactorEnabled" FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(enabled).toBe("t");
  });

  it("désactivation avec bon code TOTP → 200 + secret/codes effacés", async () => {
    const code = await generate({ secret: setupSecret });
    const res = await aliceSession.fetch("/api/me/2fa", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(200);

    const row = await execSql(
      `SELECT "twoFactorEnabled", "twoFactorSecret" IS NULL, cardinality("backupCodes")
       FROM "User" WHERE id = '${aliceUserId}'`,
    );
    expect(row).toBe("f|t|0");
  });
});

describe("2FA — audit log", () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  it("contient les actions 2FA tracées", async () => {
    // Toutes ces actions n'ont pas d'organizationId pour Alice (non rattachée
    // à l'org admin), mais elles sont visibles via une query DB directe.
    const rows = await execSql(
      `SELECT action FROM "AccessLog"
       WHERE "actorUserEmail" = '${ALICE_EMAIL}' OR "actorUserId" = '${aliceUserId}'
       ORDER BY "createdAt" ASC`,
    );
    const actions = rows.split("\n");
    expect(actions).toContain("TWO_FACTOR_ENABLED");
    expect(actions).toContain("TWO_FACTOR_SUCCESS");
    expect(actions).toContain("BACKUP_CODE_USED");
    expect(actions).toContain("TWO_FACTOR_DISABLED");
    void admin; // silencieux
  });

  it("contient TWO_FACTOR_FAILURE pour les codes invalides", async () => {
    const rows = await execSql(
      `SELECT count(*) FROM "AccessLog"
       WHERE action = 'TWO_FACTOR_FAILURE'
       AND ("actorUserEmail" = '${ALICE_EMAIL}'
            OR (metadata->>'email') = '${ALICE_EMAIL}')`,
    );
    expect(Number(rows)).toBeGreaterThan(0);
  });
});
