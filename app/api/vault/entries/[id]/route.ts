// /api/vault/entries/[id] — GET reveal (avec password déchiffré),
// PATCH partiel (avec re-encrypt si password change), DELETE.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
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

type Params = { params: Promise<{ id: string }> };

function normalizeTags(input: unknown): string[] | null {
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

export async function GET(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const entry = await prisma.vaultEntry.findFirst({
    where: { id, userId: user.id },
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let password: string | null = null;
  if (entry.encryptedPassword && entry.passwordIv && entry.passwordTag) {
    password = decrypt({
      encryptedValue: entry.encryptedPassword,
      iv: entry.passwordIv,
      tag: entry.passwordTag,
    });
  }

  let totpSecret: string | null = null;
  if (
    entry.encryptedTotpSecret &&
    entry.totpSecretIv &&
    entry.totpSecretTag
  ) {
    totpSecret = decrypt({
      encryptedValue: entry.encryptedTotpSecret,
      iv: entry.totpSecretIv,
      tag: entry.totpSecretTag,
    });
  }

  logAction({
    action: "VAULT_ENTRY_REVEAL",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "VaultEntry",
    targetId: entry.id,
    metadata: { source: "personal", name: entry.name },
    req,
  });

  return NextResponse.json({
    entry: {
      id: entry.id,
      name: entry.name,
      url: entry.url,
      username: entry.username,
      password,
      totpSecret,
      tags: entry.tags,
      favorite: entry.favorite,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const existing = await prisma.vaultEntry.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: {
    name?: string;
    url?: string | null;
    username?: string | null;
    encryptedPassword?: string | null;
    passwordIv?: string | null;
    passwordTag?: string | null;
    encryptedTotpSecret?: string | null;
    totpSecretIv?: string | null;
    totpSecretTag?: string | null;
    tags?: string[];
    favorite?: boolean;
  } = {};
  const changed: string[] = [];

  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v || v.length > NAME_MAX) {
      return NextResponse.json(
        { error: `name must be 1-${NAME_MAX} chars` },
        { status: 400 },
      );
    }
    data.name = v;
    changed.push("name");
  }
  if ("url" in body) {
    if (body.url === null || body.url === "") {
      data.url = null;
    } else if (typeof body.url === "string") {
      data.url = body.url.trim().slice(0, URL_MAX) || null;
    }
    changed.push("url");
  }
  if ("username" in body) {
    if (body.username === null || body.username === "") {
      data.username = null;
    } else if (typeof body.username === "string") {
      data.username = body.username.trim().slice(0, USERNAME_MAX) || null;
    }
    changed.push("username");
  }
  if ("password" in body) {
    if (body.password === null || body.password === "") {
      data.encryptedPassword = null;
      data.passwordIv = null;
      data.passwordTag = null;
    } else if (typeof body.password === "string") {
      if (body.password.length > PASSWORD_MAX) {
        return NextResponse.json(
          { error: `password must be <= ${PASSWORD_MAX} chars` },
          { status: 400 },
        );
      }
      const payload = encrypt(body.password);
      data.encryptedPassword = payload.encryptedValue;
      data.passwordIv = payload.iv;
      data.passwordTag = payload.tag;
    }
    changed.push("password");
  }
  if ("totpSecret" in body) {
    if (body.totpSecret === null || body.totpSecret === "") {
      data.encryptedTotpSecret = null;
      data.totpSecretIv = null;
      data.totpSecretTag = null;
    } else if (typeof body.totpSecret === "string") {
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
      data.encryptedTotpSecret = payload.encryptedValue;
      data.totpSecretIv = payload.iv;
      data.totpSecretTag = payload.tag;
    }
    changed.push("totpSecret");
  }
  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) {
      return NextResponse.json(
        {
          error: `tags must be a string array of <= ${TAGS_MAX} entries, each <= ${TAG_MAX} chars`,
        },
        { status: 400 },
      );
    }
    data.tags = tags;
    changed.push("tags");
  }
  if (typeof body.favorite === "boolean") {
    data.favorite = body.favorite;
    changed.push("favorite");
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.vaultEntry.update({
    where: { id: existing.id },
    data,
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
    action: "VAULT_ENTRY_UPDATE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "VaultEntry",
    targetId: updated.id,
    metadata: { source: "personal", changedFields: changed },
    req,
  });

  return NextResponse.json({ entry: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const existing = await prisma.vaultEntry.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.vaultEntry.delete({ where: { id: existing.id } });

  logAction({
    action: "VAULT_ENTRY_DELETE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "VaultEntry",
    targetId: existing.id,
    metadata: { source: "personal", name: existing.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
