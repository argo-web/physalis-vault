"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import RateLimitAlert from "@/components/RateLimitAlert";

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
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const urlTenant = params.get("tenant");

  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  useEffect(() => {
    setTenantSlug(detectTenantSlug(urlTenant));
  }, [urlTenant]);

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
      // signIn() peut throw "Failed to construct URL" quand la response
      // est un 429 (rate-limit). On catch et on detecte ce cas pour
      // afficher l'alerte dediee.
      let res: Awaited<ReturnType<typeof signIn>> | null = null;
      try {
        // ⚠️ Ne PAS envoyer de clés à `undefined` : NextAuth signIn
        // sérialise le body en URLSearchParams, qui coerce `undefined`
        // en string littérale `"undefined"` (et casse l'authorize tenant).
        // On construit donc l'objet de manière conditionnelle.
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
        // NextAuth v5 surface notre `code` custom via `res.code`.
        const code = (res as { code?: string } | null)?.code;
        if (code === "2fa_required") {
          setNeedsTotp(true);
          setError(null);
          return;
        }
        if (code === "2fa_invalid") {
          setNeedsTotp(true);
          setError("Code 2FA invalide.");
          setTotpCode("");
          return;
        }
        setError("Email ou mot de passe invalide.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
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
          Espace : <span className="token-mono">{tenantSlug}</span>
        </div>
      )}
      <div className="field">
        <label>Email</label>
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
        <label>Mot de passe</label>
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
          <label>Code 2FA (TOTP)</label>
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
          <div className="help">
            6 chiffres depuis votre app authenticator, ou un code de secours.
          </div>
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
          ? "Connexion..."
          : needsTotp
            ? "Valider le code"
            : "Se connecter"}
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
          ← Recommencer
        </button>
      )}

      {!needsTotp && tenantSlug && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          <Link href="/forgot-password" className="text-accent">
            Mot de passe oublié&nbsp;?
          </Link>
        </p>
      )}

      {allowRegistration && !needsTotp && (
        <p className="text-xs text-muted" style={{ textAlign: "center" }}>
          Pas de compte ?{" "}
          <Link href="/register" className="text-accent">
            Créer un compte
          </Link>
        </p>
      )}
    </form>
  );
}
