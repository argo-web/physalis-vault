#!/usr/bin/env node
//
// scripts/audit-public-vs-tenant.mjs
//
// Audit READ-ONLY : vérifie que toutes les données de `public.*` ont
// bien été clonées vers `client_<slug>.*` (et que les tokens / policies
// pointent bien vers le tenant via admin.*) avant de drop public.
//
// Aucune écriture, aucune mutation. Sort 0 si tout est clean (GO),
// 1 si au moins un problème (NO-GO).
//
// Vérifications :
//   1. Pour chaque table tenant, public.<T>.id ⊆ client_<slug>.<T>.id
//      (clone-public-to-tenant.mjs préserve les cuid → on compare par ID).
//   2. Counts : public.<T> ≤ client_<slug>.<T> (le tenant peut avoir
//      grandi après le clone, c'est OK ; le contraire est un drift).
//   3. MachineToken actifs en public.MachineToken → présents dans
//      admin.token_index avec (tenant_slug=<slug>, kind=MACHINE).
//   4. PluginToken actifs (non expirés) idem (kind=PLUGIN).
//   5. Policies en public.Policy → présentes dans admin.policies pour
//      ce tenant (mirror dual-write Phase 6.B).
//
// Usage prod :
//   docker exec -it physalis sh -c \
//     'cd /app && node scripts/audit-public-vs-tenant.mjs argoweb'
//

import { PrismaClient } from "@prisma/client";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

// Doit matcher TABLES_IN_ORDER de clone-public-to-tenant.mjs.
const TABLES = [
  "User",
  "Organization",
  "OrgMember",
  "Server",
  "Project",
  "OrgSecret",
  "VaultEntry",
  "PluginToken",
  "Invitation",
  "ProjectMember",
  "Environment",
  "Service",
  "AppAccount",
  "TeamVaultCollection",
  "OneTimeShare",
  "Secret",
  "MachineToken",
  "Policy",
  "TeamVaultEntry",
  "TeamVaultMember",
  "AccessLog",
];

// ─── CLI ──────────────────────────────────────────────────────────

const slug = process.argv[2]?.toLowerCase().trim();
if (!slug || !SLUG_RE.test(slug)) {
  console.error("Usage: node scripts/audit-public-vs-tenant.mjs <slug>");
  console.error("Slug : lowercase, alphanumérique et tirets, 1-50 chars.");
  process.exit(1);
}
const schemaName = `client_${slug}`;

// ─── Helpers ──────────────────────────────────────────────────────

const prisma = new PrismaClient();

let problems = 0;
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  problems++;
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

async function schemaExists(s) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
     ) AS e`,
    s,
  );
  return Boolean(rows[0]?.e);
}

async function tableExists(s, t) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS e`,
    s,
    t,
  );
  return Boolean(rows[0]?.e);
}

async function tableCount(s, t) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::bigint AS c FROM "${s}"."${t}"`,
  );
  return Number(rows[0]?.c ?? 0);
}

/** Premiers N IDs présents dans public.<T> mais absents de schemaName.<T>. */
async function missingIds(table, limit = 10) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM "public"."${table}"
     EXCEPT
     SELECT id FROM "${schemaName}"."${table}"
     LIMIT ${limit}`,
  );
  return rows.map((r) => r.id);
}

/** Pour un set de hashes, retourne ceux qui ne sont PAS dans admin.token_index. */
async function missingTokenIndexHashes(kind, hashes) {
  if (hashes.length === 0) return [];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT input.h
     FROM unnest($1::text[]) AS input(h)
     LEFT JOIN admin.token_index t
       ON t.token_hash = input.h
       AND t.tenant_slug = $2
       AND t.kind = $3::admin."TokenKind"
     WHERE t.token_hash IS NULL`,
    hashes,
    slug,
    kind,
  );
  return rows.map((r) => r.h);
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Audit public vs ${schemaName} ===\n`);

  // 0. Pré-checks.
  if (!(await schemaExists(schemaName))) {
    fail(`Schema ${schemaName} introuvable — le clone n'a pas tourné ?`);
    process.exit(1);
  }
  ok(`Schema ${schemaName} existe`);

  if (!(await schemaExists("public"))) {
    fail(`Schema public introuvable — état DB incohérent`);
    process.exit(1);
  }

  // ─── 1. Counts ─────────────────────────────────────────────────
  console.log(`\n[1/4] Counts public vs ${schemaName}\n`);
  let totalPublic = 0;
  let totalTenant = 0;
  for (const t of TABLES) {
    const inPub = await tableExists("public", t);
    const inTen = await tableExists(schemaName, t);
    if (!inPub) {
      console.log(`    ${t}: absente de public (skip)`);
      continue;
    }
    if (!inTen) {
      fail(`${t}: présente en public mais absente de ${schemaName}`);
      continue;
    }
    const cPub = await tableCount("public", t);
    const cTen = await tableCount(schemaName, t);
    totalPublic += cPub;
    totalTenant += cTen;
    const arrow = cTen >= cPub ? "≤" : ">";
    if (cTen < cPub) {
      fail(
        `${t}: public=${cPub} ${arrow} ${schemaName}=${cTen} ` +
          `(le tenant a MOINS de rows que public — drift)`,
      );
    } else if (cPub === 0) {
      console.log(`    ${t}: public vide (${schemaName}=${cTen})`);
    } else {
      console.log(`    ${t}: public=${cPub} ${arrow} ${schemaName}=${cTen}`);
    }
  }
  console.log(
    `\n    Total : public=${totalPublic}, ${schemaName}=${totalTenant}`,
  );

  // ─── 2. IDs ────────────────────────────────────────────────────
  console.log(`\n[2/4] Check IDs : public.<T>.id ⊆ ${schemaName}.<T>.id\n`);
  for (const t of TABLES) {
    if (!(await tableExists("public", t))) continue;
    if (!(await tableExists(schemaName, t))) continue;
    const cPub = await tableCount("public", t);
    if (cPub === 0) continue;
    const missing = await missingIds(t);
    if (missing.length > 0) {
      fail(
        `${t}: rows présentes en public mais absentes de ${schemaName} ` +
          `(échantillon: ${missing.slice(0, 3).join(", ")})`,
      );
    } else {
      ok(`${t}: ${cPub} IDs public tous présents en ${schemaName}`);
    }
  }

  // ─── 3. Tokens orphelins ───────────────────────────────────────
  console.log(`\n[3/4] Tokens public référencés dans admin.token_index\n`);

  const machineHashes = (
    await prisma.$queryRawUnsafe(
      `SELECT "tokenHash" AS h FROM "public"."MachineToken"
       WHERE "revokedAt" IS NULL`,
    )
  ).map((r) => r.h);
  if (machineHashes.length === 0) {
    ok(`MachineToken : 0 actif en public`);
  } else {
    const orphans = await missingTokenIndexHashes("MACHINE", machineHashes);
    if (orphans.length > 0) {
      fail(
        `MachineToken : ${orphans.length}/${machineHashes.length} hashes ` +
          `pas dans admin.token_index (rejouer scripts/migrate-tokens-to-admin.mjs)`,
      );
    } else {
      ok(`MachineToken : ${machineHashes.length}/${machineHashes.length} indexés`);
    }
  }

  const pluginHashes = (
    await prisma.$queryRawUnsafe(
      `SELECT "tokenHash" AS h FROM "public"."PluginToken"
       WHERE "revokedAt" IS NULL AND "expiresAt" > NOW()`,
    )
  ).map((r) => r.h);
  if (pluginHashes.length === 0) {
    ok(`PluginToken : 0 actif (non expiré) en public`);
  } else {
    const orphans = await missingTokenIndexHashes("PLUGIN", pluginHashes);
    if (orphans.length > 0) {
      fail(
        `PluginToken : ${orphans.length}/${pluginHashes.length} hashes ` +
          `pas dans admin.token_index`,
      );
    } else {
      ok(`PluginToken : ${pluginHashes.length}/${pluginHashes.length} indexés`);
    }
  }

  // ─── 4. Policies mirror ─────────────────────────────────────────
  console.log(`\n[4/4] Policies mirror admin.policies\n`);
  const policies = await prisma.$queryRawUnsafe(
    `SELECT "repo", "workflow", "branch", "projectId", "environmentId"
     FROM "public"."Policy"`,
  );
  if (policies.length === 0) {
    ok(`Policy : 0 row en public`);
  } else {
    let missing = 0;
    const samples = [];
    for (const p of policies) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM admin.policies
         WHERE repo = $1 AND workflow = $2 AND branch = $3
           AND tenant_slug = $4 AND project_id = $5 AND environment_id = $6
         LIMIT 1`,
        p.repo,
        p.workflow,
        p.branch,
        slug,
        p.projectId,
        p.environmentId,
      );
      if (rows.length === 0) {
        missing++;
        if (samples.length < 3) {
          samples.push(`${p.repo}/${p.workflow}@${p.branch}`);
        }
      }
    }
    if (missing > 0) {
      fail(
        `Policy : ${missing}/${policies.length} non mirror dans admin.policies ` +
          `(échantillon: ${samples.join(", ")})`,
      );
    } else {
      ok(`Policy : ${policies.length}/${policies.length} bien mirror`);
    }
  }

  // ─── Verdict ───────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  if (problems === 0) {
    console.log(
      `✓ GO — public peut être droppé en toute sécurité ` +
        `(${totalPublic} rows audités).`,
    );
    process.exit(0);
  } else {
    console.error(
      `✗ NO-GO — ${problems} problème(s) à résoudre avant de drop public.`,
    );
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("\n✗ Fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
