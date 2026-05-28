import Image from "next/image";
import Link from "next/link";
import { resolveResetToken } from "@/lib/password-reset";
import ResetForm from "./reset-form";

export const metadata = {
  title: "Réinitialiser le mot de passe — Physalis",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const record = await resolveResetToken(token);

  return (
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
          <div className="login-brand-tag">Nouveau mot de passe</div>
        </div>
      </div>
      {!record ? (
        <div className="login-form" style={{ gap: 12 }}>
          <p className="help" style={{ textAlign: "center" }}>
            Ce lien est invalide ou expiré. Demandez un nouveau lien depuis la
            page de connexion.
          </p>
          <Link
            href="/forgot-password"
            className="btn btn-primary"
            style={{ padding: "11px 16px", justifyContent: "center" }}
          >
            Demander un nouveau lien
          </Link>
        </div>
      ) : (
        <ResetForm token={token} />
      )}
    </div>
  );
}
