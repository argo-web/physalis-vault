// Garde-fous injection : path traversal, payload XSS stocké, JSON malformé.
//
// Couvre proposal "Injections & XSS #3-7" — valeur surtout de NON-RÉGRESSION :
// la défense réelle est ailleurs (React échappe le rendu, Prisma paramètre les
// requêtes). Ce test vérifie côté API que :
//   - un slug avec `../` ne sort pas du routing (lookup littéral → 404) ;
//   - un nom d'org `<script>` est stocké/renvoyé TEL QUEL (pas d'exécution
//     ni de SSTI côté serveur) — l'échappement est la responsabilité du front ;
//   - un body JSON malformé est rejeté proprement (400, pas de 500).
//
// Auto-suffisant : seede un OWNER + une org.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  Session,
  loginAs,
  patchJson,
  TENANT_SCHEMA,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ORG_SLUG = `inj-${SUFFIX}`;
const OWNER_EMAIL = `inj-owner-${SUFFIX}@test.local`;
const PASSWORD = "injectionguard12345";
const XSS = "<script>alert(1)</script>";

let owner: Session;

beforeAll(async () => {
  const hash = bcrypt.hashSync(PASSWORD, 12);
  const ownerId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."User" (id, email, password)
     VALUES ('${ownerId}', '${OWNER_EMAIL}', '${hash}')`,
  );
  const orgId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', '${ORG_SLUG}', '${ORG_SLUG}', NOW())`,
  );
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('ck${randomBytes(11).toString("hex")}', '${ownerId}', '${orgId}', 'OWNER', NOW())`,
  );
  owner = await loginAs(OWNER_EMAIL, PASSWORD);
});

afterAll(async () => {
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ORG_SLUG}'`);
  await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE email = '${OWNER_EMAIL}'`);
});

describe("Garde-fous injection (Injections & XSS #3-7)", () => {
  it("path traversal dans le slug → 404 (lookup littéral, pas de sortie de routing)", async () => {
    const slug = encodeURIComponent("../../../../etc/passwd");
    const res = await owner.fetch(`/api/orgs/${slug}`);
    expect([400, 404]).toContain(res.status);
  });

  it("nom d'org `<script>` stocké et renvoyé TEL QUEL (pas de SSTI serveur)", async () => {
    const patch = await patchJson(owner, `/api/orgs/${ORG_SLUG}`, { name: XSS });
    expect(patch.status).toBe(200);

    const res = await owner.fetch(`/api/orgs/${ORG_SLUG}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { organization?: { name?: string } };
    // Le payload est conservé littéralement (échappement = job du front).
    expect(body.organization?.name).toBe(XSS);
  });

  it("body JSON malformé → 400 (rejet propre, pas de 500)", async () => {
    const res = await owner.fetch(`/api/orgs/${ORG_SLUG}/secrets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "}{ ceci n'est pas du JSON",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
