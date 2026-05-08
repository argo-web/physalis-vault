"use client";

import { useState, useTransition } from "react";
import { RiLockLine } from "@remixicon/react";
import { encryptForRecipient } from "@/lib/secret-request-crypto";

export default function RequestForm({
  token,
  label,
  description,
  requestedByEmail,
  publicKeyJwk,
  expiresAt,
}: {
  token: string;
  label: string;
  description: string | null;
  requestedByEmail: string;
  publicKeyJwk: string;
  expiresAt: string;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!secret || secret.length === 0) {
      setError("Saisissez un secret avant de continuer.");
      return;
    }
    if (secret.length > 50_000) {
      setError("Secret trop long (max 50 000 caractères).");
      return;
    }
    startTransition(async () => {
      try {
        // Chiffrement local — le secret ne sort jamais du navigateur en clair.
        const payload = await encryptForRecipient(secret, publicKeyJwk);
        const res = await fetch(`/api/public/secret-requests/${token}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          if (res.status === 410) {
            setError(
              "Ce lien n'est plus valide (déjà utilisé, expiré ou révoqué).",
            );
          } else if (res.status === 429) {
            setError(
              "Trop de tentatives, réessayez dans une heure.",
            );
          } else {
            setError("Une erreur est survenue. Réessayez.");
          }
          return;
        }
        // Vide le champ dès succès, par précaution.
        setSecret("");
        setSubmitted(true);
      } catch (err) {
        console.error(err);
        setError(
          "Impossible de chiffrer le secret. Vérifiez que votre navigateur supporte WebCrypto.",
        );
      }
    });
  }

  if (submitted) {
    return (
      <div className="login-form" style={{ gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 32 }}>✅</div>
        <p className="help">
          Votre secret a été transmis en toute sécurité à{" "}
          <strong>{requestedByEmail}</strong>.
        </p>
        <p className="help" style={{ fontSize: 13 }}>
          Ce lien est maintenant invalide. Vous pouvez fermer cette page.
        </p>
      </div>
    );
  }

  const expires = new Date(expiresAt).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });

  return (
    <form onSubmit={onSubmit} className="login-form">
      <p className="help" style={{ textAlign: "center" }}>
        <strong>{requestedByEmail}</strong> vous demande de partager :
      </p>
      <div
        style={{
          padding: "10px 14px",
          background: "var(--code-bg)",
          borderRadius: 8,
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {description && (
        <p
          className="help"
          style={{
            textAlign: "center",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {description}
        </p>
      )}

      <div className="field">
        <label>Votre secret</label>
        <textarea
          required
          autoFocus
          rows={3}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="input"
          style={{ fontFamily: "var(--font-mono, monospace)", resize: "vertical" }}
          placeholder="sk_live_…"
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button
        type="submit"
        disabled={pending || !secret}
        className="btn btn-primary"
        style={{ marginTop: 6, padding: "11px 16px", justifyContent: "center" }}
      >
        {pending ? (
          "Envoi sécurisé…"
        ) : (
          <>
            <RiLockLine size={14} aria-hidden /> Envoyer de façon sécurisée
          </>
        )}
      </button>

      <p
        className="help"
        style={{ textAlign: "center", fontSize: 12, marginTop: 6 }}
      >
        🔐 Votre secret est chiffré dans votre navigateur avant transmission.
        Physalis ne peut pas le lire.
        <br />
        Ce lien expire le {expires}.
      </p>
    </form>
  );
}
