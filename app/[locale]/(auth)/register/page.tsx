import { notFound } from "next/navigation";
import Image from "next/image";
import RegisterForm from "./register-form";

export default function RegisterPage() {
  if (process.env.ALLOW_REGISTRATION !== "true") {
    notFound();
  }
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
          <div className="login-brand-tag">Créer un compte</div>
        </div>
      </div>
      <RegisterForm />
    </div>
  );
}
