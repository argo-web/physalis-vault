// POST /api/share — cree un OneTimeShare zero-knowledge.
//
// Le client envoie le ciphertext + IV (deja chiffres cote navigateur avec
// une cle qu'il ne nous donne pas). On stocke + on retourne le token URL
// brut UNE SEULE FOIS. La cle vit dans le fragment `#` de l'URL cote
// utilisateur, jamais en base ni dans nos logs.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser, getCurrentOrgSlug } from "@/lib/api";
import {
  generateShareToken,
  hashShareToken,
  isAllowedShareTtl,
} from "@/lib/share-token";
import { logAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Limites sur le ciphertext base64. 16 KB de base64 ≈ 12 KB plaintext, ce
// qui couvre largement un .env de 100 lignes. Au-dela on bloque pour
// eviter abus de stockage.
const CIPHERTEXT_MAX = 16 * 1024;
const IV_MAX = 32; // base64url de 12 bytes = 16 chars, large marge
const TITLE_MAX = 200;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 200;
const BCRYPT_ROUNDS = 12;

type Body = {
  ciphertext?: string;
  iv?: string;
  title?: string | null;
  ttlSeconds?: number;
  password?: string | null;
};

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const limited = rateLimit(
    req,
    "share-create",
    { max: 20, windowMs: 60_000 },
    user.id,
  );
  if (limited) return limited;

  const body = (await readJson(req)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    typeof body.ciphertext !== "string" ||
    body.ciphertext.length === 0 ||
    body.ciphertext.length > CIPHERTEXT_MAX
  ) {
    return NextResponse.json(
      { error: `ciphertext required, ≤ ${CIPHERTEXT_MAX} chars` },
      { status: 400 },
    );
  }
  if (
    typeof body.iv !== "string" ||
    body.iv.length === 0 ||
    body.iv.length > IV_MAX
  ) {
    return NextResponse.json({ error: "iv required" }, { status: 400 });
  }
  if (!isAllowedShareTtl(body.ttlSeconds)) {
    return NextResponse.json(
      { error: "ttlSeconds must be one of 900, 3600, 14400, 86400" },
      { status: 400 },
    );
  }
  let title: string | null = null;
  if (typeof body.title === "string" && body.title.trim().length > 0) {
    if (body.title.length > TITLE_MAX) {
      return NextResponse.json(
        { error: `title must be ≤ ${TITLE_MAX} chars` },
        { status: 400 },
      );
    }
    title = body.title.trim();
  }

  // Password optionnel : gate cote serveur (Bitwarden Send style). On bcrypt
  // pour eviter qu'un dump DB revele le mot de passe en clair.
  let passwordHash: string | null = null;
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < PASSWORD_MIN) {
      return NextResponse.json(
        { error: `password must be ≥ ${PASSWORD_MIN} chars` },
        { status: 400 },
      );
    }
    if (body.password.length > PASSWORD_MAX) {
      return NextResponse.json(
        { error: `password must be ≤ ${PASSWORD_MAX} chars` },
        { status: 400 },
      );
    }
    passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  }

  // Org courante du user pour le scope d'audit (best-effort, peut etre null).
  const orgSlug = await getCurrentOrgSlug(user.id);
  const org = orgSlug
    ? await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true },
      })
    : null;

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);
  const expiresAt = new Date(Date.now() + body.ttlSeconds * 1000);

  const created = await prisma.oneTimeShare.create({
    data: {
      tokenHash,
      ciphertext: body.ciphertext,
      iv: body.iv,
      title,
      passwordHash,
      createdById: user.id,
      createdByEmail: user.email,
      organizationId: org?.id ?? null,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  logAction({
    action: "SHARE_CREATE",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: org?.id ?? null,
    targetType: "OneTimeShare",
    targetId: created.id,
    metadata: {
      ttlSeconds: body.ttlSeconds,
      hasTitle: title !== null,
      hasPassword: passwordHash !== null,
      ciphertextLength: body.ciphertext.length,
    },
    req,
  });

  return NextResponse.json(
    {
      id: created.id,
      token,
      expiresAt: created.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
