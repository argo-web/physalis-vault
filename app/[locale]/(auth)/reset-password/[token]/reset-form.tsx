"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPassword, type ResetResult } from "./actions";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ResetResult | null,
    FormData
  >(resetPassword, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  if (state?.ok) {
    return (
      <div className="login-form" style={{ gap: 12 }}>
        <p className="help" style={{ textAlign: "center" }}>
          Votre mot de passe a été mis à jour. Vous pouvez maintenant vous
          connecter avec votre nouveau mot de passe.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => router.push("/login")}
          style={{ padding: "11px 16px", justifyContent: "center" }}
        >
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label>Nouveau mot de passe</label>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={12}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Confirmer le mot de passe</label>
        <input
          type="password"
          name="confirm"
          required
          autoComplete="new-password"
          minLength={12}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <p className="help" style={{ fontSize: 13 }}>
        12 caractères minimum.
      </p>
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
        disabled={pending || password.length < 12 || password !== confirm}
        style={{ padding: "11px 16px", justifyContent: "center" }}
      >
        {pending ? "Validation…" : "Définir le nouveau mot de passe"}
      </button>
      <Link
        href="/login"
        className="btn btn-ghost btn-sm"
        style={{ alignSelf: "center" }}
      >
        Annuler
      </Link>
    </form>
  );
}
