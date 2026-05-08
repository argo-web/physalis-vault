"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Création impossible.");
        return;
      }
      setName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="create-card">
      <div className="create-card-title">Créer un projet</div>
      <div className="form-row">
        <div className="field">
          <label>Nom</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: voyages"
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="btn btn-primary"
        >
          {pending ? "Création..." : "Créer"}
        </button>
      </div>
      <p className="help" style={{ marginTop: 10 }}>
        3 environnements créés automatiquement : <code>production</code>,{" "}
        <code>staging</code>, <code>development</code>.
      </p>
      {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
    </form>
  );
}
