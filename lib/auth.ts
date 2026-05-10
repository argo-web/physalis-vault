import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { adminPrisma, basePrisma } from "./prisma";
import { decrypt } from "./crypto";
import { findBackupCodeIndex, verifyTotp } from "./totp";
import { logAction } from "./audit";
import { withTenantSchema } from "./tenant";
import { isValidClientSlug } from "./validation";
import { isSuperadmin } from "./roles";
import { authConfig } from "./auth.config";

/**
 * Erreurs signalées au client via NextAuth `code`. Le frontend lit
 * `signIn(...).code` pour décider d'afficher le champ TOTP.
 */
class TwoFactorRequired extends CredentialsSignin {
  code = "2fa_required";
}
class TwoFactorInvalid extends CredentialsSignin {
  code = "2fa_invalid";
}

/**
 * Hash bcrypt fictif calculé une fois au chargement. Sert à exécuter un
 * `bcrypt.compare()` factice dans les chemins de rejet rapide (user
 * inconnu, tenant introuvable, rôle insuffisant) afin que la latence de
 * réponse ne révèle pas l'existence d'un compte. bcrypt domine le coût
 * (~100ms) — sans ce compare factice, un attaquant distingue
 * "email inconnu" (<50ms) de "email connu mauvais mdp" (~150ms).
 */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "dummy-anti-timing-attack-payload",
  10,
);

async function rejectWithConstantTime(password: string): Promise<null> {
  await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
  return null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP", type: "text" },
        // Phase 4 — slug du tenant (transmis par le formulaire login,
        // dérivé du subdomain ou du `?tenant=<slug>` URL param).
        tenantSlug: { label: "Tenant", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        const totpCode = String(credentials?.totpCode ?? "").trim();
        // Defensive : filtrer les strings "undefined" / "null" qui
        // peuvent arriver si le caller a envoyé une clé avec une valeur
        // JavaScript undefined (NextAuth sérialise en URLSearchParams →
        // coercion en string littérale).
        const rawSlug = String(credentials?.tenantSlug ?? "").trim().toLowerCase();
        const tenantSlug =
          rawSlug &&
          rawSlug !== "undefined" &&
          rawSlug !== "null" &&
          isValidClientSlug(rawSlug)
            ? rawSlug
            : null;
        // NextAuth v5 passe le Request en 2e arg → utilisable pour capter l'IP.
        const req = request instanceof Request ? request : undefined;

        if (!email || !password) {
          logAction({
            action: "LOGIN_FAILURE",
            actor: { kind: "anonymous" },
            metadata: { reason: "missing_credentials", email: email || null },
            req,
            tenantSlug,
          });
          return null;
        }

        // Si tenantSlug fourni, vérifier que le client existe et est
        // actif. Un client SUSPENDED/CANCELLED ne peut plus se connecter.
        if (tenantSlug) {
          const client = await adminPrisma.client.findUnique({
            where: { slug: tenantSlug },
            select: { status: true },
          });
          if (!client) {
            logAction({
              action: "LOGIN_FAILURE",
              actor: { kind: "anonymous" },
              metadata: { reason: "tenant_not_found", email, tenantSlug },
              req,
            });
            return rejectWithConstantTime(password);
          }
          if (
            client.status === "SUSPENDED" ||
            client.status === "CANCELLED"
          ) {
            logAction({
              action: "LOGIN_FAILURE",
              actor: { kind: "anonymous" },
              metadata: {
                reason: "tenant_inactive",
                email,
                tenantSlug,
                status: client.status,
              },
              req,
            });
            return rejectWithConstantTime(password);
          }
        }

        // Deux chemins :
        //   - tenant : withTenantSchema(slug) → tenant client (qualifie
        //     les queries avec client_<slug>) → include OrgMember OK.
        //   - SUPERADMIN (no tenant) : basePrisma direct → public.User.
        //     Pas d'include sur OrgMember car public.OrgMember a été
        //     droppé en Phase 4 — un SUPERADMIN platform-level n'a pas
        //     d'org propre de toute façon (primaryOrgId reste null).
        if (tenantSlug) {
          return withTenantSchema(tenantSlug, async (tx) => {
            const user = await tx.user.findUnique({
              where: { email },
              include: {
                organizations: {
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { organizationId: true },
                },
              },
            });
            const primaryOrgId =
              user?.organizations[0]?.organizationId ?? null;

            if (!user) {
              logAction({
                action: "LOGIN_FAILURE",
                actor: { kind: "anonymous" },
                metadata: { reason: "user_not_found", email, tenantSlug },
                req,
                tenantSlug,
              });
              return rejectWithConstantTime(password);
            }

            const ok = await bcrypt.compare(password, user.password);
            if (!ok) {
              logAction({
                action: "LOGIN_FAILURE",
                actor: { kind: "anonymous" },
                organizationId: primaryOrgId,
                metadata: { reason: "invalid_password", email, tenantSlug },
                req,
                tenantSlug,
              });
              return null;
            }

            if (user.twoFactorEnabled) {
              if (!totpCode) throw new TwoFactorRequired();
              if (
                !user.twoFactorSecret ||
                !user.twoFactorIv ||
                !user.twoFactorTag
              ) {
                logAction({
                  action: "LOGIN_FAILURE",
                  actor: { kind: "anonymous" },
                  organizationId: primaryOrgId,
                  metadata: {
                    reason: "2fa_state_inconsistent",
                    email,
                    tenantSlug,
                  },
                  req,
                  tenantSlug,
                });
                throw new TwoFactorInvalid();
              }

              const secretPlain = decrypt({
                encryptedValue: user.twoFactorSecret,
                iv: user.twoFactorIv,
                tag: user.twoFactorTag,
              });

              let acceptedVia: "totp" | "backup" | null = null;
              if (await verifyTotp(totpCode, secretPlain)) {
                acceptedVia = "totp";
              } else {
                const idx = await findBackupCodeIndex(
                  totpCode,
                  user.backupCodes,
                );
                if (idx >= 0) {
                  const remaining = [...user.backupCodes];
                  remaining.splice(idx, 1);
                  await tx.user.update({
                    where: { id: user.id },
                    data: { backupCodes: remaining },
                  });
                  acceptedVia = "backup";
                  logAction({
                    action: "BACKUP_CODE_USED",
                    actor: {
                      kind: "user",
                      userId: user.id,
                      email: user.email,
                    },
                    organizationId: primaryOrgId,
                    metadata: { remaining: remaining.length },
                    req,
                    tenantSlug,
                  });
                }
              }

              if (!acceptedVia) {
                logAction({
                  action: "TWO_FACTOR_FAILURE",
                  actor: { kind: "anonymous" },
                  organizationId: primaryOrgId,
                  metadata: {
                    reason: "invalid_totp_or_backup",
                    email,
                    tenantSlug,
                  },
                  req,
                  tenantSlug,
                });
                throw new TwoFactorInvalid();
              }

              logAction({
                action: "TWO_FACTOR_SUCCESS",
                actor: { kind: "user", userId: user.id, email: user.email },
                organizationId: primaryOrgId,
                metadata: { acceptedVia },
                req,
                tenantSlug,
              });
            }

            logAction({
              action: "LOGIN_SUCCESS",
              actor: { kind: "user", userId: user.id, email: user.email },
              organizationId: primaryOrgId,
              metadata: {
                provider: "credentials",
                twoFactor: user.twoFactorEnabled,
                tenantSlug,
              },
              req,
              tenantSlug,
            });

            return {
              id: user.id,
              email: user.email,
              role: user.role,
              tenantSlug,
            };
          });
        }

        // SUPERADMIN flow (no tenant). Lookup direct sur public.User
        // (basePrisma a `?schema=public` par défaut). Pas d'include car
        // public.OrgMember n'existe plus.
        const user = await basePrisma.user.findUnique({ where: { email } });
        if (!user) {
          logAction({
            action: "LOGIN_FAILURE",
            actor: { kind: "anonymous" },
            metadata: { reason: "user_not_found", email, tenantSlug: null },
            req,
          });
          return rejectWithConstantTime(password);
        }

        if (!isSuperadmin(user.role)) {
          logAction({
            action: "LOGIN_FAILURE",
            actor: { kind: "anonymous" },
            metadata: { reason: "tenant_required_for_non_superadmin", email },
            req,
          });
          return rejectWithConstantTime(password);
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          logAction({
            action: "LOGIN_FAILURE",
            actor: { kind: "anonymous" },
            metadata: { reason: "invalid_password", email, tenantSlug: null },
            req,
          });
          return null;
        }

        if (user.twoFactorEnabled) {
          if (!totpCode) throw new TwoFactorRequired();
          if (
            !user.twoFactorSecret ||
            !user.twoFactorIv ||
            !user.twoFactorTag
          ) {
            throw new TwoFactorInvalid();
          }

          const secretPlain = decrypt({
            encryptedValue: user.twoFactorSecret,
            iv: user.twoFactorIv,
            tag: user.twoFactorTag,
          });

          let acceptedVia: "totp" | "backup" | null = null;
          if (await verifyTotp(totpCode, secretPlain)) {
            acceptedVia = "totp";
          } else {
            const idx = await findBackupCodeIndex(totpCode, user.backupCodes);
            if (idx >= 0) {
              const remaining = [...user.backupCodes];
              remaining.splice(idx, 1);
              await basePrisma.user.update({
                where: { id: user.id },
                data: { backupCodes: remaining },
              });
              acceptedVia = "backup";
            }
          }

          if (!acceptedVia) throw new TwoFactorInvalid();
        }

        // SUPERADMIN sans tenant : pas de log AccessLog (audit.ts skip si
        // pas de tenantSlug, et aucun client_<slug>.AccessLog n'est cible
        // valide pour ces actions platform-level).
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantSlug: null,
        };
      },
    }),
  ],
  // Les callbacks jwt/session sont définis dans authConfig (Edge-compatible).
});
