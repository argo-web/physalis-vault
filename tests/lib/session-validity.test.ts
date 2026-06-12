import { describe, it, expect } from "vitest";
import { isSessionInvalidated } from "@/lib/session-validity";

// #5 — invalidation des sessions JWT après reset password / 2FA disable.
describe("isSessionInvalidated", () => {
  const T = 1_700_000_000_000; // un instant de référence (ms epoch)

  it("token legacy (loginAt null) → jamais invalidé", () => {
    expect(isSessionInvalidated(null, new Date(T))).toBe(false);
    expect(isSessionInvalidated(undefined, new Date(T))).toBe(false);
  });

  it("aucune borne (sessionsValidFrom null) → jamais invalidé", () => {
    expect(isSessionInvalidated(T, null)).toBe(false);
    expect(isSessionInvalidated(T, undefined)).toBe(false);
  });

  it("token émis AVANT la borne → invalidé (session volée coupée par un reset)", () => {
    const loginAt = T;
    const sessionsValidFrom = new Date(T + 60_000); // reset 1 min après le login
    expect(isSessionInvalidated(loginAt, sessionsValidFrom)).toBe(true);
  });

  it("token émis APRÈS la borne → valide (re-login après le reset)", () => {
    const loginAt = T + 60_000;
    const sessionsValidFrom = new Date(T);
    expect(isSessionInvalidated(loginAt, sessionsValidFrom)).toBe(false);
  });

  it("token émis EXACTEMENT à la borne → valide (session courante préservée au 2FA disable)", () => {
    expect(isSessionInvalidated(T, new Date(T))).toBe(false);
  });

  it("scénario 2FA disable : borne = loginAt courant → coupe l'ancienne session, garde la courante", () => {
    const oldSession = T; // session volée, plus ancienne
    const currentSession = T + 3_600_000; // session de l'user qui désactive sa 2FA
    const sessionsValidFrom = new Date(currentSession); // posée par le DELETE 2FA

    expect(isSessionInvalidated(oldSession, sessionsValidFrom)).toBe(true); // coupée
    expect(isSessionInvalidated(currentSession, sessionsValidFrom)).toBe(false); // gardée
  });
});
