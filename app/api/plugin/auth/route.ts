// POST /api/plugin/auth
//
// Authentification de l'extension navigateur. Body : { email, password,
// totp, tenantSlug, ttl? }. Retourne un sessionToken `sv_plugin_<hex>`
// valide PLUGIN_SESSION_TTL secondes (defaut 4h). Le token n'est PAS
// renouvelable — il faut re-saisir le TOTP a expiration.
//
// Architecture multi-tenant : `tenantSlug` est OBLIGATOIRE — il identifie
// le schéma client_<slug> dans lequel chercher l'user et créer le
// PluginToken. L'index admin.token_index est mis à jour pour permettre
// la résolution lors de la validation Bearer (cf. validatePluginToken).
//
// Securite :
//   - Aucune session NextAuth requise (cf. design decision #1) : l'extension
//     n'a pas de cookie partage avec le vault web.
//   - 2FA OBLIGATOIRE : si l'utilisateur n'a pas active sa 2FA, on refuse
//     explicitement avec un message demandant l'activation.
//   - Rate-limit : 5 tentatives / 15 min / IP (meme pression qu'un login web).
//   - Audit `PLUGIN_AUTH_SUCCESS` / `PLUGIN_AUTH_FAILURE`.
//   - CORS strict via `PLUGIN_ALLOWED_ORIGIN` (cf. lib/plugin-cors.ts).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { adminPrisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { verifyTotp, findBackupCodeIndex } from "@/lib/totp";
import {
  generatePluginToken,
  hashPluginToken,
  getPluginSessionTtl,
  isAllowedTtl,
  ALLOWED_TTLS,
} from "@/lib/plugin-token";
import {
  checkPluginOrigin,
  preflightResponse,
  withCors,
} from "@/lib/plugin-cors";
import { rateLimit } from "@/lib/rate-limit";
import { readJson, isValidEmail } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { withTenantSchema } from "@/lib/tenant";
import { createTokenIndex } from "@/lib/token-index";
import { isValidClientSlug } from "@/lib/validation";

export const runtime = "nodejs";

const RATE_LIMIT = { max: 5, windowMs: 15 * 60_000 };

export async function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  const cors = checkPluginOrigin(req);
  if (!cors.ok) {
    // Origin manquante / non whitelistee → 403 sans header CORS, le browser
    // bloque la reponse de toute facon.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const allowOrigin = cors.allowOrigin;

  // Rate-limit avant tout (IP-based, valable meme pour les requetes mal formees).
  const limited = rateLimit(req, "plugin-auth", RATE_LIMIT);
  if (limited) return withCors(limited, allowOrigin);

  const body = (await readJson(req)) as
    | {
        email?: string;
        password?: string;
        totp?: string;
        tenantSlug?: string;
        ttl?: number;
      }
    | null;
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    typeof body.totp !== "string" ||
    typeof body.tenantSlug !== "string"
  ) {
    return withCors(
      NextResponse.json(
        { error: "email, password, totp and tenantSlug are required" },
        { status: 400 },
      ),
      allowOrigin,
    );
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;
  const totp = body.totp.trim();
  const tenantSlug = body.tenantSlug.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return withCors(
      NextResponse.json({ error: "Invalid email" }, { status: 400 }),
      allowOrigin,
    );
  }
  if (!isValidClientSlug(tenantSlug)) {
    return withCors(
      NextResponse.json({ error: "Invalid tenantSlug" }, { status: 400 }),
      allowOrigin,
    );
  }

  // Vérifie que le tenant existe et est actif (sinon login refusé sans
  // donner d'indice sur l'existence du compte côté pre-auth).
  const client = await adminPrisma.client.findUnique({
    where: { slug: tenantSlug },
    select: { status: true },
  });
  if (
    !client ||
    client.status === "SUSPENDED" ||
    client.status === "CANCELLED"
  ) {
    logAction({
      action: "PLUGIN_AUTH_FAILURE",
      actor: { kind: "anonymous" },
      metadata: {
        reason: !client ? "tenant_not_found" : "tenant_inactive",
        email,
        tenantSlug,
      },
      req,
    });
    return withCors(
      NextResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      allowOrigin,
    );
  }

  // TTL : si l'extension demande une duree explicite, doit appartenir a
  // la liste fermee ALLOWED_TTLS (1h / 4h / 8h). Sinon → defaut env.
  // Validation strict avant tout traitement (pre-auth) pour eviter qu'un
  // client mal forme apprenne quoi que ce soit sur l'existence du compte.
  let ttlSeconds = getPluginSessionTtl();
  if (body.ttl !== undefined) {
    if (!isAllowedTtl(body.ttl)) {
      return withCors(
        NextResponse.json(
          {
            error: `ttl must be one of: ${ALLOWED_TTLS.join(", ")} (seconds)`,
          },
          { status: 400 },
        ),
        allowOrigin,
      );
    }
    ttlSeconds = body.ttl;
  }

  // Toute l'auth (lookup + bcrypt + 2FA + token create) dans le contexte
  // tenant. Retourne l'objet final ou null si rejet à logger.
  type AuthFailure = {
    reason: string;
    httpStatus: number;
    errorBody: { error: string; reason?: string };
    actor: "anonymous" | { userId: string; email: string };
    organizationId: string | null;
  };
  type AuthSuccess = {
    user: { id: string; email: string };
    organizationId: string | null;
    pluginTokenId: string;
    acceptedVia: "totp" | "backup";
  };

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const token = generatePluginToken();
  const tokenHash = hashPluginToken(token);

  const result: AuthFailure | AuthSuccess = await withTenantSchema(
    tenantSlug,
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
        include: {
          organizations: {
            select: { organizationId: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const primaryOrgId = user?.organizations[0]?.organizationId ?? null;

      if (!user) {
        return {
          reason: "user_not_found",
          httpStatus: 401,
          errorBody: { error: "Invalid credentials" },
          actor: "anonymous",
          organizationId: null,
        } satisfies AuthFailure;
      }

      const passwordOk = await bcrypt.compare(password, user.password);
      if (!passwordOk) {
        return {
          reason: "invalid_password",
          httpStatus: 401,
          errorBody: { error: "Invalid credentials" },
          actor: "anonymous",
          organizationId: primaryOrgId,
        } satisfies AuthFailure;
      }

      // 2FA OBLIGATOIRE pour le plugin (decision #4 de la spec).
      if (!user.twoFactorEnabled) {
        return {
          reason: "2fa_not_enabled",
          httpStatus: 403,
          errorBody: {
            error:
              "Plugin requires 2FA. Enable 2FA in /settings/security first, then retry.",
            reason: "2fa_required_setup",
          },
          actor: { userId: user.id, email: user.email },
          organizationId: primaryOrgId,
        } satisfies AuthFailure;
      }

      if (!user.twoFactorSecret || !user.twoFactorIv || !user.twoFactorTag) {
        // Etat incoherent : enabled=true sans secret. Ne devrait jamais arriver.
        return {
          reason: "2fa_state_inconsistent",
          httpStatus: 500,
          errorBody: { error: "2FA misconfigured" },
          actor: "anonymous",
          organizationId: primaryOrgId,
        } satisfies AuthFailure;
      }

      const secretPlain = decrypt({
        encryptedValue: user.twoFactorSecret,
        iv: user.twoFactorIv,
        tag: user.twoFactorTag,
      });

      let acceptedVia: "totp" | "backup" | null = null;
      if (await verifyTotp(totp, secretPlain)) {
        acceptedVia = "totp";
      } else {
        const idx = await findBackupCodeIndex(totp, user.backupCodes);
        if (idx >= 0) {
          const remaining = [...user.backupCodes];
          remaining.splice(idx, 1);
          await tx.user.update({
            where: { id: user.id },
            data: { backupCodes: remaining },
          });
          acceptedVia = "backup";
        }
      }

      if (!acceptedVia) {
        return {
          reason: "invalid_totp",
          httpStatus: 401,
          errorBody: { error: "Invalid TOTP" },
          actor: { userId: user.id, email: user.email },
          organizationId: primaryOrgId,
        } satisfies AuthFailure;
      }

      const created = await tx.pluginToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
          userAgent,
        },
        select: { id: true },
      });

      return {
        user: { id: user.id, email: user.email },
        organizationId: primaryOrgId,
        pluginTokenId: created.id,
        acceptedVia,
      } satisfies AuthSuccess;
    },
  );

  // Rejet : log + retour HTTP. Audit dans le tenant si possible (le user
  // existe), sinon on log juste côté serveur (audit.ts skip si pas de slug,
  // mais ici on a le slug donc l'audit va bien dans client_<slug>.AccessLog).
  if ("reason" in result) {
    logAction({
      action: "PLUGIN_AUTH_FAILURE",
      actor:
        result.actor === "anonymous"
          ? { kind: "anonymous" }
          : { kind: "user", userId: result.actor.userId, email: result.actor.email },
      organizationId: result.organizationId,
      metadata: { reason: result.reason, email, tenantSlug },
      req,
      tenantSlug,
    });
    return withCors(
      NextResponse.json(result.errorBody, { status: result.httpStatus }),
      allowOrigin,
    );
  }

  // Succès — index admin pour permettre la validation tenant-aware au
  // prochain GET /api/plugin/match. Le PluginToken est déjà inséré dans
  // client_<slug>.PluginToken via la transaction au-dessus.
  await createTokenIndex(tokenHash, tenantSlug, "PLUGIN").catch((err) => {
    console.error("[plugin-auth] failed to create token_index entry:", err);
  });

  if (result.acceptedVia === "backup") {
    logAction({
      action: "BACKUP_CODE_USED",
      actor: { kind: "user", userId: result.user.id, email: result.user.email },
      organizationId: result.organizationId,
      metadata: { source: "plugin", tenantSlug },
      req,
      tenantSlug,
    });
  }

  const ttlSource: "body" | "env" = body.ttl !== undefined ? "body" : "env";
  logAction({
    action: "PLUGIN_AUTH_SUCCESS",
    actor: { kind: "user", userId: result.user.id, email: result.user.email },
    organizationId: result.organizationId,
    targetType: "PluginToken",
    targetId: result.pluginTokenId,
    metadata: {
      acceptedVia: result.acceptedVia,
      ttlSeconds,
      ttlSource,
      tenantSlug,
    },
    req,
    tenantSlug,
  });

  return withCors(
    NextResponse.json({
      sessionToken: token,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    }),
    allowOrigin,
  );
}
