// Helper partage pour l'import CSV vers une TeamVaultCollection (scope
// org OU projet). Mutualise la logique entre les routes :
//   - POST /api/vault/org/[orgSlug]/collections/[slug]/import
//   - POST /api/vault/project/[projectSlug]/collections/[slug]/import
//
// Differences avec l'import perso (lib/csv-import.ts + /api/vault/import) :
//   - Les TeamVaultCollection sont PLATES : on n'auto-cree pas de
//     sous-collections. Le `collectionName` du CSV est preserve comme
//     TAG sur l'entry pour ne pas perdre l'info de classement.
//   - Pas de userId : remplace par collectionId.
//   - Audit log : source = "team_import" + scope (org/project) + ids.
//   - Skip silent sur les erreurs individuelles (parite avec l'existant).
//
// Le caller doit avoir verifie RBAC EDITOR+ via requireOrgCollectionAccess
// ou requireProjectCollectionAccess AVANT d'appeler ce helper.

import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { encrypt } from "./crypto";
import { logAction } from "./audit";
import { parseImport, type ImportedEntry } from "./csv-import";
import { parseTotpInput } from "./otpauth-parse";

const CSV_MAX = 5_000_000; // 5 MB, parite avec l'import perso
const TAG_MAX_LEN = 40; // borne defensive sur le tag heritage de collectionName

export type ImportBody = { csv?: string; dryRun?: boolean };

export type ImportContext = {
  user: { id: string; email: string };
  collectionId: string;
  organizationId: string | null;
  projectId: string | null;
  scope: "org" | "project";
};

export async function handleTeamVaultImport(
  req: Request,
  body: ImportBody | null,
  ctx: ImportContext,
): Promise<NextResponse> {
  const csv = typeof body?.csv === "string" ? body.csv : "";
  const dryRun = body?.dryRun === true;

  if (!csv) {
    return NextResponse.json({ error: "csv required" }, { status: 400 });
  }
  if (csv.length > CSV_MAX) {
    return NextResponse.json(
      { error: `csv too large (max ${CSV_MAX / 1_000_000} MB)` },
      { status: 413 },
    );
  }

  const parsed = parseImport(csv);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      format: parsed.format,
      imported: parsed.entries.length,
      dryRun: true,
      sample: parsed.entries.slice(0, 5),
    });
  }

  let imported = 0;
  for (const e of parsed.entries) {
    const data = buildTeamCreateData(e, ctx.collectionId);
    if (!data) continue;
    try {
      await prisma.teamVaultEntry.create({ data });
      imported++;
    } catch {
      // Skip silent : meme contrat que l'import perso. L'user verra
      // "imported: N < total" dans le retour.
    }
  }

  logAction({
    action: "VAULT_ENTRY_CREATE",
    actor: { kind: "user", userId: ctx.user.id, email: ctx.user.email },
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    targetType: "TeamVaultEntry",
    metadata: {
      source: "team_import",
      scope: ctx.scope,
      collectionId: ctx.collectionId,
      format: parsed.format,
      imported,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    format: parsed.format,
    imported,
    dryRun: false,
  });
}

/** Construit le payload d'insert pour TeamVaultEntry. Retourne null si
 *  l'entry n'a pas de `name` (champ requis). Le `collectionName` du CSV
 *  est preserve comme tag plutot que comme sous-collection. */
function buildTeamCreateData(e: ImportedEntry, collectionId: string) {
  if (!e.name) return null;

  let encryptedPassword: string | null = null;
  let passwordIv: string | null = null;
  let passwordTag: string | null = null;
  if (e.password) {
    const payload = encrypt(e.password);
    encryptedPassword = payload.encryptedValue;
    passwordIv = payload.iv;
    passwordTag = payload.tag;
  }

  let encryptedTotpSecret: string | null = null;
  let totpSecretIv: string | null = null;
  let totpSecretTag: string | null = null;
  if (e.totpSecret) {
    const parsedTotp = parseTotpInput(e.totpSecret);
    if (parsedTotp) {
      const payload = encrypt(parsedTotp);
      encryptedTotpSecret = payload.encryptedValue;
      totpSecretIv = payload.iv;
      totpSecretTag = payload.tag;
    }
  }

  // Preservation du folder/collection d'origine en tag, pour permettre
  // au user de retrouver le classement initial (cf. note en tete).
  const tags: string[] = [];
  if (e.collectionName) {
    const t = e.collectionName.trim().slice(0, TAG_MAX_LEN);
    if (t) tags.push(t);
  }

  return {
    collectionId,
    name: e.name,
    url: e.url,
    username: e.username,
    encryptedPassword,
    passwordIv,
    passwordTag,
    encryptedTotpSecret,
    totpSecretIv,
    totpSecretTag,
    tags,
    favorite: e.favorite,
  };
}
