import { describe, it, expect } from "vitest";
import { Session } from "./helpers/api";

/**
 * Test du rate-limit sur /api/auth/callback/credentials.
 *
 * Hypothèse : 5 / 15min / IP. On simule une IP fictive via X-Forwarded-For
 * pour ne pas perturber le bucket de l'IP réelle.
 *
 * Le rate-limit est géré DANS le callback authorize de NextAuth (lib/auth.ts)
 * via RateLimitExceeded extends CredentialsSignin. Cela retourne une 302 avec
 * Location: /login?error=rate_limited (pas un 429 HTTP), pour éviter un crash
 * client-side sur une réponse inattendue.
 */
describe("Rate-limit /api/auth/callback/credentials", () => {
  // Retourne { status, location } pour pouvoir distinguer les types de 302.
  async function attemptLogin(
    fakeIp: string,
    email: string,
    password: string,
  ): Promise<{ status: number; location: string | null }> {
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf", {
      headers: { "x-forwarded-for": fakeIp },
    });
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({ csrfToken, email, password }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": fakeIp,
      },
      body,
    });
    return { status: res.status, location: res.headers.get("location") };
  }

  // IP unique au timestamp pour ne pas hériter d'un bucket précédent.
  const fakeIp = `192.0.2.${(Date.now() % 254) + 1}`;

  it("autorise jusqu'à 5 tentatives puis bloque la 6e avec error=rate_limited", async () => {
    // 5 premières tentatives → 302 avec error de login normal (pas rate_limited).
    for (let i = 1; i <= 5; i++) {
      const { status, location } = await attemptLogin(
        fakeIp,
        "doesnotexist@example.com",
        "wrongpassword",
      );
      expect(status, `attempt ${i} status`).toBe(302);
      expect(location, `attempt ${i} location`).not.toMatch(/rate_limited/);
    }
    // 6e tentative → 302 avec error=rate_limited dans la Location.
    const { status, location } = await attemptLogin(
      fakeIp,
      "doesnotexist@example.com",
      "wrongpassword",
    );
    expect(status).toBe(302);
    expect(location).toMatch(/code=rate_limited/);
  });

  it("la réponse rate-limited indique bien error=rate_limited dans la Location", async () => {
    // Le bucket est déjà saturé (attempt 7+ depuis le test précédent).
    const { status, location } = await attemptLogin(
      fakeIp,
      "x@y.z",
      "wrong",
    );
    expect(status).toBe(302);
    expect(location).toMatch(/code=rate_limited/);
  });

  it("une autre IP a un bucket séparé (toujours autorisée)", async () => {
    const otherIp = `198.51.100.${(Date.now() % 254) + 1}`;
    const { location } = await attemptLogin(
      otherIp,
      "still-doesnt-exist@example.com",
      "wrongpassword",
    );
    expect(location).not.toMatch(/rate_limited/);
  });
});
