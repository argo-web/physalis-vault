// Test des attributs des cookies de session NextAuth.
//
// Couvre proposal Auth #9 — Secure / HttpOnly / SameSite.
//
// Critères de sécurité :
//   - HttpOnly  : interdit l'accès JS (anti-XSS)
//   - Secure    : interdit l'envoi en HTTP clair (testé en prod via HTTPS)
//   - SameSite  : Lax ou Strict — anti-CSRF
//
// Note : en local sur http:// le flag Secure peut être absent (NextAuth
// ne le pose pas en HTTP non sécurisé). On vérifie HttpOnly + SameSite
// systématiquement, et Secure SI la stack tourne sur HTTPS.

import { describe, it, expect } from "vitest";
import { ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL } from "./helpers/api";

/**
 * Login brut sans le helper Session, pour récupérer les Set-Cookie
 * complets (avec attributs Secure/HttpOnly/SameSite).
 *
 * Chaque appel utilise une IP simulée unique pour ne pas saturer le
 * rate-limit (5 tentatives / 15min / IP).
 */
function uniqueFakeIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
}

async function loginRaw(): Promise<string[]> {
  const ip = uniqueFakeIp();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: { "x-forwarded-for": ip },
  });
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // Reconstruit le cookie csrf pour l'envoyer au callback.
  const csrfCookieHeader = csrfCookies
    .map((sc) => sc.split(";")[0])
    .join("; ");

  const body = new URLSearchParams({
    csrfToken,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }).toString();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookieHeader,
      "x-forwarded-for": ip,
    },
    body,
    redirect: "manual",
  });

  expect(loginRes.status).toBe(302);
  return loginRes.headers.getSetCookie?.() ?? [];
}

describe("Cookie attributes (Auth #9)", () => {
  it("le cookie de session est posé après login", async () => {
    const cookies = await loginRaw();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(authjs|next-auth)\.session-token=/.test(c),
    );
    expect(sessionCookie).toBeDefined();
  });

  it("le cookie de session a HttpOnly", async () => {
    const cookies = await loginRaw();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(authjs|next-auth)\.session-token=/.test(c),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.toLowerCase()).toMatch(/;\s*httponly\b/);
  });

  it("le cookie de session a SameSite=Lax (anti-CSRF)", async () => {
    const cookies = await loginRaw();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(authjs|next-auth)\.session-token=/.test(c),
    );
    expect(sessionCookie).toBeDefined();
    // NextAuth pose SameSite=Lax par défaut. Strict serait OK aussi.
    expect(sessionCookie!.toLowerCase()).toMatch(/;\s*samesite=(lax|strict)\b/);
  });

  it("le cookie csrfToken a aussi HttpOnly + SameSite", async () => {
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const cookies = csrfRes.headers.getSetCookie?.() ?? [];
    const csrfCookie = cookies.find((c) =>
      /^(__Host-)?(authjs|next-auth)\.csrf-token=/.test(c),
    );
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie!.toLowerCase()).toMatch(/;\s*httponly\b/);
    expect(csrfCookie!.toLowerCase()).toMatch(/;\s*samesite=(lax|strict)\b/);
  });

  it("Secure flag posé SI la stack tourne en HTTPS", async () => {
    if (!BASE_URL.startsWith("https://")) {
      // Skip : local en HTTP, NextAuth ne pose pas Secure (et c'est OK).
      return;
    }
    const cookies = await loginRaw();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(authjs|next-auth)\.session-token=/.test(c),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.toLowerCase()).toMatch(/;\s*secure\b/);
    // Bonus en prod : préfixe __Secure- attendu.
    expect(sessionCookie!).toMatch(/^__Secure-/);
  });

  it("le cookie de session n'expose pas Domain= (pas de fuite cross-subdomain)", async () => {
    const cookies = await loginRaw();
    const sessionCookie = cookies.find((c) =>
      /^(__Secure-)?(authjs|next-auth)\.session-token=/.test(c),
    );
    expect(sessionCookie).toBeDefined();
    // Pas de Domain= → cookie scopé exactement à l'host courant. Si Domain
    // était posé (ex. .physalis.cloud), TOUS les sous-domaines auraient
    // accès au cookie — fuite cross-tenant catastrophique.
    expect(sessionCookie!.toLowerCase()).not.toMatch(/;\s*domain=/);
  });
});
