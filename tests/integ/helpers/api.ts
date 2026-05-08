// Helpers HTTP pour les tests d'intégration.
// `Session` maintient les cookies entre requêtes (simule un browser).

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3001";

export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "admin@artpotentiel.fr";
export const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? "admin-test-password-123";

/**
 * Petit "browser" pour les tests : maintient une jar de cookies entre
 * requêtes, ajoute le header Cookie automatiquement.
 *
 * Chaque session porte une `fakeIp` envoyée comme `X-Forwarded-For` à toutes
 * les requêtes — permet d'isoler les buckets de rate-limit entre test files
 * (sinon les 5 login/15min/IP saturent vite avec des suites parallèles).
 */
export class Session {
  private cookies = new Map<string, string>();
  private fakeIp: string;

  constructor(fakeIp?: string) {
    // IP fictive unique par session, dans 203.0.113.0/24 (TEST-NET-3, RFC 5737).
    this.fakeIp =
      fakeIp ?? `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  }

  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (this.cookies.size > 0) {
      headers.set("Cookie", this.cookieHeader());
    }
    if (!headers.has("x-forwarded-for")) {
      headers.set("x-forwarded-for", this.fakeIp);
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    this.absorbSetCookie(res);
    return res;
  }

  private absorbSetCookie(res: Response) {
    // Node 20+ expose getSetCookie sur Headers.
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  hasCookie(name: string): boolean {
    return this.cookies.has(name);
  }
}

/**
 * Login NextAuth Credentials. Retourne la session avec cookie de session.
 * `fakeIp` permet de forcer l'IP simulée (utile pour le test rate-limit qui
 * a besoin d'un bucket dédié).
 */
export async function loginAs(
  email: string,
  password: string,
  fakeIp?: string,
): Promise<Session> {
  const session = new Session(fakeIp);
  // 1. GET /api/auth/csrf — récupère le csrfToken et set le cookie csrf.
  const csrfRes = await session.fetch("/api/auth/csrf");
  if (!csrfRes.ok) {
    throw new Error(`csrf failed: HTTP ${csrfRes.status}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // 2. POST /api/auth/callback/credentials avec csrfToken + creds.
  const body = new URLSearchParams({ csrfToken, email, password }).toString();
  const loginRes = await session.fetch("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (loginRes.status !== 302) {
    throw new Error(
      `login expected 302, got ${loginRes.status} (creds: ${email})`,
    );
  }
  return session;
}

export async function adminSession(fakeIp?: string): Promise<Session> {
  return loginAs(ADMIN_EMAIL, ADMIN_PASSWORD, fakeIp);
}

/**
 * Helper : POST JSON avec gestion des erreurs.
 */
export async function postJson(
  session: Session,
  path: string,
  body: unknown,
): Promise<Response> {
  return session.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchJson(
  session: Session,
  path: string,
  body: unknown,
): Promise<Response> {
  return session.fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteReq(
  session: Session,
  path: string,
): Promise<Response> {
  return session.fetch(path, { method: "DELETE" });
}
