"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import RateLimitAlert from "@/components/RateLimitAlert";
import PluginLoginProposal, { type ExtPluginSession } from "./plugin-login-proposal";

// Détecte le slug tenant depuis (par ordre de priorité) :
//   1. Le param URL `?tenant=<slug>` (mode shared portal)
//   2. Le sous-domaine `<slug>.physalis.cloud` (mode dedicated)
//   3. null → mode legacy (toute autre origine, ex: secretvault.argoweb.fr,
//      vault.physalis.cloud, localhost, etc.)
//
// On exige strictement le suffixe `.physalis.cloud` pour la détection
// par sous-domaine — sinon n'importe quel host à 3+ niveaux serait pris
// pour un tenant (ex: `secretvault.argoweb.fr` traité comme slug
// `secretvault` → 401 "tenant_not_found" alors que c'est juste le portail
// legacy).
const TENANT_DOMAIN_SUFFIX = ".physalis.cloud";
const RESERVED_TENANT_SUBDOMAINS = new Set([
  "vault",
  "www",
  "admin",
  "api",
  "mail",
  "static",
]);

function detectTenantSlug(urlTenant: string | null): string | null {
  // 1. URL param explicite (priorité absolue, sert au mode shared portal).
  if (urlTenant && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(urlTenant)) {
    return urlTenant;
  }
  // 2. Subdomain de physalis.cloud uniquement.
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!host.endsWith(TENANT_DOMAIN_SUFFIX)) return null;
  const sub = host.slice(0, host.length - TENANT_DOMAIN_SUFFIX.length);
  // Sub doit être exactement 1 label (pas de point dedans → pas
  // `foo.bar.physalis.cloud`).
  if (sub.includes(".") || sub.length === 0) return null;
  if (RESERVED_TENANT_SUBDOMAINS.has(sub)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(sub)) return null;
  return sub;
}

export default function LoginForm({
  allowRegistration,
}: {
  allowRegistration: boolean;
}) {
  const t = useTranslations("auth.login");
  const tCommon = useTranslations("auth.common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  // Le router vient de @/i18n/navigation : il préfixe automatiquement
  // la locale active. Garder un path "/dashboard" nu — pas de préfixage
  // manuel sous peine de double prefix ("/fr/fr/dashboard").
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const urlTenant = params.get("tenant");

  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantResolved, setTenantResolved] = useState(false);
  const [pluginSession, setPluginSession] = useState<ExtPluginSession | null | false>(null);
  useEffect(() => {
    const detected = detectTenantSlug(urlTenant);
    setTenantSlug(detected);
    if (detected !== null) setTenantResolved(true);
  }, [urlTenant]);

  const [orgSlugInput, setOrgSlugInput] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gatePending, startGateTransition] = useTransition();

  useEffect(() => {
    let msgHandler: ((event: MessageEvent) => void) | null = null;

    function initBridge() {
      if (msgHandler) return;
      msgHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!event.data || typeof event.data !== "object") return;
        if ((event.data as { type?: unknown }).type !== "PHYSALIS_SESSION") return;
        const s = (event.data as { session?: unknown }).session as ExtPluginSession | null;
        if (s && s.email && s.tenantSlug && s.expiresAt * 1000 > Date.now()) {
          setPluginSession(s);
        }
      };
      window.addEventListener("message", msgHandler);
      window.postMessage({ type: "PHYSALIS_GET_SESSION" }, window.location.origin);
    }

    if (document.documentElement.dataset["secretvaultExt"]) {
      initBridge();
    }
    document.addEventListener("secretvault-extension-ready", initBridge, { once: true });

    return () => {
      if (msgHandler) window.removeEventListener("message", msgHandler);
      document.removeEventListener("secretvault-extension-ready", initBridge);
    };
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmitGate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGateError(null);
    const raw = orgSlugInput.trim().toLowerCase();
    if (!raw) {
      setGateError(t("orgGate.errorRequired"));
      return;
    }
    startGateTransition(async () => {
      let res: Response;
      try {
        res = await fetch("/api/login-resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: raw }),
        });
      } catch {
        setGateError(t("orgGate.errorNetwork"));
        return;
      }
      if (res.status === 429) {
        setGateError(t("orgGate.errorRateLimit"));
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { kind: "tenant"; url: string }
        | { kind: "admin" }
        | { error: string }
        | null;
      if (!res.ok || !data) {
        setGateError(
          (data && "error" in data && data.error) || t("orgGate.errorGeneric"),
        );
        return;
      }
      if ("kind" in data && data.kind === "admin") {
        setTenantSlug(null);
        setTenantResolved(true);
        return;
      }
      if ("kind" in data && data.kind === "tenant") {
        // L'API renvoie l'URL tenant sans préfixe locale (le helper
        // server-side n'a pas le contexte i18n). On préfixe ici pour
        // éviter le 307 cross-domain du middleware locale qui redirigerait
        // l'user vers vault.physalis.cloud/{locale}/login (et casserait
        // le flow de login).
        try {
          const target = new URL(data.url);
          if (!/^\/[a-z]{2}(?:\/|$)/.test(target.pathname)) {
            target.pathname = `/${locale}${target.pathname}`;
          }
          window.location.href = target.toString();
        } catch {
          window.location.href = data.url;
        }
        return;
      }
      setGateError(t("orgGate.errorUnexpected"));
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setRateLimited(false);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof signIn>> | null = null;
      try {
        const creds: Record<string, string> = { email, password };
        if (totpCode) creds.totpCode = totpCode;
        if (tenantSlug) creds.tenantSlug = tenantSlug;
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
        if (code === "rate_limited") {
          setRateLimited(true);
          return;
        }
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

  if (pluginSession) {
    return (
      <PluginLoginProposal
        session={pluginSession}
        onUseOtherAccount={() => setPluginSession(false)}
      />
    );
  }

  if (!tenantResolved) {
    return (
      <form onSubmit={onSubmitGate} className="login-form">
        <div className="field">
          <label>{t("orgGate.label")}</label>
          <input
            autoFocus
            required
            value={orgSlugInput}
            onChange={(e) => setOrgSlugInput(e.target.value)}
            placeholder={t("orgGate.placeholder")}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            pattern="[A-Za-z0-9-]{1,50}"
            className="input"
          />
          <div className="help">{t("orgGate.help")}</div>
        </div>

        {gateError && <p className="error-text">{gateError}</p>}

        <button
          type="submit"
          disabled={gatePending || !orgSlugInput.trim()}
          className="btn btn-primary"
          style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
        >
          {gatePending ? t("orgGate.pendingButton") : t("orgGate.continueButton")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      {tenantSlug && (
        <div
          className="help"
          style={{
            padding: "8px 12px",
            background: "var(--code-bg)",
            borderRadius: 8,
            marginBottom: 4,
          }}
        >
          {t("workspaceLabel")} <span className="token-mono">{tenantSlug}</span>
        </div>
      )}
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

      {!needsTotp && tenantSlug && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          <Link href="/forgot-password" className="text-accent">
            {t("forgotPassword")}
          </Link>
        </p>
      )}

      {allowRegistration && !needsTotp && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          {t("noAccount")}{" "}
          <Link href="/register" className="text-accent">
            {t("createAccount")}
          </Link>
        </p>
      )}
    </form>
  );
}
