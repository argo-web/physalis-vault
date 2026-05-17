"use client";

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

export default function SignupForm() {
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
        <h2 style={{ margin: 0, fontSize: 18 }}>Bienvenue sur Physalis</h2>
        <p className="help">
          Votre organisation <strong>{state.slug}</strong> a été créée.<br />
          Connectez-vous avec <strong>{state.adminEmail}</strong>.
        </p>
        <a href="/login" className="btn btn-primary" style={{ padding: "11px 16px", justifyContent: "center" }}>
          Se connecter →
        </a>
      </div>
    );
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
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
          placeholder="acme"
          className="input input-mono"
          pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          title="Lowercase, alphanumérique et tirets, 1-50 caractères."
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
          {slugCheck.kind === "checking" && "Vérification…"}
          {slugCheck.kind === "available" && "✓ Disponible"}
          {slugCheck.kind === "unavailable" && slugError}
          {slugCheck.kind === "idle" && "Identifiant unique de votre organisation."}
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
        Déjà un compte ?{" "}
        <Link href="/login" className="text-accent">Se connecter</Link>
      </p>
    </form>
  );
}

function slugLabel(reason: string): string {
  switch (reason) {
    case "empty": return "Slug requis.";
    case "invalid_format": return "Format invalide. Lowercase, lettres/chiffres/tirets uniquement.";
    case "reserved": return "Ce slug est réservé.";
    case "taken": return "Ce slug est déjà utilisé.";
    default: return "Slug indisponible.";
  }
}
