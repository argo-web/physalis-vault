"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { signupTenant, type SignupResult } from "./actions";

function deriveSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

type SlugCheck =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; reason: string };

export default function SignupForm() {
  const t = useTranslations("auth.signup");
  const tCommon = useTranslations("auth.common");
  const [state, action, pending] = useActionState<SignupResult | null, FormData>(
    signupTenant,
    null,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugCheck, setSlugCheck] = useState<SlugCheck>({ kind: "idle" });

  useEffect(() => {
    if (!slugTouched) setSlug(deriveSlug(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!slug) {
      setSlugCheck({ kind: "idle" });
      return;
    }
    setSlugCheck({ kind: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/signup/check-slug?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) { setSlugCheck({ kind: "idle" }); return; }
        const data = (await res.json()) as { available: true } | { available: false; reason: string };
        setSlugCheck(data.available ? { kind: "available" } : { kind: "unavailable", reason: data.reason });
      } catch {
        setSlugCheck({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug]);

  if (state?.ok) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="section-eyebrow" style={{ color: "var(--success)", fontSize: 13 }}>
          ✓ Compte créé
        </div>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t("successWelcome")}</h2>
        <p className="help">
          Votre organisation <strong>{state.slug}</strong> a été créée.<br />
          Connectez-vous avec <strong>{state.adminEmail}</strong>.
        </p>
        <Link href="/login" className="btn btn-primary" style={{ padding: "11px 16px", justifyContent: "center" }}>
          {t("signInButton")}
        </Link>
      </div>
    );
  }

  const slugAvailable = slugCheck.kind === "available";
  const slugError = slugCheck.kind === "unavailable" ? slugLabel(t, slugCheck.reason) : null;

  return (
    <form action={action} className="login-form">
      <div className="field">
        <label>{t("orgNameLabel")}</label>
        <input
          type="text"
          name="name"
          required
          maxLength={255}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ACME Corp"
          className="input"
          autoFocus
        />
      </div>

      <div className="field">
        <label>{t("slugLabel")}</label>
        <input
          type="text"
          name="slug"
          required
          maxLength={50}
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
          placeholder="acme"
          className="input input-mono"
          pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          title={t("slugTitle")}
        />
        <div
          className="help"
          style={{
            marginTop: 4,
            color: slugCheck.kind === "available"
              ? "var(--success)"
              : slugCheck.kind === "unavailable"
                ? "var(--danger)"
                : "var(--muted)",
          }}
        >
          {slugCheck.kind === "checking" && t("slugChecking")}
          {slugCheck.kind === "available" && "✓ Disponible"}
          {slugCheck.kind === "unavailable" && slugError}
          {slugCheck.kind === "idle" && "Identifiant unique de votre organisation."}
        </div>
      </div>

      <div className="field">
        <label>{t("adminEmailLabel")}</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={t("adminEmailPlaceholder")}
          className="input"
        />
      </div>

      <div className="field">
        <label>{t("passwordLabel")}</label>
        <input
          type="password"
          name="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="input"
        />
      </div>

      {state && !state.ok && <p className="error-text">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || slugCheck.kind === "unavailable"}
        className="btn btn-primary"
        style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
      >
        {pending ? "Création…" : "Créer mon organisation"}
      </button>

      <p className="text-xs text-muted" style={{ textAlign: "center" }}>
        {t("alreadyHaveAccount")}{" "}
        <Link href="/login" className="text-accent">{tCommon("signIn")}</Link>
      </p>
    </form>
  );
}

function slugLabel(
  t: ReturnType<typeof useTranslations<"auth.signup">>,
  reason: string,
): string {
  switch (reason) {
    case "empty": return t("slugErrors.empty");
    case "invalid_format": return t("slugErrors.invalidFormat");
    case "reserved": return t("slugErrors.reserved");
    case "taken": return t("slugErrors.taken");
    default: return t("slugErrors.default");
  }
}
