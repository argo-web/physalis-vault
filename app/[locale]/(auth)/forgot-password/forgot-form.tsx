"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotResult } from "./actions";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<
    ForgotResult | null,
    FormData
  >(requestPasswordReset, null);
  const [email, setEmail] = useState("");

  if (state?.ok) {
    return (
      <div className="login-form" style={{ gap: 12 }}>
        <p className="help" style={{ textAlign: "center" }}>
          Si un compte est associé à cette adresse, un email avec les
          instructions de réinitialisation vient d&apos;être envoyé.
        </p>
        <p className="help" style={{ textAlign: "center", fontSize: 13 }}>
          Pensez à vérifier votre dossier spam si vous ne le voyez pas.
        </p>
        <Link
          href="/login"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "center" }}
        >
          ← Retour au login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="login-form">
      <p className="help" style={{ textAlign: "center" }}>
        Saisissez l&apos;email associé à votre compte. Vous recevrez un lien
        pour définir un nouveau mot de passe.
      </p>
      <div className="field">
        <label>Email</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {state?.ok === false && (
        <div
          className="help"
          style={{ color: "var(--danger)", textAlign: "center" }}
        >
          {state.error}
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending || !email}
        style={{ padding: "11px 16px", justifyContent: "center" }}
      >
        {pending ? "Envoi…" : "Envoyer le lien"}
      </button>
      <Link
        href="/login"
        className="btn btn-ghost btn-sm"
        style={{ alignSelf: "center" }}
      >
        ← Retour au login
      </Link>
    </form>
  );
}
