// Matrice rôle × action : chaque rôle d'org n'accède qu'aux actions de son
// niveau ou en-dessous.
//
// Couvre proposal "RBAC #7" — vérifie la hiérarchie ORG_ROLE_RANK
// (MEMBER 1 < DEV 2 < ADMIN_DEV 3 < ADMIN 4 < OWNER 5) appliquée par
// requireOrgMember : accès si rank(role) >= rank(requis), sinon 403.
//
// Auto-suffisant : seede 4 users (un par rôle, User.role MEMBER → non admin
// global) membres d'une même org, et teste chaque (rôle, action).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  Session,
  loginAs,
  postJson,
  patchJson,
  deleteReq,
  TENANT_SCHEMA,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ORG_SLUG = `rbacmtx-${SUFFIX}`;
const PASSWORD = "rbacmatrixpassword12";

type RoleName = "MEMBER" | "DEV" | "ADMIN" | "OWNER";
const ROLES: { name: RoleName; rank: number; email: string }[] = [
  { name: "MEMBER", rank: 1, email: `mtx-member-${SUFFIX}@test.local` },
  { name: "DEV", rank: 2, email: `mtx-dev-${SUFFIX}@test.local` },
  { name: "ADMIN", rank: 4, email: `mtx-admin-${SUFFIX}@test.local` },
  { name: "OWNER", rank: 5, email: `mtx-owner-${SUFFIX}@test.local` },
];

const sessions: Record<RoleName, Session> = {} as Record<RoleName, Session>;
let orgId = "";

// min = rang minimal requis par la route (cf. requireOrgMember de chaque route).
const ACTIONS: {
  label: string;
  min: number;
  run: (s: Session, role: RoleName) => Promise<Response>;
}[] = [
  { label: "GET org", min: 1, run: (s) => s.fetch(`/api/orgs/${ORG_SLUG}`) },
  { label: "GET secrets", min: 2, run: (s) => s.fetch(`/api/orgs/${ORG_SLUG}/secrets`) },
  { label: "GET audit", min: 2, run: (s) => s.fetch(`/api/orgs/${ORG_SLUG}/audit`) },
  {
    label: "POST secret",
    min: 3,
    run: (s, role) =>
      postJson(s, `/api/orgs/${ORG_SLUG}/secrets`, { key: `MTX_${role}_${SUFFIX}`, value: "v" }),
  },
  {
    label: "PATCH org",
    min: 4,
    run: (s, role) => patchJson(s, `/api/orgs/${ORG_SLUG}`, { name: `Renamed ${role} ${SUFFIX}` }),
  },
  {
    label: "invite membre",
    min: 4,
    run: (s, role) =>
      postJson(s, `/api/orgs/${ORG_SLUG}/members`, {
        email: `mtx-inv-${role}-${SUFFIX}@test.local`,
        role: "MEMBER",
      }),
  },
];

beforeAll(async () => {
  const hash = bcrypt.hashSync(PASSWORD, 12);
  // Org "ajoutée" avec beaucoup de sièges → le quota n'interfère pas.
  orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt", "maxSeats")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW(), 100)`,
  );
  for (const r of ROLES) {
    const uid = "ck" + randomBytes(11).toString("hex");
    await execSql(
      `INSERT INTO "${TENANT_SCHEMA}"."User" (id, email, password)
       VALUES ('${uid}', '${r.email}', '${hash}')`,
    );
    await execSql(
      `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
       VALUES ('ck${randomBytes(11).toString("hex")}', '${uid}', '${orgId}', '${r.name}', NOW())`,
    );
    sessions[r.name] = await loginAs(r.email, PASSWORD);
  }
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
  for (const r of ROLES) {
    await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${r.email}'`);
  }
});

describe("RBAC — matrice rôle × action (RBAC #7)", () => {
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      const allowed = role.rank >= action.min;
      it(`${role.name} ${allowed ? "PEUT" : "ne peut PAS"} : ${action.label}`, async () => {
        const res = await action.run(sessions[role.name], role.name);
        if (allowed) expect(res.ok).toBe(true);
        else expect(res.status).toBe(403);
      });
    }
  }
});

describe("RBAC — DELETE org réservé à OWNER (RBAC #7)", () => {
  it("MEMBER / DEV / ADMIN → 403 (org préservée)", async () => {
    for (const name of ["MEMBER", "DEV", "ADMIN"] as RoleName[]) {
      const res = await deleteReq(sessions[name], `/api/orgs/${ORG_SLUG}`);
      expect(res.status).toBe(403);
    }
  });

  it("OWNER → 200 (suppression effective)", async () => {
    const res = await deleteReq(sessions.OWNER, `/api/orgs/${ORG_SLUG}`);
    expect(res.status).toBe(200);
  });
});
