"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrgRole } from "@prisma/client";

export default function OrgSettingsDialog({
  slug,
  initialName,
  role,
  onClose,
}: {
  slug: string;
  initialName: string;
  role: OrgRole;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== initialName && name.trim().length > 0;
  const isOwner = role === "OWNER";

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      router.refresh();
    });
  }

  function deleteOrg() {
    const confirm1 = prompt(
      `Pour supprimer l'organisation, tapez son nom : "${initialName}"`,
    );
    if (confirm1 !== initialName) return;
    if (
      !confirm(
        "Cette action est IRRÉVERSIBLE. Tous les projets, secrets, machine tokens, membres et invitations de l'organisation seront supprimés. Continuer ?",
      )
    )
      return;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Suppression impossible.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">Paramètres de l&apos;organisation</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <section>
            <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
              Nom de l&apos;organisation
            </h3>
            <form onSubmit={save} className="form-row">
              <div className="field" style={{ minWidth: 220 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={!dirty || pending}
                className="btn btn-primary btn-sm"
              >
                {pending ? "..." : "Enregistrer"}
              </button>
            </form>
            <p className="help" style={{ marginTop: 6 }}>
              Le slug <code className="code-mono">/{slug}</code> ne change pas.
            </p>
          </section>

          {error && <p className="error-text">{error}</p>}

          {isOwner && (
            <section
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 18,
              }}
            >
              <h3
                className="section-title"
                style={{ fontSize: 14, color: "var(--danger)", marginBottom: 8 }}
              >
                Zone dangereuse
              </h3>
              <p className="help" style={{ marginBottom: 12 }}>
                Supprimer l&apos;organisation supprime <strong>tout</strong> :
                projets, secrets, machine tokens, membres, invitations. Action
                irréversible.
              </p>
              <button
                type="button"
                onClick={deleteOrg}
                disabled={pending}
                className="btn btn-danger btn-sm"
              >
                Supprimer l&apos;organisation
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
