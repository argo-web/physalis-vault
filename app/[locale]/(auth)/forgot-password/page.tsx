import Image from "next/image";
import { getTranslations } from "next-intl/server";
import ForgotForm from "./forgot-form";

export const metadata = {
  title: "Forgot password — Physalis",
};

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
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
      <ForgotForm />
    </div>
  );
}
