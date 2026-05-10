import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  Session,
  adminSession,
  loginAs,
  postJson,
  deleteReq,
  patchJson,
  BASE_URL,
  TENANT_SCHEMA,
  TENANT_SLUG,
  TENANT_HOST,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const PROJECT_NAME = `test-rbac-${SUFFIX}`;
let PROJECT_SLUG = "";
const BOB_EMAIL = `bob-${SUFFIX}@test.local`;
const BOB_PASSWORD = "bobtestpassword12";

let admin: Session;
let adminOrgId = "";
let bobUserId = "";
let bobSession: Session;
let projectId = "";

/**
 * Provisionne Bob via l'invitation token + register-and-accept :
 * on génère un token random, on insère manuellement la ligne Invitation
 * dans la base (avec son hash), puis on appelle l'endpoint
 * `register-and-accept` avec le token plaintext.
 *
 * Cela évite d'avoir à activer ALLOW_REGISTRATION ou à scraper les emails.
 */
async function provisionBobAsOrgMember(orgId: string, invitedById: string) {
  const token = "iv_" + randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = "ck" + randomBytes(11).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+00");

  // INSERT direct dans la DB.
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", "invitedById", "createdAt")
     VALUES ('${id}', '${BOB_EMAIL}', '${orgId}', 'MEMBER', '${tokenHash}', '${expiresAt}', '${invitedById}', NOW())`,
  );

  // Accept via HTTP (crée le user + valide l'invite).
  // X-Forwarded-Host : la route déduit le tenant slug depuis le hostname
  // pour valider que l'invite est bien acceptée depuis le bon workspace.
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`register-and-accept failed: HTTP ${res.status} — ${text}`);
  }
}

beforeAll(async () => {
  admin = await adminSession();

  // Récupère l'orgId admin et son userId pour les FK.
  adminOrgId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = 'admin'`)
  ).trim();
  const adminUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = 'admin@artpotentiel.fr'`)
  ).trim();
  if (!adminOrgId || !adminUserId) {
    throw new Error("Admin org or user not found in DB");
  }

  // Crée le projet (admin est OrgOWNER → ProjectOWNER implicite).
  const projRes = await postJson(admin, "/api/projects", {
    name: PROJECT_NAME,
  });
  if (projRes.status !== 201) {
    throw new Error(`project create: ${projRes.status}`);
  }
  const projData = (await projRes.json()) as {
    project: { id: string; slug: string };
  };
  projectId = projData.project.id;
  PROJECT_SLUG = projData.project.slug;

  // Provisionne Bob comme OrgMember.
  await provisionBobAsOrgMember(adminOrgId, adminUserId);
  bobUserId = (
    await execSql(`SELECT id FROM "${TENANT_SCHEMA}"."User" WHERE email = '${BOB_EMAIL}'`)
  ).trim();

  bobSession = await loginAs(BOB_EMAIL, BOB_PASSWORD, undefined, TENANT_SLUG);
});

afterAll(async () => {
  if (admin && PROJECT_SLUG) {
    await deleteReq(admin, `/api/projects/${PROJECT_SLUG}`).catch(() => {});
  }
  // Cleanup Bob (cascade supprime invitation + orgmember).
  if (bobUserId) {
    await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE id = '${bobUserId}'`).catch(
      () => {},
    );
  }
});

describe("RBAC — OrgMember sans ProjectMember explicite", () => {
  it("Bob (OrgMember) ne peut PAS lire un projet sans être ProjectMember", async () => {
    const res = await bobSession.fetch(`/api/projects/${PROJECT_SLUG}`);
    expect(res.status).toBe(403);
  });

  it("Bob ne peut PAS créer de secret sans accès projet", async () => {
    const res = await postJson(
      bobSession,
      `/api/projects/${PROJECT_SLUG}/production/secrets`,
      { key: "FORBIDDEN", value: "x" },
    );
    expect(res.status).toBe(403);
  });
});

describe("RBAC — VIEWER sur le projet", () => {
  beforeAll(async () => {
    // Ajoute Bob comme ProjectMember VIEWER via INSERT direct (pas d'API
    // pour ça encore — c'est un point pour la todo).
    const id = "ck" + randomBytes(11).toString("hex");
    await execSql(
      `INSERT INTO "${TENANT_SCHEMA}"."ProjectMember" (id, "userId", "projectId", role)
       VALUES ('${id}', '${bobUserId}', '${projectId}', 'VIEWER')`,
    );
    // Setup : admin met une clé pour qu'on puisse tester reveal.
    await postJson(
      admin,
      `/api/projects/${PROJECT_SLUG}/production/secrets`,
      { key: "DATABASE_URL", value: "secret-value-1" },
    );
  });

  it("VIEWER peut GET le projet", async () => {
    const res = await bobSession.fetch(`/api/projects/${PROJECT_SLUG}`);
    expect(res.status).toBe(200);
  });

  it("VIEWER peut lister les clés", async () => {
    const res = await bobSession.fetch(
      `/api/projects/${PROJECT_SLUG}/production/secrets`,
    );
    expect(res.status).toBe(200);
  });

  it("VIEWER peut révéler une valeur", async () => {
    const res = await bobSession.fetch(
      `/api/projects/${PROJECT_SLUG}/production/secrets/DATABASE_URL`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string };
    expect(body.value).toBe("secret-value-1");
  });

  it("VIEWER ne peut PAS créer de secret → 403", async () => {
    const res = await postJson(
      bobSession,
      `/api/projects/${PROJECT_SLUG}/production/secrets`,
      { key: "VIEWER_TRIES", value: "nope" },
    );
    expect(res.status).toBe(403);
  });

  it("VIEWER ne peut PAS supprimer de secret → 403", async () => {
    const res = await deleteReq(
      bobSession,
      `/api/projects/${PROJECT_SLUG}/production/secrets/DATABASE_URL`,
    );
    expect(res.status).toBe(403);
  });

  it("VIEWER ne peut PAS créer de machine token → 403", async () => {
    const res = await postJson(bobSession, "/api/tokens", {
      project: PROJECT_SLUG,
      environment: "production",
      name: "viewer-attempt",
    });
    expect(res.status).toBe(403);
  });

  it("VIEWER ne peut PAS modifier le projet → 403", async () => {
    const res = await patchJson(bobSession, `/api/projects/${PROJECT_SLUG}`, {
      name: "Hacked",
    });
    expect(res.status).toBe(403);
  });
});
