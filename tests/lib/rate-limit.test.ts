import { describe, it, expect } from "vitest";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Helper pour fabriquer une Request avec une IP simulée.
function makeReq(ip = "1.2.3.4"): Request {
  return new Request("http://test.local/", {
    headers: { "x-forwarded-for": ip },
  });
}

// Chaque test utilise un `scope` unique pour ne pas partager d'état avec
// d'autres tests (le module garde une Map au niveau module, fire-and-forget).
let scopeCounter = 0;
const uniqueScope = (label: string) => `${label}-${++scopeCounter}`;

describe("lib/rate-limit — fenêtre fixe in-memory", () => {
  describe("limite de base", () => {
    it("autorise jusqu'à `max` requêtes dans la fenêtre", () => {
      const scope = uniqueScope("basic");
      const opts = { max: 3, windowMs: 60_000 };
      const req = makeReq("10.0.0.1");
      expect(rateLimit(req, scope, opts)).toBeNull();
      expect(rateLimit(req, scope, opts)).toBeNull();
      expect(rateLimit(req, scope, opts)).toBeNull();
    });

    it("retourne 429 à partir de la `max + 1` requête", async () => {
      const scope = uniqueScope("excess");
      const opts = { max: 2, windowMs: 60_000 };
      const req = makeReq("10.0.0.2");
      rateLimit(req, scope, opts);
      rateLimit(req, scope, opts);
      const res = rateLimit(req, scope, opts);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const body = await res!.json();
      expect(body).toEqual({ error: "Too many requests" });
    });
  });

  describe("headers de la 429", () => {
    it("inclut Retry-After et X-RateLimit-*", () => {
      const scope = uniqueScope("headers");
      const opts = { max: 1, windowMs: 60_000 };
      const req = makeReq("10.0.0.3");
      rateLimit(req, scope, opts); // 1/1
      const res = rateLimit(req, scope, opts)!;
      expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
    });
  });

  describe("isolation par IP", () => {
    it("deux IPs différentes ont des buckets séparés", () => {
      const scope = uniqueScope("ips");
      const opts = { max: 1, windowMs: 60_000 };
      const reqA = makeReq("10.0.0.10");
      const reqB = makeReq("10.0.0.11");
      expect(rateLimit(reqA, scope, opts)).toBeNull(); // OK pour A
      expect(rateLimit(reqA, scope, opts)).not.toBeNull(); // bloqué pour A
      expect(rateLimit(reqB, scope, opts)).toBeNull(); // OK pour B (bucket séparé)
    });
  });

  describe("isolation par scope", () => {
    it("deux scopes différents ont des buckets séparés", () => {
      const scopeA = uniqueScope("scope-a");
      const scopeB = uniqueScope("scope-b");
      const opts = { max: 1, windowMs: 60_000 };
      const req = makeReq("10.0.0.20");
      expect(rateLimit(req, scopeA, opts)).toBeNull();
      expect(rateLimit(req, scopeA, opts)).not.toBeNull();
      // Même IP mais scope différent → bucket frais.
      expect(rateLimit(req, scopeB, opts)).toBeNull();
    });
  });

  describe("identifier custom", () => {
    it("permet d'utiliser un identifier autre que l'IP", () => {
      const scope = uniqueScope("custom-id");
      const opts = { max: 1, windowMs: 60_000 };
      const req = makeReq("10.0.0.30");
      // Le 4ème arg force la clé du bucket, ignorant l'IP.
      expect(rateLimit(req, scope, opts, "user-A")).toBeNull();
      expect(rateLimit(req, scope, opts, "user-A")).not.toBeNull();
      // Même IP, identifier différent → bucket frais.
      expect(rateLimit(req, scope, opts, "user-B")).toBeNull();
    });
  });

  describe("expiration de la fenêtre", () => {
    it("après expiration, le bucket repart à zéro", async () => {
      const scope = uniqueScope("expiry");
      // Fenêtre courte mais assez large pour ne pas être flaky en CI.
      const opts = { max: 1, windowMs: 50 };
      const req = makeReq("10.0.0.40");
      expect(rateLimit(req, scope, opts)).toBeNull();
      expect(rateLimit(req, scope, opts)).not.toBeNull(); // dans la fenêtre
      // Attente asynchrone — 100 ms = 2× la fenêtre, large marge.
      await new Promise((r) => setTimeout(r, 100));
      expect(rateLimit(req, scope, opts)).toBeNull(); // nouvelle fenêtre
    });
  });

  describe("getClientIp", () => {
    it("lit la première IP de x-forwarded-for", () => {
      const req = new Request("http://test.local/", {
        headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
      });
      expect(getClientIp(req)).toBe("203.0.113.5");
    });

    it("fallback sur x-real-ip si x-forwarded-for absent", () => {
      const req = new Request("http://test.local/", {
        headers: { "x-real-ip": "198.51.100.1" },
      });
      expect(getClientIp(req)).toBe("198.51.100.1");
    });

    it("retourne 'unknown' si aucun header IP", () => {
      const req = new Request("http://test.local/");
      expect(getClientIp(req)).toBe("unknown");
    });

    it("priorité x-forwarded-for sur x-real-ip", () => {
      const req = new Request("http://test.local/", {
        headers: {
          "x-forwarded-for": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
        },
      });
      expect(getClientIp(req)).toBe("1.1.1.1");
    });
  });
});
