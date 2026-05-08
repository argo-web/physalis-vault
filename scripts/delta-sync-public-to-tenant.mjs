#!/usr/bin/env node
//
// scripts/delta-sync-public-to-tenant.mjs
//
// Phase 2 du nettoyage public : copie les rows présentes en `public.*`
// mais absentes de `client_<slug>.*` (= drift créé via path legacy
// après le clone initial), en EXCLUANT la chaîne d'IDs liée aux users
// "orphelins" (= users en public mais pas en tenant — typiquement des
// comptes de test à supprimer après).
//
// Préserve les cuid → toutes les FK existantes pointent toujours sur
// les bonnes lignes. Ré-indexe les MachineToken nouveaux dans
// `admin.token_index` et mirror les nouvelles Policy dans
// `admin.policies`.
//
// Usage :
//   node scripts/delta-sync-public-to-tenant.mjs <slug> [--dry-run]
//
// Dry-run : affiche les counts qui seraient insérés table par table,
// n'écrit rien. Recommandé avant le run réel.
//
// Pré-requis : avoir tourné scripts/audit-public-vs-tenant.mjs et
// compris le drift. Le script DOIT être exécuté APRÈS le verrou code
// (commit 8a37905) pour qu'aucune nouvelle écriture ne tombe en public
// pendant qu'il tourne.

import { PrismaClient } from "@prisma/client";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

// ─── CLI ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slug = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();
if (!slug || !SLUG_RE.test(slug)) {
  console.error(
    "Usage: node scripts/delta-sync-public-to-tenant.mjs <slug> [--dry-run]",
  );
  process.exit(1);
}
const schemaName = `client_${slug}`;

// ─── Tables (même ordre que clone-public-to-tenant.mjs, pour respecter FK) ───

const TABLES_IN_ORDER = [
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

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────

async function rawIds(sql, ...params) {
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return rows.map((r) => r.id);
}

async function rawCount(sql, ...params) {
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return Number(rows[0]?.c ?? 0);
}

/** Construit l'expression de SELECT castant chaque colonne enum
 *  public→tenant via text (cf. clone-public-to-tenant.mjs). */
async function buildSelectColumns(table) {
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, udt_schema, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    table,
  );
  if (cols.length === 0) {
    throw new Error(`No columns found for public."${table}"`);
  }
  const colList = cols.map((c) => `"${c.column_name}"`).join(", ");
  const selectExprs = cols.map((c) => {
    if (c.data_type === "USER-DEFINED" && c.udt_schema === "public") {
      return `"${c.column_name}"::text::"${schemaName}"."${c.udt_name}"`;
    }
    return `"${c.column_name}"`;
  });
  return { colList, selectExprs: selectExprs.join(", ") };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n=== Delta sync public → ${schemaName} ${dryRun ? "(DRY-RUN)" : "(LIVE)"} ===\n`,
  );

  // ─── 1. Détection de la chaîne d'IDs orphelins (= ACME user/org/...) ───

  const orphanUserIds = await rawIds(
    `SELECT id FROM "public"."User"
     WHERE id NOT IN (SELECT id FROM "${schemaName}"."User")`,
  );
  const orphanOrgIds = await rawIds(
    `SELECT id FROM "public"."Organization"
     WHERE id NOT IN (SELECT id FROM "${schemaName}"."Organization")`,
  );

  // Projects appartenant aux orgs orphelines
  const orphanProjectIds = orphanOrgIds.length
    ? await rawIds(
        `SELECT id FROM "public"."Project" WHERE "organizationId" = ANY($1::text[])`,
        orphanOrgIds,
      )
    : [];

  // Environments des projets orphelins
  const orphanEnvIds = orphanProjectIds.length
    ? await rawIds(
        `SELECT id FROM "public"."Environment" WHERE "projectId" = ANY($1::text[])`,
        orphanProjectIds,
      )
    : [];

  // Collections orphelines (org orpheline OU projet orphelin)
  const orphanCollectionIds = (() => {
    const conds = [];
    const params = [];
    if (orphanOrgIds.length) {
      conds.push(`"organizationId" = ANY($${params.length + 1}::text[])`);
      params.push(orphanOrgIds);
    }
    if (orphanProjectIds.length) {
      conds.push(`"projectId" = ANY($${params.length + 1}::text[])`);
      params.push(orphanProjectIds);
    }
    if (conds.length === 0) return [];
    return rawIds(
      `SELECT id FROM "public"."TeamVaultCollection" WHERE ${conds.join(" OR ")}`,
      ...params,
    );
  })();
  const orphanCollectionIdsResolved = await Promise.resolve(orphanCollectionIds);

  console.log(
    `  Chaîne d'IDs orphelins (à exclure du sync) :\n` +
      `    User           : ${orphanUserIds.length} (${orphanUserIds.slice(0, 3).join(", ") || "—"})\n` +
      `    Organization   : ${orphanOrgIds.length}\n` +
      `    Project        : ${orphanProjectIds.length}\n` +
      `    Environment    : ${orphanEnvIds.length}\n` +
      `    TeamVaultColl. : ${orphanCollectionIdsResolved.length}\n`,
  );

  // ─── 2. WHERE clauses par table ────────────────────────────────

  /**
   * Pour chaque table, construit la WHERE clause qui exclut :
   *   - les rows déjà présentes en tenant (id IN tenant)
   *   - les rows liées à la chaîne orpheline
   *
   * Retourne un objet { sql, params } prêt à être interpolé dans le
   * INSERT ... SELECT ... FROM public WHERE <sql>.
   */
  function buildSyncWhere(table) {
    const exclusions = [
      // Toujours : skip si déjà présent en tenant.
      `id NOT IN (SELECT id FROM "${schemaName}"."${table}")`,
    ];
    const params = [];
    const addOrphanCheck = (column, ids) => {
      if (ids.length === 0) return;
      params.push(ids);
      exclusions.push(`"${column}" != ALL($${params.length}::text[])`);
    };

    switch (table) {
      case "User":
        addOrphanCheck("id", orphanUserIds);
        break;
      case "Organization":
        addOrphanCheck("id", orphanOrgIds);
        break;
      case "OrgMember":
        addOrphanCheck("userId", orphanUserIds);
        addOrphanCheck("organizationId", orphanOrgIds);
        break;
      case "Server":
      case "Project":
      case "OrgSecret":
        addOrphanCheck("organizationId", orphanOrgIds);
        break;
      case "VaultEntry":
        addOrphanCheck("userId", orphanUserIds);
        break;
      case "PluginToken":
        addOrphanCheck("userId", orphanUserIds);
        break;
      case "Invitation":
        addOrphanCheck("invitedById", orphanUserIds);
        addOrphanCheck("inviteeUserId", orphanUserIds);
        addOrphanCheck("organizationId", orphanOrgIds);
        break;
      case "ProjectMember":
        addOrphanCheck("userId", orphanUserIds);
        addOrphanCheck("projectId", orphanProjectIds);
        break;
      case "Environment":
        addOrphanCheck("projectId", orphanProjectIds);
        break;
      case "Service":
      case "AppAccount":
      case "MachineToken":
      case "Policy":
        addOrphanCheck("projectId", orphanProjectIds);
        break;
      case "TeamVaultCollection":
        addOrphanCheck("organizationId", orphanOrgIds);
        addOrphanCheck("projectId", orphanProjectIds);
        break;
      case "OneTimeShare":
        addOrphanCheck("createdById", orphanUserIds);
        addOrphanCheck("organizationId", orphanOrgIds);
        break;
      case "Secret":
        addOrphanCheck("environmentId", orphanEnvIds);
        break;
      case "TeamVaultEntry":
        addOrphanCheck("collectionId", orphanCollectionIdsResolved);
        break;
      case "TeamVaultMember":
        addOrphanCheck("userId", orphanUserIds);
        addOrphanCheck("collectionId", orphanCollectionIdsResolved);
        break;
      case "AccessLog":
        addOrphanCheck("actorUserId", orphanUserIds);
        addOrphanCheck("organizationId", orphanOrgIds);
        addOrphanCheck("projectId", orphanProjectIds);
        addOrphanCheck("environmentId", orphanEnvIds);
        break;
      default:
        throw new Error(`Unknown table: ${table}`);
    }

    return { sql: exclusions.join(" AND "), params };
  }

  // ─── 3. Sync table par table ───────────────────────────────────

  console.log(`[1/3] Sync des tables tenant\n`);
  const stats = [];
  for (const table of TABLES_IN_ORDER) {
    const { sql: whereSql, params } = buildSyncWhere(table);

    // Count des rows à insérer
    const count = await rawCount(
      `SELECT COUNT(*)::bigint AS c FROM "public"."${table}" WHERE ${whereSql}`,
      ...params,
    );

    if (count === 0) {
      console.log(`  ${table}: rien à sync`);
      stats.push({ table, synced: 0 });
      continue;
    }

    if (dryRun) {
      console.log(`  ${table}: ${count} row(s) à insérer (dry-run)`);
      stats.push({ table, synced: count });
      continue;
    }

    const { colList, selectExprs } = await buildSelectColumns(table);
    const insertSql = `INSERT INTO "${schemaName}"."${table}" (${colList})
       SELECT ${selectExprs} FROM "public"."${table}" WHERE ${whereSql}`;

    const inserted = await prisma.$executeRawUnsafe(insertSql, ...params);
    if (Number(inserted) !== Number(count)) {
      throw new Error(
        `${table}: count mismatch — attendu ${count}, inséré ${inserted}`,
      );
    }
    console.log(`  ${table}: ${count} row(s) inséré(es)`);
    stats.push({ table, synced: Number(count) });
  }

  // ─── 4. Index admin.token_index pour les nouveaux MachineToken ───

  console.log(`\n[2/3] Re-index admin.token_index (MachineToken/PluginToken)\n`);

  // Pour chaque MachineToken actif en public qui n'a pas d'entrée admin
  // ET qui appartient à argoweb (pas ACME) → insert dans token_index.
  const machineHashesToIndex = await prisma.$queryRawUnsafe(
    `SELECT mt."tokenHash" AS h
     FROM "public"."MachineToken" mt
     WHERE mt."revokedAt" IS NULL
       AND mt."tokenHash" NOT IN (
         SELECT token_hash FROM admin.token_index WHERE tenant_slug = $1
       )
       AND mt."projectId" != ALL($2::text[])`,
    slug,
    orphanProjectIds,
  );

  if (machineHashesToIndex.length === 0) {
    console.log(`  MachineToken : 0 hash à indexer`);
  } else if (dryRun) {
    console.log(
      `  MachineToken : ${machineHashesToIndex.length} hash à indexer (dry-run)`,
    );
  } else {
    const inserted = await prisma.$executeRawUnsafe(
      `INSERT INTO admin.token_index (token_hash, tenant_slug, kind, created_at)
       SELECT input.h, $1, 'MACHINE'::admin."TokenKind", NOW()
       FROM unnest($2::text[]) AS input(h)
       ON CONFLICT (token_hash) DO NOTHING`,
      slug,
      machineHashesToIndex.map((r) => r.h),
    );
    console.log(`  MachineToken : ${inserted} hash indexés`);
  }

  const pluginHashesToIndex = await prisma.$queryRawUnsafe(
    `SELECT pt."tokenHash" AS h
     FROM "public"."PluginToken" pt
     WHERE pt."revokedAt" IS NULL AND pt."expiresAt" > NOW()
       AND pt."tokenHash" NOT IN (
         SELECT token_hash FROM admin.token_index WHERE tenant_slug = $1
       )
       AND pt."userId" != ALL($2::text[])`,
    slug,
    orphanUserIds,
  );

  if (pluginHashesToIndex.length === 0) {
    console.log(`  PluginToken : 0 hash à indexer`);
  } else if (dryRun) {
    console.log(
      `  PluginToken : ${pluginHashesToIndex.length} hash à indexer (dry-run)`,
    );
  } else {
    const inserted = await prisma.$executeRawUnsafe(
      `INSERT INTO admin.token_index (token_hash, tenant_slug, kind, created_at)
       SELECT input.h, $1, 'PLUGIN'::admin."TokenKind", NOW()
       FROM unnest($2::text[]) AS input(h)
       ON CONFLICT (token_hash) DO NOTHING`,
      slug,
      pluginHashesToIndex.map((r) => r.h),
    );
    console.log(`  PluginToken : ${inserted} hash indexés`);
  }

  // ─── 5. Mirror admin.policies ──────────────────────────────────

  console.log(`\n[3/3] Mirror admin.policies (OIDC)\n`);

  const policiesToMirror = await prisma.$queryRawUnsafe(
    `SELECT p.repo, p.workflow, p.branch, p."projectId", p."environmentId"
     FROM "public"."Policy" p
     WHERE p."projectId" != ALL($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM admin.policies ap
         WHERE ap.repo = p.repo AND ap.workflow = p.workflow
           AND ap.branch = p.branch AND ap.tenant_slug = $2
           AND ap.project_id = p."projectId"
           AND ap.environment_id = p."environmentId"
       )`,
    orphanProjectIds,
    slug,
  );

  if (policiesToMirror.length === 0) {
    console.log(`  Policy : 0 à mirror`);
  } else if (dryRun) {
    console.log(`  Policy : ${policiesToMirror.length} à mirror (dry-run)`);
  } else {
    let mirrored = 0;
    for (const p of policiesToMirror) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO admin.policies
           (id, repo, workflow, branch, tenant_slug, project_id, environment_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (repo, workflow, branch, tenant_slug, project_id, environment_id) DO NOTHING`,
        p.repo,
        p.workflow,
        p.branch,
        slug,
        p.projectId,
        p.environmentId,
      );
      mirrored++;
    }
    console.log(`  Policy : ${mirrored} mirror`);
  }

  // ─── Récap ─────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  const totalRows = stats.reduce((a, s) => a + Number(s.synced), 0);
  if (dryRun) {
    console.log(
      `DRY-RUN : ${totalRows} row(s) tenant + ${machineHashesToIndex.length} MachineToken + ${pluginHashesToIndex.length} PluginToken + ${policiesToMirror.length} Policy seraient sync.`,
    );
    console.log(`Re-lance sans --dry-run pour appliquer.`);
  } else {
    console.log(
      `Done. ${totalRows} row(s) tenant + ${machineHashesToIndex.length || 0} MachineToken + ${pluginHashesToIndex.length || 0} PluginToken + ${policiesToMirror.length || 0} Policy synchronisé(s).`,
    );
    console.log(
      `\nProchaine étape : delete ACME en public + re-audit\n` +
        `  DELETE FROM public."User" WHERE id = '${orphanUserIds[0] ?? "<acme_id>"}';\n` +
        `  (cascade FK supprime org/project/secrets/etc. d'ACME)\n` +
        `  Puis : node scripts/audit-public-vs-tenant.mjs ${slug}`,
    );
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
