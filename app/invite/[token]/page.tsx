import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashInvitationToken } from "@/lib/invitations";
import AcceptInvitationButton from "./accept-button";
import InvitationRegisterForm from "./register-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

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
