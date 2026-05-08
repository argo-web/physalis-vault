// /signup — Page publique de création d'un nouvel espace Physalis.
//
// Phase 4.1 — pas d'auth requise. Crée admin.clients + schéma tenant +
// premier user admin via lib/provisioning. Email de bienvenue Mailgun
// best-effort.

import Image from "next/image";
import SignupForm from "./signup-form";

export const metadata = {
  title: "Créer un espace Physalis",
  description: "Créez votre espace Physalis self-hosted. 14 jours d'essai gratuit.",
};

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";
const SHARED_PORTAL = process.env.PHYSALIS_SHARED_PORTAL ?? "vault.physalis.cloud";

export default function SignupPage() {
  return (
    <div className="login-card" style={{ maxWidth: 520 }}>
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
          <div className="login-brand-tag">Créer un espace</div>
        </div>
      </div>
      <SignupForm tenantDomain={TENANT_DOMAIN} sharedPortal={SHARED_PORTAL} />
    </div>
  );
}
