import { describe, it, expect } from "vitest";
import { Session } from "./helpers/api";

/**
 * Test du rate-limit sur /api/auth/callback/credentials.
 *
 * Hypothèse : 5 / 15min / IP. On simule une IP fictive via X-Forwarded-For
 * pour ne pas perturber le bucket de l'IP réelle (sinon les tests suivants
 * pourraient eux-mêmes être bloqués).
 *
 * Note : `getClientIp` dans lib/rate-limit.ts lit `x-forwarded-for` en
 * premier. Cela suppose que l'app est derrière un proxy de confiance (NPM)
 * en prod ; en dev, ça nous laisse passer un faux IP pour les tests.
 */
describe("Rate-limit /api/auth/callback/credentials", () => {
  // Fonction qui tente un login échoué avec une IP donnée. Crée une nouvelle
  // session par appel pour avoir un csrfToken frais.
  async function attemptLogin(
    fakeIp: string,
    email: string,
    password: string,
  ): Promise<number> {
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
    return res.status;
  }

  // IP unique au timestamp pour ne pas hériter d'un bucket précédent.
  const fakeIp = `192.0.2.${(Date.now() % 254) + 1}`;

  it("autorise jusqu'à 5 tentatives puis bloque la 6e avec 429", async () => {
    // 5 premières tentatives → 302 (redirect d'erreur, pas 429).
    for (let i = 1; i <= 5; i++) {
      const code = await attemptLogin(
        fakeIp,
        "doesnotexist@example.com",
        "wrongpassword",
      );
      expect(code, `attempt ${i}`).not.toBe(429);
    }
    // 6e tentative → 429.
    const code = await attemptLogin(
      fakeIp,
      "doesnotexist@example.com",
      "wrongpassword",
    );
    expect(code).toBe(429);
  });

  it("la réponse 429 contient les headers RateLimit-*", async () => {
    const session = new Session();
    const csrfRes = await session.fetch("/api/auth/csrf", {
      headers: { "x-forwarded-for": fakeIp },
    });
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const body = new URLSearchParams({
      csrfToken,
      email: "x@y.z",
      password: "wrong",
    }).toString();
    const res = await session.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": fakeIp,
      },
      body,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(res.headers.get("x-ratelimit-limit")).toBe("5");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("une autre IP a un bucket séparé (toujours autorisée)", async () => {
    const otherIp = `198.51.100.${(Date.now() % 254) + 1}`;
    const code = await attemptLogin(
      otherIp,
      "still-doesnt-exist@example.com",
      "wrongpassword",
    );
    expect(code).not.toBe(429);
  });
});
