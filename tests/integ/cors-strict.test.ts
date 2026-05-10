// Test CORS strict sur les endpoints `/api/plugin/*` consommés par
// l'extension navigateur depuis `chrome-extension://<id>`.
//
// Couvre proposal API #1 (origines autorisées) + #2 (CORS credentials
// avec wildcard).
//
// Cas testés :
//   - Origin absent → accepté (extension fetch sur host_permission, voir
//     commentaire de lib/plugin-cors.ts), authentification déléguée au
//     Bearer token. La requête peut quand même échouer en 401/4xx pour
//     d'autres raisons (token invalide, body manquant, etc.).
//   - Origin = whitelist → accepté
//   - Origin = page web tierce (https://attacker.example) → 403
//   - Aucun `Access-Control-Allow-Origin: *` quand credentials demandés
//
// Note : on attaque /api/plugin/auth qui est le 1er point d'entrée et le
// plus exposé. Les autres routes plugin (match, vault) utilisent le même
// helper `checkPluginOrigin` — vérifié en complément par tests/lib/audit-
// immutability et l'inspection visuelle.

import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers/api";

const PLUGIN_AUTH = `${BASE_URL}/api/plugin/auth`;

describe("CORS strict — /api/plugin/* (API #1, #2)", () => {
  describe("checkPluginOrigin enforcement", () => {
    it("Origin absent (extension fetch direct) → ne renvoie PAS 403 sur le check CORS", async () => {
      // Pré-requis : `PLUGIN_ALLOWED_ORIGIN` doit être configurée côté
      // serveur, sinon TOUTE requête est rejetée en 403 (kill switch).
      // En local sans cette var, on skip.
      const probe = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "chrome-extension://test-cors-probe-000000000000",
        },
        body: JSON.stringify({}),
      });
      if (probe.status === 403) {
        // Le serveur rejette TOUT, signe que PLUGIN_ALLOWED_ORIGIN n'est
        // pas configurée. Skip avec note.
        console.warn(
          "[cors-strict] PLUGIN_ALLOWED_ORIGIN non configurée — skip 'Origin absent'",
        );
        return;
      }

      // Pas d'Origin → CORS-OK selon checkPluginOrigin (fait confiance au Bearer).
      // L'auth elle-même peut échouer en 400 (body) ou 401 (creds), mais pas
      // 403 origin_not_allowed.
      const res = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      // 400 (body invalide), 401 (creds), 429 (rate limit) tous OK.
      // 403 = origin_not_allowed → KO.
      expect(res.status).not.toBe(403);
    });

    it("Origin malveillant (https://attacker.example) → 403", async () => {
      const res = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({
          email: "anyone@test.local",
          password: "doesntmatter",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("Origin web app (https://argoweb.physalis.cloud) → 403 (pas dans la whitelist plugin)", async () => {
      // L'app web n'est PAS dans PLUGIN_ALLOWED_ORIGIN — réservé aux
      // extensions. Une requête depuis le webapp DOIT être rejetée.
      const res = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://argoweb.physalis.cloud",
        },
        body: JSON.stringify({
          email: "anyone@test.local",
          password: "x",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("Origin null (string littéral) → 403", async () => {
      // "null" est l'origin envoyée par certains contextes file:// ou
      // sandboxed iframes — DOIT être rejetée.
      const res = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "null",
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Pas de wildcard dans Access-Control-Allow-Origin", () => {
    it("réponse à une requête CORS legitime ne pose JAMAIS `*` (anti-credentials)", async () => {
      // Tente une requête avec Origin malveillant — la réponse 403 ne
      // doit jamais contenir `Access-Control-Allow-Origin: *` (qui
      // permettrait à n'importe qui d'inspecter le body).
      const res = await fetch(PLUGIN_AUTH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({}),
      });
      const allowOrigin = res.headers.get("access-control-allow-origin");
      expect(allowOrigin).not.toBe("*");
    });

    it("preflight OPTIONS rejette aussi les origins non whitelistées", async () => {
      const res = await fetch(PLUGIN_AUTH, {
        method: "OPTIONS",
        headers: {
          origin: "https://attacker.example",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, authorization",
        },
      });
      // 204 (impl actuelle : preflightResponse renvoie 204 sans
      // Access-Control-Allow-Origin si origin pas dans whitelist), donc
      // le navigateur bloquera la vraie requête car aucun ACAO header.
      // L'attendu : pas d'ACAO ou ACAO !== `*` ni l'origin malveillant.
      const acao = res.headers.get("access-control-allow-origin");
      expect(acao).not.toBe("*");
      expect(acao).not.toBe("https://attacker.example");
    });
  });

  describe("Aucune route hors plugin/* n'expose CORS plugin", () => {
    it("/api/secrets/[slug]/[env] (Bearer machine) ignore Origin (ce n'est pas du CORS plugin)", async () => {
      // Endpoint Bearer machine n'est pas un endpoint plugin. Pas de check
      // checkPluginOrigin. Une requête depuis un attacker origin avec
      // mauvais Bearer doit retourner 401 (pas 403 origin).
      const res = await fetch(`${BASE_URL}/api/secrets/test/main`, {
        headers: {
          authorization: "Bearer sv_invalid_token",
          origin: "https://attacker.example",
        },
      });
      // 401 attendu (token invalide). Pas 403 origin_not_allowed.
      expect(res.status).toBe(401);
    });
  });
});
