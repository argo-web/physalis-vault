import Image from "next/image";
import ForgotForm from "./forgot-form";

export const metadata = {
  title: "Mot de passe oublié — Physalis",
};

export default function ForgotPasswordPage() {
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
          <div className="login-brand-tag">Mot de passe oublié</div>
        </div>
      </div>
      <ForgotForm />
    </div>
  );
}
