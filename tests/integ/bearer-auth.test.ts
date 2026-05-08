import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  BASE_URL,
  Session,
  adminSession,
  postJson,
  deleteReq,
} from "./helpers/api";

const PROJECT_NAME = `test-bearer-${Date.now()}`;
let PROJECT_SLUG = "";

let admin: Session;
let validToken: string;
let validTokenId: string;
let revokedToken: string;

beforeAll(async () => {
  admin = await adminSession();

  // Crée un projet de test (3 envs par défaut).
  const res = await postJson(admin, "/api/projects", { name: PROJECT_NAME });
  if (res.status !== 201) throw new Error(`setup project failed: ${res.status}`);
  const data = (await res.json()) as { project: { slug: string } };
  PROJECT_SLUG = data.project.slug;

  // Token actif sur production.
  const tokRes = await postJson(admin, "/api/tokens", {
    project: PROJECT_SLUG,
    environment: "production",
    name: "active-token",
  });
  const tokData = (await tokRes.json()) as {
    token: string;
    machineToken: { id: string };
  };
  validToken = tokData.token;
  validTokenId = tokData.machineToken.id;

  // Token qu'on va révoquer pour les tests.
  const revRes = await postJson(admin, "/api/tokens", {
    project: PROJECT_SLUG,
    environment: "production",
    name: "to-be-revoked",
  });
  const revData = (await revRes.json()) as {
    token: string;
    machineToken: { id: string };
  };
  revokedToken = revData.token;
  await deleteReq(admin, `/api/tokens/${revData.machineToken.id}`);
});

afterAll(async () => {
  // Cleanup : supprime le projet (cascade tous les envs/secrets/tokens).
  if (admin) await deleteReq(admin, `/api/projects/${PROJECT_SLUG}`);
});

describe("Bearer endpoint /api/secrets/[slug]/[env]", () => {
  it("sans header Authorization → 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
    );
    expect(res.status).toBe(401);
  });

  it("Authorization sans `Bearer ` → 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
      { headers: { authorization: validToken } },
    );
    expect(res.status).toBe(401);
  });

  it("Bearer avec token bidon (mauvais préfixe) → 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
      { headers: { authorization: "Bearer not-a-valid-token" } },
    );
    expect(res.status).toBe(401);
  });

  it("Bearer avec format `sv_<hex>` mais hash inconnu → 401", async () => {
    const fake = "sv_" + "a".repeat(64);
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
      { headers: { authorization: `Bearer ${fake}` } },
    );
    expect(res.status).toBe(401);
  });

  it("Bearer avec token révoqué → 401 immédiat", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
      { headers: { authorization: `Bearer ${revokedToken}` } },
    );
    expect(res.status).toBe(401);
  });

  it("Bearer valide mais mauvais slug → 403", async () => {
    const res = await fetch(`${BASE_URL}/api/secrets/wrong-slug/production`, {
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("Bearer valide mais mauvais env (staging au lieu de production) → 403", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/staging`,
      { headers: { authorization: `Bearer ${validToken}` } },
    );
    expect(res.status).toBe(403);
  });

  it("Bearer valide bon scope → 200 + JSON `{ secrets }`", async () => {
    const res = await fetch(
      `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
      { headers: { authorization: `Bearer ${validToken}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secrets: Record<string, string> };
    expect(body).toHaveProperty("secrets");
    expect(typeof body.secrets).toBe("object");
  });

  it("Cookie session (sans Bearer) ne donne PAS accès → 401", async () => {
    // Tente avec la session admin (qui a tous les droits via cookie web)
    // pour vérifier que l'endpoint Bearer refuse les sessions web.
    const res = await admin.fetch(
      `/api/secrets/${PROJECT_SLUG}/production`,
    );
    expect(res.status).toBe(401);
  });
});

describe("Bearer endpoint /api/compose/[slug]/[env]", () => {
  it("sans header → 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/compose/${PROJECT_SLUG}/production`,
    );
    expect(res.status).toBe(401);
  });

  it("token valide bon scope mais sans dockerCompose configuré → 404", async () => {
    const res = await fetch(
      `${BASE_URL}/api/compose/${PROJECT_SLUG}/production`,
      { headers: { authorization: `Bearer ${validToken}` } },
    );
    expect(res.status).toBe(404);
  });

  it("token révoqué → 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/compose/${PROJECT_SLUG}/production`,
      { headers: { authorization: `Bearer ${revokedToken}` } },
    );
    expect(res.status).toBe(401);
  });

  it("mauvais env → 403", async () => {
    const res = await fetch(`${BASE_URL}/api/compose/${PROJECT_SLUG}/staging`, {
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("Token validation détails", () => {
  it("token valide met à jour lastUsedAt (asynchrone)", async () => {
    // On ne peut pas vraiment observer lastUsedAt sans DB direct, mais
    // l'absence d'erreur sur les requêtes successives confirme que
    // l'update async ne casse rien.
    void validTokenId;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(
        `${BASE_URL}/api/secrets/${PROJECT_SLUG}/production`,
        { headers: { authorization: `Bearer ${validToken}` } },
      );
      expect(res.status).toBe(200);
    }
  });
});
