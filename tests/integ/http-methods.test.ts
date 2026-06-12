// Tests HTTP 405 — méthodes non autorisées sur les routes API.
//
// Next.js App Router retourne 405 avant d'exécuter le handler quand une
// méthode n'est pas exportée par le route.ts. Ces tests vérifient que les
// routes sensibles n'exposent pas accidentellement de méthodes de mutation
// (ou de lecture) non prévues.
//
// Note : le 405 se produit avant toute vérification d'auth → pas besoin
// de session authentifiée. On utilise une session anonyme.

import { describe, it, expect } from "vitest";
import { Session } from "./helpers/api";

// Slug fictif — suffisant pour tester le routing, pas la logique métier.
const ORG = "test-org";
const PROJECT = "test-project";
const ENV = "production";
const KEY = "MY_SECRET";

const anon = new Session();


async function expect405(path: string, method: string) {
  const res = await anon.fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: ["GET", "DELETE", "HEAD"].includes(method) ? undefined : "{}",
  });
  expect(res.status, `${method} ${path} should be 405`).toBe(405);
}

// ─── Routes GET-only ─────────────────────────────────────────────────────────

describe("Routes GET-only → 405 sur mutations", () => {
  const GET_ONLY = [
    `/api/health`,
    `/api/me/orgs`,
    `/api/me/shares`,
    `/api/signup/check-slug?slug=test`,
    `/api/integrations/projects`,
    `/api/integrations/tags`,
    `/api/plugin/match`,
    `/api/plugin/tokens`,
  ];

  for (const path of GET_ONLY) {
    it(`POST ${path} → 405`, () => expect405(path, "POST"));
    it(`DELETE ${path} → 405`, () => expect405(path, "DELETE"));
    it(`PATCH ${path} → 405`, () => expect405(path, "PATCH"));
    it(`PUT ${path} → 405`, () => expect405(path, "PUT"));
  }
});

// ─── Routes POST-only ────────────────────────────────────────────────────────

describe("Routes POST-only → 405 sur GET/DELETE/PATCH", () => {
  const POST_ONLY = [
    `/api/auth/register`,
    `/api/deploy`,
    `/api/gateway/verify`,
    `/api/login-resolve`,
    `/api/me/current-org`,
    `/api/plugin/auth`,
    `/api/plugin/vault`,
    `/api/webhooks/stripe`,
  ];

  for (const path of POST_ONLY) {
    it(`GET ${path} → 405`, () => expect405(path, "GET"));
    it(`DELETE ${path} → 405`, () => expect405(path, "DELETE"));
    it(`PATCH ${path} → 405`, () => expect405(path, "PATCH"));
    it(`PUT ${path} → 405`, () => expect405(path, "PUT"));
  }
});

// ─── Routes GET+POST → pas de DELETE/PATCH/PUT ───────────────────────────────

describe("Routes GET+POST → 405 sur DELETE/PATCH/PUT", () => {
  const GET_POST = [
    `/api/orgs`,
    `/api/projects`,
    `/api/tokens`,
    `/api/user-tokens`,
    `/api/secret-requests`,
    `/api/gateway/apis?project=${PROJECT}`,
  ];

  for (const path of GET_POST) {
    it(`DELETE ${path} → 405`, () => expect405(path, "DELETE"));
    it(`PATCH ${path} → 405`, () => expect405(path, "PATCH"));
    it(`PUT ${path} → 405`, () => expect405(path, "PUT"));
  }
});

// ─── Routes GET+PATCH+DELETE → pas de POST/PUT ───────────────────────────────

describe("Routes GET+PATCH+DELETE → 405 sur POST/PUT", () => {
  const GET_PATCH_DELETE = [
    `/api/orgs/${ORG}`,
    `/api/projects/${PROJECT}`,
  ];

  for (const path of GET_PATCH_DELETE) {
    it(`POST ${path} → 405`, () => expect405(path, "POST"));
    it(`PUT ${path} → 405`, () => expect405(path, "PUT"));
  }
});

// ─── Routes critiques — vérification explicite ───────────────────────────────

describe("Routes critiques — vérification méthode par méthode", () => {
  it("DELETE /api/gateway/verify → 405 (pas de suppression de clé via verify)", () =>
    expect405("/api/gateway/verify", "DELETE"));

  it("PUT /api/deploy → 405 (deploy OIDC = POST uniquement)", () =>
    expect405("/api/deploy", "PUT"));

  it("GET /api/webhooks/stripe → 405 (webhook Stripe = POST uniquement)", () =>
    expect405("/api/webhooks/stripe", "GET"));

  it(`DELETE /api/projects/${PROJECT}/[env]/secrets → 405 (pas de bulk delete)`, () =>
    expect405(`/api/projects/${PROJECT}/${ENV}/secrets`, "DELETE"));

  it(`PUT /api/projects/${PROJECT}/[env]/secrets/[key] → 405 (pas de PUT sur secret)`, () =>
    expect405(`/api/projects/${PROJECT}/${ENV}/secrets/${KEY}`, "PUT"));
});
