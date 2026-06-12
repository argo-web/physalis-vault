"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import RateLimitAlert from "@/components/RateLimitAlert";

export default function LoginForm({
  allowRegistration,
}: {
  allowRegistration: boolean;
}) {
  const t = useTranslations("auth.login");
  const tCommon = useTranslations("auth.common");
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setRateLimited(false);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof signIn>> | null = null;
      try {
        const creds: Record<string, string> = { email, password };
        if (totpCode) creds.totpCode = totpCode;
        res = await signIn("credentials", {
          ...creds,
          redirect: false,
        });
      } catch {
        setRateLimited(true);
        return;
      }
      if (!res || res.error) {
        const code = (res as { code?: string } | null)?.code;
        if (code === "2fa_required") {
          setNeedsTotp(true);
          setError(null);
          return;
        }
        if (code === "2fa_invalid") {
          setNeedsTotp(true);
          setError(t("errorTotpInvalid"));
          setTotpCode("");
          return;
        }
        setError(t("errorInvalidCredentials"));
        return;
      }
      router.push(callbackUrl);
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
          readOnly={needsTotp}
          className="input"
        />
      </div>

      <div className="field">
        <label>{t("passwordLabel")}</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          readOnly={needsTotp}
          className="input"
        />
      </div>

      {needsTotp && (
        <div className="field">
          <label>{t("totpLabel")}</label>
          <input
            required
            autoFocus
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="123456"
            inputMode="text"
            autoComplete="one-time-code"
            className="input input-mono"
          />
          <div className="help">{t("totpHelp")}</div>
        </div>
      )}

      {rateLimited && <RateLimitAlert />}
      {!rateLimited && error && <p className="error-text">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
        style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
      >
        {pending
          ? t("pendingButton")
          : needsTotp
            ? t("validateTotpButton")
            : tCommon("signIn")}
      </button>

      {needsTotp && (
        <button
          type="button"
          onClick={() => {
            setNeedsTotp(false);
            setTotpCode("");
            setError(null);
          }}
          className="btn-link-danger"
          style={{ color: "var(--muted)", textAlign: "center" }}
        >
          {t("retryButton")}
        </button>
      )}

      {!needsTotp && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          <Link href="/forgot-password" className="text-accent">
            {t("forgotPassword")}
          </Link>
        </p>
      )}

      {allowRegistration && !needsTotp && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-accent">
            {t("createAccount")}
          </Link>
        </p>
      )}
    </form>
  );
}
