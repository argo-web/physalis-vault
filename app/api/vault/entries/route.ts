// /api/vault/entries — coffre personnel (cf. docs/coffres.md)
//
// Toutes les routes sont scopées sur req.user — un user ne voit JAMAIS
// les entrees d'un autre, meme un admin global. Aucun partage en V1.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { readJson, requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { parseTotpInput } from "@/lib/otpauth-parse";

const NAME_MAX = 200;
const URL_MAX = 2048;
const USERNAME_MAX = 200;
const PASSWORD_MAX = 4096;
const TOTP_SECRET_MAX = 512;
const TAG_MAX = 50;
const TAGS_MAX = 20;

function normalizeTags(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  if (input.length > TAGS_MAX) return null;
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) continue;
    if (t.length > TAG_MAX) return null;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export async function GET(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const url = new URL(req.url);
  const tag = url.searchParams.get("tag");
  const favoriteOnly = url.searchParams.get("favorite") === "true";
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const where: {
    userId: string;
    favorite?: boolean;
    tags?: { has: string };
  } = { userId: user.id };
  if (favoriteOnly) where.favorite = true;
  if (tag) where.tags = { has: tag };

  const entries = await prisma.vaultEntry.findMany({
    where,
    select: {
      id: true,
      name: true,
      url: true,
      username: true,
      tags: true,
      favorite: true,
      encryptedTotpSecret: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ favorite: "desc" }, { name: "asc" }],
  });

  // Recherche full-text simple cote app (volume faible : coffre perso < 500 entrees).
  const filtered = search
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(search) ||
          (e.url ?? "").toLowerCase().includes(search) ||
          (e.username ?? "").toLowerCase().includes(search),
      )
    : entries;

  // Convertit encryptedTotpSecret en booleen pour le shape liste.
  const shaped = filtered.map(
    ({ encryptedTotpSecret, ...rest }) => ({
      ...rest,
      hasTotpSecret: encryptedTotpSecret !== null,
    }),
  );

  return NextResponse.json({ entries: shaped });
}

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const body = (await readJson(req)) as
    | {
        name?: string;
        url?: string | null;
        username?: string | null;
        password?: string | null;
        totpSecret?: string | null;
        tags?: string[];
        favorite?: boolean;
      }
    | null;
  if (!body || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const name = body.name.trim();
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `name must be 1-${NAME_MAX} chars` },
      { status: 400 },
    );
  }

  const url =
    typeof body.url === "string" && body.url.trim()
      ? body.url.trim().slice(0, URL_MAX)
      : null;
  const username =
    typeof body.username === "string" && body.username.trim()
      ? body.username.trim().slice(0, USERNAME_MAX)
      : null;
  const tags = normalizeTags(body.tags);
  if (tags === null) {
    return NextResponse.json(
      {
        error: `tags must be a string array of <= ${TAGS_MAX} entries, each <= ${TAG_MAX} chars`,
      },
      { status: 400 },
    );
  }
  const favorite = body.favorite === true;

  let encryptedPassword: string | null = null;
  let passwordIv: string | null = null;
  let passwordTag: string | null = null;
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length > PASSWORD_MAX) {
      return NextResponse.json(
        { error: `password must be <= ${PASSWORD_MAX} chars` },
        { status: 400 },
      );
    }
    const payload = encrypt(body.password);
    encryptedPassword = payload.encryptedValue;
    passwordIv = payload.iv;
    passwordTag = payload.tag;
  }

  let encryptedTotpSecret: string | null = null;
  let totpSecretIv: string | null = null;
  let totpSecretTag: string | null = null;
  if (typeof body.totpSecret === "string" && body.totpSecret.length > 0) {
    if (body.totpSecret.length > TOTP_SECRET_MAX) {
      return NextResponse.json(
        { error: `totpSecret must be <= ${TOTP_SECRET_MAX} chars` },
        { status: 400 },
      );
    }
    const parsed = parseTotpInput(body.totpSecret);
    if (!parsed) {
      return NextResponse.json(
        { error: "totpSecret must be a base32 secret or an otpauth:// URL" },
        { status: 400 },
      );
    }
    const payload = encrypt(parsed);
    encryptedTotpSecret = payload.encryptedValue;
    totpSecretIv = payload.iv;
    totpSecretTag = payload.tag;
  }

  const entry = await prisma.vaultEntry.create({
    data: {
      userId: user.id,
      name,
      url,
      username,
      encryptedPassword,
      passwordIv,
      passwordTag,
      encryptedTotpSecret,
      totpSecretIv,
      totpSecretTag,
      tags,
      favorite,
    },
    select: {
      id: true,
      name: true,
      url: true,
      username: true,
      tags: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logAction({
    action: "VAULT_ENTRY_CREATE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "VaultEntry",
    targetId: entry.id,
    metadata: {
      source: "personal",
      hasPassword: encryptedPassword !== null,
      tagsCount: tags.length,
    },
    req,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
