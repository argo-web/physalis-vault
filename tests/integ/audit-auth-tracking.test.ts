// Traçabilité des actions d'authentification dans l'audit log.
//
// Couvre proposal "Audit Log #3" — login (succès ET échec) crée une entrée
// AccessLog avec IP + user-agent (cf. lib/auth.ts logAction + lib/audit.ts
// qui capture ipAddress = X-Forwarded-For et userAgent = header User-Agent).
//
// NB : le LOGOUT n'est PAS tracé (NextAuth signOut ne passe pas par logAction,
// et l'enum AccessAction n'a pas de valeur LOGOUT) → trou connu, documenté
// dans le plan de tests, non couvert ici.
//
// Scénario :
//   1. Login réussi (UA + IP marqués) → AccessLog LOGIN_SUCCESS avec ces IP/UA.
//   2. Login échoué (mauvais mdp, UA + IP marqués) → AccessLog LOGIN_FAILURE.

import { describe, it, expect } from "vitest";
import {
  Session,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TENANT_SLUG,
  TENANT_SCHEMA,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const OK_UA = `physalis-integ-audit-ok-${SUFFIX}`;
const OK_IP = "198.51.100.21";
const FAIL_UA = `physalis-integ-audit-fail-${SUFFIX}`;
const FAIL_IP = "198.51.100.22";

/** Login manuel pour contrôler l'IP (X-Forwarded-For via Session) et le
 *  User-Agent (header custom). Retourne la réponse du callback credentials. */
async function manualLogin(ip: string, ua: string, password: string): Promise<Response> {
  const sess = new Session(ip);
  const csrfRes = await sess.fetch("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({
    csrfToken,
    email: ADMIN_EMAIL,
    password,
    tenantSlug: TENANT_SLUG,
  }).toString();
  return sess.fetch("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": ua,
    },
    body,
  });
}

/** Attend qu'une row matche (l'écriture AccessLog est asynchrone). */
async function pollOne(sql: string, tries = 12, delayMs = 300): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const out = (await execSql(sql)).trim();
    if (out) return out;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return "";
}

describe("Audit des actions d'authentification (Audit Log #3)", () => {
  it("login réussi → AccessLog LOGIN_SUCCESS avec IP + user-agent", async () => {
    const res = await manualLogin(OK_IP, OK_UA, ADMIN_PASSWORD);
    expect(res.status).toBe(302); // NextAuth credentials OK = redirect

    const ip = await pollOne(
      `SELECT "ipAddress" FROM "${TENANT_SCHEMA}"."AccessLog"
       WHERE action = 'LOGIN_SUCCESS' AND "userAgent" = '${OK_UA}'
       ORDER BY "createdAt" DESC LIMIT 1`,
    );
    expect(ip).toBe(OK_IP);
  });

  it("login échoué (mauvais mdp) → AccessLog LOGIN_FAILURE avec IP", async () => {
    await manualLogin(FAIL_IP, FAIL_UA, "wrong-password-xxxxxxxx");

    const ip = await pollOne(
      `SELECT "ipAddress" FROM "${TENANT_SCHEMA}"."AccessLog"
       WHERE action = 'LOGIN_FAILURE' AND "userAgent" = '${FAIL_UA}'
       ORDER BY "createdAt" DESC LIMIT 1`,
    );
    expect(ip).toBe(FAIL_IP);
  });
});
