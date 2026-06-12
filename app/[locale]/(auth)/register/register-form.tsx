"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import RateLimitAlert from "@/components/RateLimitAlert";

export default function RegisterForm() {
  const t = useTranslations("auth.register");
  const tCommon = useTranslations("auth.common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setRateLimited(false);
    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 429) {
        setRateLimited(true);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? t("errorFallback"));
        return;
      }
      let signed: Awaited<ReturnType<typeof signIn>> | null = null;
      try {
        signed = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
      } catch {
        router.push("/login");
        return;
      }
      if (!signed || signed.error) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <div className="field">
        <label>{tCommon("emailLabel")}</label>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
      </div>

      <div className="field">
        <label>{t("passwordLabel")}</label>
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </div>

      {rateLimited && <RateLimitAlert />}
      {!rateLimited && error && <p className="error-text">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
        style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
      >
        {pending ? t("pendingButton") : t("submitButton")}
      </button>

      <p className="text-xs text-muted" style={{ textAlign: "center" }}>
        {t("alreadyHaveAccount")}{" "}
        <Link href="/login" className="text-accent">
          {tCommon("signIn")}
        </Link>
      </p>
    </form>
  );
}
