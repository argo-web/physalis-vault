import { describe, it, expect } from "vitest";
import {
  generateOrgToken,
  generateUserToken,
  orgTokenAllowsProject,
  scopeForType,
  tokenPrefixForUi,
} from "@/lib/integration-token";

describe("lib/integration-token — generateOrgToken", () => {
  it("produit un token avec le préfixe sv_org_", () => {
    const t = generateOrgToken();
    expect(t.startsWith("sv_org_")).toBe(true);
  });

  it("64 hex chars après le préfixe (= 32 bytes)", () => {
    const t = generateOrgToken();
    const hex = t.slice("sv_org_".length);
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });

  it("préfixe org distinct du préfixe user", () => {
    const u = generateUserToken();
    const o = generateOrgToken();
    expect(u.startsWith("sv_user_")).toBe(true);
    expect(o.startsWith("sv_org_")).toBe(true);
    expect(u.startsWith("sv_org_")).toBe(false);
    expect(o.startsWith("sv_user_")).toBe(false);
  });

  it("tokenPrefixForUi : 12 premiers chars couvrent le préfixe", () => {
    const o = "sv_org_abcdef0123456789";
    expect(tokenPrefixForUi(o)).toBe("sv_org_abcde");
  });
});

describe("lib/integration-token — orgTokenAllowsProject", () => {
  it("allProjects=true → toujours true", () => {
    expect(
      orgTokenAllowsProject({ allProjects: true, allowedProjectIds: [] }, "p1"),
    ).toBe(true);
    expect(
      orgTokenAllowsProject(
        { allProjects: true, allowedProjectIds: ["p2"] },
        "p99",
      ),
    ).toBe(true);
  });

  it("allProjects=false → check inclusion dans allowedProjectIds", () => {
    expect(
      orgTokenAllowsProject(
        { allProjects: false, allowedProjectIds: ["p1", "p2"] },
        "p1",
      ),
    ).toBe(true);
    expect(
      orgTokenAllowsProject(
        { allProjects: false, allowedProjectIds: ["p1", "p2"] },
        "p3",
      ),
    ).toBe(false);
  });

  it("allProjects=false ET allowedProjectIds=[] → toujours false", () => {
    expect(
      orgTokenAllowsProject(
        { allProjects: false, allowedProjectIds: [] },
        "p1",
      ),
    ).toBe(false);
  });
});

describe("lib/integration-token — scopeForType", () => {
  it("mappe secret → SECRETS_READ", () => {
    expect(scopeForType("secret")).toBe("SECRETS_READ");
  });

  it("mappe service → SERVICES_READ", () => {
    expect(scopeForType("service")).toBe("SERVICES_READ");
  });

  it("mappe account → ACCOUNTS_READ", () => {
    expect(scopeForType("account")).toBe("ACCOUNTS_READ");
  });
});
