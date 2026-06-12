// Header Content-Security-Policy strict sur les pages HTML.
//
// Couvre proposal "API & Headers #3" — un CSP strict (default-src 'self',
// frame-ancestors 'none' anti-clickjacking) est posé sur les pages HTML
// (variante nonce + strict-dynamic) ET sur les routes /api (variante statique,
// défense en profondeur).

import { describe, it, expect } from "vitest";
import { BASE_URL } from "./helpers/api";

describe("Header Content-Security-Policy (API & Headers #3)", () => {
  it("GET /login → CSP strict (default-src 'self' + frame-ancestors 'none')", async () => {
    const res = await fetch(`${BASE_URL}/login`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("CSP présent aussi sur /api (frame-ancestors 'none', défense en profondeur)", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
