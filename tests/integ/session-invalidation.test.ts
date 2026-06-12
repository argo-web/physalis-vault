// Tests d'intégration de l'invalidation des sessions (#5).
//
// Vérifie le comportement bout-en-bout de User.sessionsValidFrom :
// requireUser() rejette (401) un JWT dont le `loginAt` est antérieur à cette
// borne (posée au reset password / 2FA disable). On simule le bump via SQL
// direct (équivalent de ce que font reset-password/actions.ts et le DELETE
// 2FA) plutôt que de rejouer ces flux (token email / TOTP requis).
//
// Pré-requis : stack live + migration 20260612120000_session_invalidation
// appliquée au schéma client_test (auto-apply au boot).
//
// Sonde : GET /api/me/2fa — route authentifiée passant par requireUser() avec
// contexte tenant (donc soumise au check). 200 = session valide, 401 = coupée.

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { loginAs, ADMIN_EMAIL, ADMIN_PASSWORD, TENANT_SCHEMA } from "./helpers/api";
import { execSql } from "./helpers/db";

const PROBE = "/api/me/2fa";

/** Pose `sessionsValidFrom` sur l'admin (value = expression SQL). */
async function setValidFrom(value: string): Promise<void> {
  await execSql(
    `UPDATE ${TENANT_SCHEMA}."User" SET "sessionsValidFrom" = ${value} WHERE email = '${ADMIN_EMAIL}'`,
  );
}

// État de départ propre + nettoyage final : sans le reset à NULL, l'admin
// resterait invalidé pour les autres suites (exécution séquentielle).
beforeEach(async () => {
  await setValidFrom("NULL");
});
afterAll(async () => {
  await setValidFrom("NULL");
});

describe("#5 — invalidation des sessions", () => {
  it("session valide → route authentifiée accessible (200)", async () => {
    const s = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await s.fetch(PROBE)).status).toBe(200);
  });

  it("bump sessionsValidFrom APRÈS le login → session existante coupée (401)", async () => {
    const s = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await s.fetch(PROBE)).status).toBe(200); // valide avant le bump

    // Simule un reset password / 2FA disable survenu après l'émission du JWT.
    await setValidFrom("NOW()");

    expect((await s.fetch(PROBE)).status).toBe(401); // session invalidée
  });

  it("nouveau login APRÈS le bump → accès rétabli (200)", async () => {
    await setValidFrom("NOW()");
    // garantit loginAt(nouvelle session) > sessionsValidFrom (précision ms)
    await new Promise((r) => setTimeout(r, 1100));

    const s = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await s.fetch(PROBE)).status).toBe(200);
  });

  it("borne dans le passé (avant le login) → session conservée (200)", async () => {
    const s = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    await setValidFrom("NOW() - interval '1 hour'");
    expect((await s.fetch(PROBE)).status).toBe(200);
  });
});
