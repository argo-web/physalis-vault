// /api/user-tokens — gestion des UserToken (Phase 11a).
//
// Tokens scopés à l'user courant, donnent accès READ aux endpoints
// `/api/integrations/*` pour tous les projets dont l'user est membre.
// Cf. lib/integration-token.ts pour le flow de validation.
//
// RBAC : un user gère uniquement SES tokens (strict scoping userId).
// Aucune notion d'admin global ici — un superadmin n'a pas accès aux
// tokens des autres users (un token = équivalent password de l'user).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { createTokenIndex } from "@/lib/token-index";
import {
  generateUserToken,
  tokenPrefixForUi,
} from "@/lib/integration-token";
import { getCurrentTenantSlug } from "@/lib/tenant-session";
import { createHash } from "crypto";

const NAME_MAX = 100;
const MAX_ACTIVE_TOKENS = 20; // garde-fou raisonnable par user

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET() {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const tokens = await prisma.userToken.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      prefix: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const body = (await readJson(req)) as
    | { name?: string; expiresInDays?: number | null }
    | null;
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `name required (1-${NAME_MAX} chars)` },
      { status: 400 },
    );
  }

  // Garde-fou : limite le nombre de tokens actifs par user.
  const activeCount = await prisma.userToken.count({
    where: { userId: user.id, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS) {
    return NextResponse.json(
      {
        error: `Trop de tokens actifs (max ${MAX_ACTIVE_TOKENS}). Révoque-en avant d'en créer un nouveau.`,
      },
      { status: 400 },
    );
  }

  // Expiration optionnelle (1-365 jours, null = jamais).
  let expiresAt: Date | null = null;
  if (typeof body?.expiresInDays === "number") {
    const days = Math.floor(body.expiresInDays);
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: "expiresInDays must be 1-365 or null" },
        { status: 400 },
      );
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const rawToken = generateUserToken();
  const tokenHash = hashToken(rawToken);
  const prefix = tokenPrefixForUi(rawToken);

  const created = await prisma.userToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash,
      prefix,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // Phase 6 — entrée admin.token_index pour la résolution multi-tenant
  // au moment de la validation Bearer.
  const tenantSlug = await getCurrentTenantSlug();
  if (tenantSlug) {
    await createTokenIndex(tokenHash, tenantSlug, "USER").catch((err) => {
      console.error("[user-tokens] failed to create token_index entry:", err);
    });
  }

  logAction({
    action: "USER_TOKEN_CREATE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "UserToken",
    targetId: created.id,
    metadata: { name, hasExpiry: expiresAt !== null },
    req,
  });

  // Le token brut est retourné UNE SEULE FOIS ici. Jamais stocké en clair,
  // jamais ré-affichable.
  return NextResponse.json({ token: rawToken, userToken: created }, { status: 201 });
}
