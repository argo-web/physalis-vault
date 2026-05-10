import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { hashInvitationToken } from "@/lib/invitations";
import { isValidClientSlug } from "@/lib/validation";
import AcceptInvitationButton from "./accept-button";
import InvitationRegisterForm from "./register-form";

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";

/** Extrait le slug tenant depuis le Host header (ex: "gael.physalis.cloud" → "gael"). */
function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname || !hostname.endsWith(`.${TENANT_DOMAIN}`)) return null;
  const sub = hostname.slice(0, -(TENANT_DOMAIN.length + 1));
  if (sub.includes(".") || !isValidClientSlug(sub)) return null;
  return sub;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // L'invité arrive depuis un email externe → pas de session ni de
  // contexte tenant en AsyncLocalStorage. Le slug doit venir du subdomain
  // du Host header (`<slug>.physalis.cloud`).
  // X-Forwarded-Host prioritaire : derrière un reverse proxy (NPM, etc.)
  // le Host header pointe sur l'IP interne du container — c'est le
  // X-Forwarded-Host qui contient le hostname public vu par l'utilisateur.
  const reqHeaders = await headers();
  const tenantSlug = tenantSlugFromHost(
    reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host"),
  );
  if (!tenantSlug) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p className="help" style={{ textAlign: "center" }}>
            Cette invitation doit être ouverte depuis l&apos;URL de votre
            workspace (ex: <code>monworkspace.physalis.cloud/invite/...</code>).
          </p>
        </div>
      </div>
    );
  }
  const prisma = getTenantPrisma(tenantSlug);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: {
      organization: { select: { name: true, slug: true } },
      invitedBy: { select: { email: true } },
    },
  });

  const session = await auth();

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date()
  ) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <Image
              src="/icon-128.png"
              alt="Physalis"
              width={64}
              height={64}
              className="login-brand-icon"
              priority
            />
            <div className="login-brand-text">
              <div className="login-brand-name">Physalis</div>
              <div className="login-brand-tag">Invitation invalide</div>
            </div>
          </div>
          <p className="help" style={{ textAlign: "center" }}>
            {invitation?.acceptedAt
              ? "Cette invitation a déjà été acceptée."
              : invitation
                ? "Cette invitation a expiré."
                : "Cette invitation est introuvable."}
          </p>
          <Link
            href="/dashboard"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "center" }}
          >
            ← Retour
          </Link>
        </div>
      </div>
    );
  }

  if (!session?.user?.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });

    if (!existingUser) {
      return (
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-brand">
              <Image
                src="/icon-128.png"
                alt="Physalis"
                width={64}
                height={64}
                className="login-brand-icon"
                priority
              />
              <div className="login-brand-text">
                <div className="login-brand-name">Physalis</div>
                <div className="login-brand-tag">Invitation</div>
              </div>
            </div>
            <InvitationRegisterForm
              token={token}
              email={invitation.email}
              organizationName={invitation.organization.name}
              organizationSlug={invitation.organization.slug}
              inviterEmail={invitation.invitedBy.email}
              role={invitation.role}
              tenantSlug={tenantSlug}
            />
          </div>
        </div>
      );
    }

    const callback = `/invite/${token}`;
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <Image
              src="/icon-128.png"
              alt="Physalis"
              width={64}
              height={64}
              className="login-brand-icon"
              priority
            />
            <div className="login-brand-text">
              <div className="login-brand-name">Physalis</div>
              <div className="login-brand-tag">Invitation</div>
            </div>
          </div>
          <p className="help" style={{ textAlign: "center" }}>
            <strong>{invitation.invitedBy.email}</strong> vous invite à
            rejoindre <strong>{invitation.organization.name}</strong> avec le
            rôle{" "}
            <span className={`role role-${invitation.role.toLowerCase()}`}>
              {invitation.role}
            </span>
            .
          </p>
          <p className="help" style={{ textAlign: "center" }}>
            Connectez-vous avec l&apos;adresse{" "}
            <strong>{invitation.email}</strong> pour accepter.
          </p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callback)}`}
            className="btn btn-primary"
            style={{
              marginTop: 6,
              padding: "11px 16px",
              justifyContent: "center",
            }}
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const emailMismatch =
    session.user.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <Image
            src="/icon-128.png"
            alt="Physalis"
            width={64}
            height={64}
            className="login-brand-icon"
            priority
          />
          <div className="login-brand-text">
            <div className="login-brand-name">Physalis</div>
            <div className="login-brand-tag">Invitation</div>
          </div>
        </div>
        <p className="help" style={{ textAlign: "center" }}>
          <strong>{invitation.invitedBy.email}</strong> vous invite à rejoindre{" "}
          <strong>{invitation.organization.name}</strong> avec le rôle{" "}
          <span className={`role role-${invitation.role.toLowerCase()}`}>
            {invitation.role}
          </span>
          .
        </p>

        {emailMismatch ? (
          <div
            className="help"
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--accent-bg)",
              color: "var(--fg)",
            }}
          >
            Cette invitation a été envoyée à{" "}
            <strong>{invitation.email}</strong>. Vous êtes connecté avec{" "}
            <strong>{session.user.email}</strong>.
            <br />
            Déconnectez-vous puis reconnectez-vous avec la bonne adresse.
          </div>
        ) : (
          <AcceptInvitationButton
            token={token}
            orgSlug={invitation.organization.slug}
          />
        )}
      </div>
    </div>
  );
}
