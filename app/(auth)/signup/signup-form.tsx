"use client";

// Formulaire de signup public — Phase 4.1.
//
// Auto-derive du slug depuis le nom de l'organisation, avec vérification
// de disponibilité en temps réel via /api/signup/check-slug (debounced 350ms).

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
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

export default function SignupForm({
  tenantDomain,
  sharedPortal,
}: {
  tenantDomain: string;
  sharedPortal: string;
}) {
  const [state, action, pending] = useActionState<
    SignupResult | null,
    FormData
  >(signupTenant, null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugCheck, setSlugCheck] = useState<SlugCheck>({ kind: "idle" });
  const [plan, setPlan] = useState<"FREE" | "SHARED" | "DEDICATED">("FREE");

  const slugSample = slug || "<slug>";
  const accessUrl =
    plan === "FREE"
      ? `${sharedPortal}/login?tenant=${slugSample}`
      : `${slugSample}.${tenantDomain}`;

  // Auto-derive slug.
  useEffect(() => {
    if (!slugTouched) setSlug(deriveSlug(name));
  }, [name, slugTouched]);

  // Debounced slug availability check.
  useEffect(() => {
    if (!slug) {
      setSlugCheck({ kind: "idle" });
      return;
    }
    setSlugCheck({ kind: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/signup/check-slug?slug=${encodeURIComponent(slug)}`,
        );
        if (!res.ok) {
          setSlugCheck({ kind: "idle" });
          return;
        }
        const data = (await res.json()) as
          | { available: true }
          | { available: false; reason: string };
        if (data.available) {
          setSlugCheck({ kind: "available" });
        } else {
          setSlugCheck({ kind: "unavailable", reason: data.reason });
        }
      } catch {
        setSlugCheck({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug]);

  if (state?.ok) {
    return <SignupSuccess result={state} />;
  }

  const slugAvailable = slugCheck.kind === "available";
  const slugError = slugCheck.kind === "unavailable" ? slugLabel(slugCheck.reason) : null;

  return (
    <form action={action} className="login-form">
      <div className="field">
        <label>Nom de l&apos;organisation *</label>
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
        <label>Slug *</label>
        <input
          type="text"
          name="slug"
          required
          maxLength={50}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="acme"
          className="input input-mono"
          pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          title="Lowercase, alphanumérique et tirets, 1-50 caractères."
        />
        <div
          className="help"
          style={{
            marginTop: 4,
            color:
              slugCheck.kind === "available"
                ? "var(--success)"
                : slugCheck.kind === "unavailable"
                  ? "var(--danger)"
                  : "var(--muted)",
          }}
        >
          {slugCheck.kind === "checking" && "Vérification…"}
          {slugCheck.kind === "available" && (
            <>
              ✓ Disponible —{" "}
              <span className="token-mono">{accessUrl}</span>
            </>
          )}
          {slugCheck.kind === "unavailable" && slugError}
          {slugCheck.kind === "idle" && (
            <>
              Sera votre URL : <span className="token-mono">{accessUrl}</span>
            </>
          )}
        </div>
      </div>

      <div className="field">
        <label>Email admin *</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="vous@exemple.com"
          className="input"
        />
      </div>

      <div className="field">
        <label>Mot de passe (12 caractères minimum) *</label>
        <input
          type="password"
          name="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="input"
        />
      </div>

      <div className="field">
        <label>Plan *</label>
        <div style={{ display: "grid", gap: 8 }}>
          <label className="plan-option">
            <input
              type="radio"
              name="plan"
              value="FREE"
              checked={plan === "FREE"}
              onChange={() => setPlan("FREE")}
            />
            <span>
              <strong>free</strong> — 1 org, 1 user · coffre personnel +
              backups · <strong>gratuit permanent</strong>, pas de trial
            </span>
          </label>
          <label className="plan-option">
            <input
              type="radio"
              name="plan"
              value="SHARED"
              checked={plan === "SHARED"}
              onChange={() => setPlan("SHARED")}
            />
            <span>
              <strong>shared</strong> — 2 orgs, 5 users · multi-utilisateurs,
              gestion serveurs, OIDC · 5€/mois après trial 14j
            </span>
          </label>
          <label className="plan-option" style={{ opacity: 0.55 }}>
            <input
              type="radio"
              name="plan"
              value="DEDICATED"
              disabled
            />
            <span>
              <strong>dedicated</strong>{" "}
              <span
                className="role role-shared"
                style={{ marginLeft: 4, fontSize: 11 }}
              >
                bientôt
              </span>{" "}
              — 5 orgs, 15 users · sous-domaine dédié + instance dédiée ·
              25€/mois après trial 14j
            </span>
          </label>
        </div>
      </div>

      {state && !state.ok && (
        <p className="error-text">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || (slugCheck.kind === "unavailable")}
        className="btn btn-primary"
        style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
      >
        {pending
          ? "Création + provisioning…"
          : !slugAvailable && slug
            ? "Slug non disponible"
            : "Créer mon espace Physalis"}
      </button>

      <p className="text-xs text-muted" style={{ textAlign: "center" }}>
        Déjà un compte ?{" "}
        <Link href="/login" className="text-accent">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

function slugLabel(reason: string): string {
  switch (reason) {
    case "empty":
      return "Slug requis.";
    case "invalid_format":
      return "Format invalide. Lowercase, lettres/chiffres/tirets uniquement.";
    case "reserved":
      return "Ce slug est réservé.";
    case "taken":
      return "Ce slug est déjà utilisé.";
    default:
      return "Slug indisponible.";
  }
}

function SignupSuccess({
  result,
}: {
  result: Extract<SignupResult, { ok: true }>;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        className="section-eyebrow"
        style={{ color: "var(--success)", fontSize: 13 }}
      >
        ✓ Espace créé
      </div>
      <h2 style={{ margin: 0, fontSize: 18 }}>Bienvenue sur Physalis</h2>
      <p className="help">
        Votre espace <strong>{result.slug}</strong> a été provisionné.
        Un email de bienvenue a été envoyé à{" "}
        <strong>{result.adminEmail}</strong>.
      </p>
      <div className="field">
        <label>URL de connexion</label>
        <input
          type="text"
          value={result.loginUrl}
          readOnly
          className="input input-mono"
        />
      </div>
      <a
        href={result.loginUrl}
        className="btn btn-primary"
        style={{ padding: "11px 16px", justifyContent: "center" }}
      >
        Se connecter →
      </a>
    </div>
  );
}
