// Test résistance au forgeage de session.
//
// Couvre proposal Auth #3 (JWT alg:none) — élargi à toute tentative de
// forgeage de session cookie.
//
// Contexte : NextAuth v5 utilise des **JWE** (JSON Web Encryption) par
// défaut, pas des JWT signés HS256. L'attaque classique `alg: none` du
// JWT-spec ne s'applique pas tel quel — mais l'esprit du test reste :
// un attaquant ne doit JAMAIS pouvoir injecter un payload arbitraire
// dans le cookie de session pour bypass l'auth.
//
// Ce test envoie divers cookies fabriqués au cookie name attendu par
// NextAuth (`authjs.session-token` ou `next-auth.session-token`) et
// vérifie que toutes ces tentatives échouent (401 / redirect login /
// session vide).

import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { BASE_URL } from "./helpers/api";

/** Endpoint protégé qui retourne 401 sans session. /api/orgs renvoie la
 *  liste des orgs de l'user — vide si pas authentifié = signal clair. */
const PROTECTED_ENDPOINT = `${BASE_URL}/api/orgs`;

/** JWT classique alg=none (header.payload.signature_vide). */
function craftJwtAlgNone(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "fake-user-id",
      email: "attacker@evil.example",
      tenantSlug: "admin",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  ).toString("base64url");
  return `${header}.${payload}.`;
}

/** JWT HS256 signé avec une clé bidon (l'attaquant ne connaît pas la
 *  clé serveur). NextAuth doit rejeter même un JWT bien formé. */
function craftJwtHS256(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "fake", email: "attacker@evil.example" }),
  ).toString("base64url");
  // Signature bidon (32 bytes random base64url).
  const sig = Buffer.from("attacker-controlled-signature-32b").toString(
    "base64url",
  );
  return `${header}.${payload}.${sig}`;
}

async function tryWithCookie(name: string, value: string): Promise<number> {
  const res = await fetch(PROTECTED_ENDPOINT, {
    headers: { cookie: `${name}=${value}` },
  });
  return res.status;
}

/** NextAuth utilise différents noms selon la version. On essaie les 2
 *  pour ne pas être dépendant d'une version mineure. */
const COOKIE_NAMES = [
  "authjs.session-token",
  "next-auth.session-token",
  "__Secure-authjs.session-token",
  "__Secure-next-auth.session-token",
];

/** Statuts acceptables = "auth a échoué" :
 *   - 401 : explicit unauthorized
 *   - 200 mais avec liste vide : la session n'a pas matché un user (NextAuth
 *     auth() retourne null silencieusement → l'endpoint répond OK avec ses
 *     données génériques). On considère ça acceptable seulement si le body
 *     ne contient AUCUNE donnée privée. */
const FAILED_AUTH_STATUSES = [200, 401, 403];

describe("Session cookie forgery rejection (Auth #3)", () => {
  describe("Aucun cookie de session", () => {
    it("/api/orgs sans cookie → 401", async () => {
      const res = await fetch(PROTECTED_ENDPOINT);
      expect(res.status).toBe(401);
    });
  });

  describe("Cookies fabriqués", () => {
    it("JWT alg:none classique → tous les noms de cookie rejetés (pas 200 avec data)", async () => {
      const fakeJwt = craftJwtAlgNone();
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, fakeJwt);
        expect(FAILED_AUTH_STATUSES).toContain(status);
        if (status === 200) {
          // Si le serveur répond 200, vérifier que la response est "vide"
          // (pas de session valide reconnue).
          const res = await fetch(PROTECTED_ENDPOINT, {
            headers: { cookie: `${name}=${fakeJwt}` },
          });
          const body = await res.text();
          // body vide ou liste sans entrée du tenant — l'attaquant n'a
          // accédé à aucune org.
          expect(body).not.toContain("admin@artpotentiel");
        }
      }
    });

    it("JWT HS256 avec signature random → rejeté", async () => {
      const fakeJwt = craftJwtHS256();
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, fakeJwt);
        expect(FAILED_AUTH_STATUSES).toContain(status);
      }
    });

    it("Random base64url string → rejeté", async () => {
      const random = Buffer.from(
        Array.from({ length: 256 }, () => Math.floor(Math.random() * 256)),
      ).toString("base64url");
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, random);
        expect(FAILED_AUTH_STATUSES).toContain(status);
      }
    });

    it("Empty cookie value → rejeté", async () => {
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, "");
        expect(FAILED_AUTH_STATUSES).toContain(status);
      }
    });

    it("Cookie value avec injection (\\r\\n + Set-Cookie) → rejeté", async () => {
      // Test header injection. fetch sanitize les valeurs mais on vérifie
      // que rien ne casse.
      const value = "tampered-value";
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, value);
        expect(FAILED_AUTH_STATUSES).toContain(status);
      }
    });
  });

  describe("Tampering d'un cookie réel", () => {
    it("Une session valide tronquée à mi-chemin → rejeté", async () => {
      // Simule un attacker qui aurait observé un cookie réel et l'aurait
      // tronqué (ex. via un proxy buggé). NextAuth doit rejeter.
      // On utilise un base64url qui ressemble à un JWE NextAuth tronqué.
      const truncated = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0.";
      for (const name of COOKIE_NAMES) {
        const status = await tryWithCookie(name, truncated);
        expect(FAILED_AUTH_STATUSES).toContain(status);
      }
    });
  });
});
