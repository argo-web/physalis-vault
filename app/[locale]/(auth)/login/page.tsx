import { Suspense } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("auth.login");
  const allowRegistration = process.env.ALLOW_REGISTRATION === "true";
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
      <Suspense fallback={null}>
        <LoginForm allowRegistration={allowRegistration} />
      </Suspense>
    </div>
  );
}
