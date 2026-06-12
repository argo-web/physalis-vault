import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { resolveResetToken } from "@/lib/password-reset";
import ResetForm from "./reset-form";

export const metadata = {
  title: "Reset password — Physalis",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("auth.resetPassword");
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
          <div className="login-brand-tag">{t("pageTag")}</div>
        </div>
      </div>
      {!record ? (
        <div className="login-form" style={{ gap: 12 }}>
          <p className="help" style={{ textAlign: "center" }}>
            {t("invalidLink")}
          </p>
          <Link
            href="/forgot-password"
            className="btn btn-primary"
            style={{ padding: "11px 16px", justifyContent: "center" }}
          >
            {t("requestNewLink")}
          </Link>
        </div>
      ) : (
        <ResetForm token={token} />
      )}
    </div>
  );
}
