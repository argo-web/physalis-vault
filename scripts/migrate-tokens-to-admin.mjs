#!/usr/bin/env node
//
// scripts/migrate-tokens-to-admin.mjs
//
// Phase 6 — Populate admin.token_index pour résoudre les tokens existants
// (créés AVANT Phase 6, donc sans entrée index) vers leur tenant.
//
// Source des tokens : `public.MachineToken` et `public.PluginToken`
// (legacy, schema d'origine avant le clone). On INSÈRE dans
// admin.token_index une entrée (token_hash, tenant_slug, kind) pour
// chaque token actif (revokedAt IS NULL).
//
// Idempotent : ON CONFLICT DO NOTHING — re-runnable sans casser.
//
// Usage :
//   docker exec -it secretvault_app sh -c \
//     'cd /app && node scripts/migrate-tokens-to-admin.mjs <tenant-slug>'
//
// Exemple :
//   node scripts/migrate-tokens-to-admin.mjs argoweb
//
// Après ce script, les machine tokens et plugin tokens existants en
// public.* sont indexés vers le tenant fourni → validateToken /
// validatePluginToken les routent correctement vers
// `client_<slug>.MachineToken` / `client_<slug>.PluginToken`.
//
// Pré-requis : avoir d'abord cloné les données (clone-public-to-tenant.mjs)
// pour que les tokens existent aussi dans le schéma client_<slug>.

import { PrismaClient } from "@prisma/client";
import { PrismaClient as AdminPrismaClient } from "../node_modules/.prisma/admin-client/index.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

const tenantSlug = process.argv[2]?.toLowerCase().trim();
if (!tenantSlug || !SLUG_RE.test(tenantSlug)) {
  console.error("Usage: node scripts/migrate-tokens-to-admin.mjs <tenant-slug>");
  console.error("Slug format : lowercase, alphanumérique et tirets, 1-50 chars.");
  process.exit(1);
}

const prisma = new PrismaClient();
const adminPrisma = new AdminPrismaClient();

async function main() {
  console.log(`\n=== Migrate tokens public.* → admin.token_index ===\n`);
  console.log(`  tenant_slug : ${tenantSlug}\n`);

  // Vérifie que le tenant existe en admin.clients.
  const client = await adminPrisma.client.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!client) {
    console.error(
      `✗ admin.clients ne contient pas slug="${tenantSlug}". Crée le client d'abord (via /admin/clients/new ou /signup).`,
    );
    process.exit(1);
  }
  console.log(`  client      : ${client.name} (id=${client.id})\n`);

  // ─── MachineToken ──────────────────────────────────────────────
  const machineTokens = await prisma.machineToken.findMany({
    where: { revokedAt: null },
    select: { tokenHash: true, name: true },
  });
  console.log(`  → ${machineTokens.length} machine tokens actifs en public.MachineToken`);

  let machineMigrated = 0;
  let machineSkipped = 0;
  for (const mt of machineTokens) {
    try {
      await adminPrisma.tokenIndex.create({
        data: {
          tokenHash: mt.tokenHash,
          tenantSlug,
          kind: "MACHINE",
        },
      });
      machineMigrated++;
    } catch (err) {
      // P2002 = unique constraint (déjà migré). On skip.
      if (err.code === "P2002") {
        machineSkipped++;
      } else {
        console.error(`    ✗ ${mt.name}: ${err.message}`);
      }
    }
  }
  console.log(
    `    migré: ${machineMigrated}, déjà indexé (skip): ${machineSkipped}`,
  );

  // ─── PluginToken ───────────────────────────────────────────────
  const pluginTokens = await prisma.pluginToken.findMany({
    where: { revokedAt: null },
    select: { tokenHash: true, expiresAt: true },
  });
  // Les plugin tokens expirés (TTL dépassé) sont skippés — pas besoin
  // de les migrer, ils seront rejetés à la validation.
  const activePlugin = pluginTokens.filter((t) => t.expiresAt > new Date());
  const expiredPlugin = pluginTokens.length - activePlugin.length;
  console.log(
    `  → ${activePlugin.length} plugin tokens actifs (${expiredPlugin} expirés ignorés)`,
  );

  let pluginMigrated = 0;
  let pluginSkipped = 0;
  for (const pt of activePlugin) {
    try {
      await adminPrisma.tokenIndex.create({
        data: {
          tokenHash: pt.tokenHash,
          tenantSlug,
          kind: "PLUGIN",
        },
      });
      pluginMigrated++;
    } catch (err) {
      if (err.code === "P2002") {
        pluginSkipped++;
      } else {
        console.error(`    ✗ plugin token: ${err.message}`);
      }
    }
  }
  console.log(
    `    migré: ${pluginMigrated}, déjà indexé (skip): ${pluginSkipped}`,
  );

  // ─── OidcPolicy mirror ─────────────────────────────────────────
  const policies = await prisma.policy.findMany({
    select: {
      repo: true,
      workflow: true,
      branch: true,
      projectId: true,
      environmentId: true,
    },
  });
  console.log(`  → ${policies.length} policies en public.Policy`);

  let policyMigrated = 0;
  let policySkipped = 0;
  for (const p of policies) {
    try {
      await adminPrisma.oidcPolicy.create({
        data: {
          repo: p.repo,
          workflow: p.workflow,
          branch: p.branch,
          tenantSlug,
          projectId: p.projectId,
          environmentId: p.environmentId,
        },
      });
      policyMigrated++;
    } catch (err) {
      if (err.code === "P2002") {
        policySkipped++;
      } else {
        console.error(`    ✗ policy ${p.repo}/${p.workflow}@${p.branch}: ${err.message}`);
      }
    }
  }
  console.log(
    `    migré: ${policyMigrated}, déjà mirroré (skip): ${policySkipped}`,
  );

  // ─── Audit log ──────────────────────────────────────────────────
  await adminPrisma.auditLog.create({
    data: {
      action: "schema.provisioned", // pas d'action spécifique, on réutilise
      clientId: client.id,
      actor: "system:migrate-tokens-to-admin",
      metadata: {
        operation: "tokens_and_policies_migrated_to_admin",
        tenantSlug,
        machine: { migrated: machineMigrated, skipped: machineSkipped },
        plugin: { migrated: pluginMigrated, skipped: pluginSkipped },
        policies: { migrated: policyMigrated, skipped: policySkipped },
      },
    },
  });

  console.log(`\n✓ Done.\n`);
  console.log(`Les tokens existants vont maintenant valider via le path Phase 6 :`);
  console.log(
    `  - validateToken / validatePluginToken lookup admin.token_index`,
  );
  console.log(`  - puis lookup la table tenant correspondante via search_path.`);
  console.log(
    `\nTu peux retirer le fallback legacy (lib/auth-token.ts + lib/plugin-token.ts)`,
  );
  console.log(
    `dans une prochaine release une fois sûr qu'aucun token "orphelin" ne circule.`,
  );
}

main()
  .catch((err) => {
    console.error("\n✗ Fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
  });
