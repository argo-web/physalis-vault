import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers/api";

describe("Security headers", () => {
  it("/login retourne tous les headers de sécurité requis", async () => {
    const res = await fetch(`${BASE_URL}/login`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(res.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("les routes API retournent aussi les headers de sécurité", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/csrf`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("les redirections 401/403 portent aussi les headers", async () => {
    // GET /api/secrets/x/y sans Bearer → 401 + headers présents
    const res = await fetch(`${BASE_URL}/api/secrets/nope/production`);
    expect(res.status).toBe(401);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
