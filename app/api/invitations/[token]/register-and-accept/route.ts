import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
// Public route (token-based, pas de session NextAuth). Le slug tenant est
// extrait du Host header (<slug>.physalis.cloud) — l'invitation est stockée
// dans le schéma client_<slug>.
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { hashInvitationToken } from "@/lib/invitations";
import { rateLimit } from "@/lib/rate-limit";
import { logAction } from "@/lib/audit";
import { readJson } from "@/lib/api";
import { isValidClientSlug } from "@/lib/validation";

type Params = { params: Promise<{ token: string }> };

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";

function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname || !hostname.endsWith(`.${TENANT_DOMAIN}`)) return null;
  const sub = hostname.slice(0, -(TENANT_DOMAIN.length + 1));
  if (sub.includes(".") || !isValidClientSlug(sub)) return null;
  return sub;
}

/** En prod derrière un reverse proxy, le Host header peut pointer sur
 *  l'IP interne (ex. nginx → app:3000). On lit d'abord X-Forwarded-Host
 *  qui est posé par le proxy avec le hostname public, puis fallback Host. */
function resolveTenantSlug(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host");
  return tenantSlugFromHost(forwarded ?? req.headers.get("host"));
}

/**
 * Register a new user account and accept an invitation in one transaction.
 *
 * The invitation token authorizes the email — no `ALLOW_REGISTRATION` check.
 * The new user joins ONLY the inviting org (no personal org is auto-created;
 * they can create one later via the switcher).
 *
 * If a user with the invitation's email already exists, returns 409 — the
 * client should redirect to login + the existing acceptance flow.
 */
export async function POST(req: Request, { params }: Params) {
  // Modest rate-limit (token is the real auth gate; this just guards against
  // abuse if a token were leaked).
  const limited = rateLimit(req, "invitation-register", {
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;

  const tenantSlug = resolveTenantSlug(req);
  if (!tenantSlug) {
    return NextResponse.json(
      { error: "Invitation must be accepted from the workspace URL." },
      { status: 400 },
    );
  }
  const prisma = getTenantPrisma(tenantSlug);

  const { token } = await params;

  const body = (await readJson(req)) as { password?: string } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters" },
      { status: 400 },
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "Invitation invalid or expired" },
      { status: 404 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          "Un compte existe deja avec cet email. Connectez-vous puis acceptez l'invitation.",
      },
      { status: 409 },
    );
  }

  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: invitation.email, password: hash },
      select: { id: true, email: true },
    });
    await tx.orgMember.create({
      data: {
        userId: created.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return created;
  });

  logAction({
    action: "MEMBER_INVITE_ACCEPT",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: invitation.organizationId,
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, viaRegister: true },
    req,
  });

  return NextResponse.json({
    ok: true,
    organization: invitation.organization,
  });
}
