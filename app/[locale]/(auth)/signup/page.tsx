import Image from "next/image";
import SignupForm from "./signup-form";

export const metadata = {
  title: "Créer un espace Physalis",
  description: "Créez votre organisation sur cette instance Physalis.",
};

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
          <div className="login-brand-tag">Créer une organisation</div>
        </div>
      </div>
      <SignupForm />
    </div>
  );
}
