import { notFound } from "next/navigation";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  if (process.env.ALLOW_REGISTRATION !== "true") {
    notFound();
  }
  const t = await getTranslations("auth.register");
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
      <RegisterForm />
    </div>
  );
}
