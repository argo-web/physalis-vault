import { Suspense } from "react";
import Image from "next/image";
import LoginForm from "./login-form";

export default function LoginPage() {
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
          <div className="login-brand-tag">Connexion</div>
        </div>
      </div>
      <Suspense fallback={null}>
        <LoginForm allowRegistration={allowRegistration} />
      </Suspense>
    </div>
  );
}
