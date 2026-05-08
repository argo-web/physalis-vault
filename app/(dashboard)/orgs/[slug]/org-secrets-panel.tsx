"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { OrgRole } from "@prisma/client";
import { RiKey2Line } from "@remixicon/react";

type SecretListItem = { key: string; updatedAt: string };

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  MEMBER: 1,
  DEV: 2,
  ADMIN: 3,
  OWNER: 4,
};

const RESERVED_KEYS = new Set([
  "GITHUB_DISPATCH_TOKEN",
  "REGISTRY_PAT",
  "REGISTRY_USER",
  "REGISTRY_URL",
]);

export default function OrgSecretsPanel({
  slug,
  role,
}: {
  slug: string;
  role: OrgRole;
}) {
  const [secrets, setSecrets] = useState<SecretListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);

  // DEV+ peut lire (list + reveal). ADMIN+ peut créer/modifier/supprimer.
  const canRead = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.DEV;
  const canManage = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.ADMIN;

  const reload = useCallback(async () => {
    if (!canRead) {
      setSecrets([]);
      return;
    }
    setError(null);
    const res = await fetch(`/api/orgs/${slug}/secrets`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { secrets: SecretListItem[] };
    setSecrets(data.secrets);
  }, [slug, canRead]);

  useEffect(() => {
    setSecrets(null);
    setRevealed({});
    setEditKey(null);
    setAdding(false);
    reload();
  }, [reload]);

  async function reveal(key: string) {
    if (revealed[key] !== undefined) {
      setRevealed((r) => {
        const copy = { ...r };
        delete copy[key];
        return copy;
      });
      return;
    }
    const res = await fetch(
      `/api/orgs/${slug}/secrets/${encodeURIComponent(key)}`,
    );
    if (!res.ok) {
      setError("Impossible de révéler la valeur.");
      return;
    }
    const data = (await res.json()) as { value: string };
    setRevealed((r) => ({ ...r, [key]: data.value }));
  }

  async function remove(key: string) {
    if (!confirm(`Supprimer le secret "${key}" ?`)) return;
    const res = await fetch(
      `/api/orgs/${slug}/secrets/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    setRevealed((r) => {
      const copy = { ...r };
      delete copy[key];
      return copy;
    });
    reload();
  }

  if (!canRead) {
    return (
      <p className="help">
        Réservé aux DEV/ADMIN/OWNER de l&apos;organisation.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="section-header">
        <div>
          <h2 className="section-title">Secrets globaux de l&apos;organisation</h2>
          <p className="help" style={{ marginTop: 4 }}>
            Lus par les fonctionnalités du vault. Clés <strong>réservées</strong> :
          </p>
          <ul className="help" style={{ marginTop: 4, paddingLeft: 18 }}>
            <li>
              <code className="code-mono">GITHUB_DISPATCH_TOKEN</code> — bouton
              Redeploy (scope <code className="code-mono">actions:write</code>)
            </li>
            <li>
              <code className="code-mono">REGISTRY_PAT</code> +{" "}
              <code className="code-mono">REGISTRY_USER</code> — exposés au bundle{" "}
              <code className="code-mono">/api/deploy</code> sous{" "}
              <code className="code-mono">registry.{"{user,pat}"}</code> (scope{" "}
              <code className="code-mono">read:packages</code>)
            </li>
            <li>
              <code className="code-mono">REGISTRY_URL</code> — optionnel, défaut{" "}
              <code className="code-mono">ghcr.io</code>
            </li>
          </ul>
        </div>
        {!adding && canManage && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-primary btn-sm"
          >
            + Ajouter
          </button>
        )}
      </div>

      {adding && (
        <div className="create-card">
          <SecretForm
            slug={slug}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              reload();
            }}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {secrets === null ? (
        <p className="help">Chargement…</p>
      ) : secrets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucun secret global</div>
        </div>
      ) : (
        <div className="row-list">
          {secrets.map((s) =>
            editKey === s.key ? (
              <div key={s.key} className="card">
                <SecretForm
                  slug={slug}
                  initialKey={s.key}
                  onCancel={() => setEditKey(null)}
                  onSaved={() => {
                    setEditKey(null);
                    setRevealed((r) => {
                      const copy = { ...r };
                      delete copy[s.key];
                      return copy;
                    });
                    reload();
                  }}
                />
              </div>
            ) : (
              <div key={s.key} className="row">
                <div className="row-icon"><RiKey2Line size={18} aria-hidden /></div>
                <div className="row-info">
                  <div className="row-name code-mono flex items-center gap-2">
                    {s.key}
                    {RESERVED_KEYS.has(s.key) && (
                      <span
                        className="chip chip-active"
                        title="Clé réservée — lue par le vault"
                      >
                        réservé
                      </span>
                    )}
                  </div>
                  <div className="row-meta">
                    <span className="code-mono">
                      {revealed[s.key] !== undefined
                        ? revealed[s.key]
                        : "••••••••••••"}
                    </span>
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => reveal(s.key)}
                    className="btn btn-ghost btn-xs"
                  >
                    {revealed[s.key] !== undefined ? "Masquer" : "Afficher"}
                  </button>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditKey(s.key)}
                        className="btn btn-ghost btn-xs"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(s.key)}
                        className="btn btn-danger btn-xs"
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function SecretForm({
  slug,
  initialKey,
  onCancel,
  onSaved,
}: {
  slug: string;
  initialKey?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(initialKey ?? "");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initialKey);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}/secrets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="form-row">
        <div className="field" style={{ minWidth: 200 }}>
          <label>Clé</label>
          <input
            required
            readOnly={isEdit}
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="GITHUB_DISPATCH_TOKEN"
            className="input input-mono"
          />
        </div>
        <div className="field" style={{ minWidth: 240, flex: 2 }}>
          <label>Valeur</label>
          <input
            required
            autoFocus={isEdit}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isEdit ? "Nouvelle valeur" : "Valeur"}
            className="input input-mono"
          />
        </div>
      </div>
      {error && (
        <p className="error-text" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Enregistrement..." : isEdit ? "Mettre à jour" : "Créer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
