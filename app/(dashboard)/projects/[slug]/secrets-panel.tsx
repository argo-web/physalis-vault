"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ProjectRole } from "@prisma/client";
import { RiKey2Line } from "@remixicon/react";
import {
  SECRET_CATEGORIES,
  SECRET_CATEGORY_LABELS,
  UNCATEGORIZED_LABEL,
  type SecretCategory,
} from "@/lib/categories";

type SecretListItem = {
  key: string;
  category: SecretCategory | null;
  updatedAt: string;
};

const ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export default function SecretsPanel({
  slug,
  env,
  role,
}: {
  slug: string;
  env: string;
  role: ProjectRole;
}) {
  const [secrets, setSecrets] = useState<SecretListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);

  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/projects/${slug}/${env}/secrets`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { secrets: SecretListItem[] };
    setSecrets(data.secrets);
  }, [slug, env]);

  useEffect(() => {
    setSecrets(null);
    setRevealed({});
    setEditKey(null);
    setAdding(false);
    reload();
  }, [reload]);

  const grouped = useMemo<
    { category: SecretCategory | null; label: string; items: SecretListItem[] }[]
  >(() => {
    if (!secrets) return [];
    const buckets = new Map<SecretCategory | null, SecretListItem[]>();
    for (const s of secrets) {
      const arr = buckets.get(s.category) ?? [];
      arr.push(s);
      buckets.set(s.category, arr);
    }
    const result: {
      category: SecretCategory | null;
      label: string;
      items: SecretListItem[];
    }[] = [];
    for (const cat of SECRET_CATEGORIES) {
      const items = buckets.get(cat);
      if (items && items.length > 0) {
        result.push({ category: cat, label: SECRET_CATEGORY_LABELS[cat], items });
      }
    }
    const uncategorized = buckets.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({ category: null, label: UNCATEGORIZED_LABEL, items: uncategorized });
    }
    return result;
  }, [secrets]);

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
      `/api/projects/${slug}/${env}/secrets/${encodeURIComponent(key)}`,
    );
    if (!res.ok) {
      setError("Impossible de révéler la valeur.");
      return;
    }
    const data = (await res.json()) as { value: string };
    setRevealed((r) => ({ ...r, [key]: data.value }));
  }

  async function remove(key: string) {
    if (!confirm(`Supprimer ${key} ?`)) return;
    const res = await fetch(
      `/api/projects/${slug}/${env}/secrets/${encodeURIComponent(key)}`,
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

  async function updateCategory(key: string, category: SecretCategory | "") {
    setError(null);
    const res = await fetch(
      `/api/projects/${slug}/${env}/secrets/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: category === "" ? null : category }),
      },
    );
    if (!res.ok) {
      setError("Changement de catégorie impossible.");
      return;
    }
    reload();
  }

  function renderRow(s: SecretListItem) {
    if (editKey === s.key && canEdit) {
      return (
        <div className="card">
          <SecretForm
            slug={slug}
            env={env}
            initialKey={s.key}
            initialCategory={s.category}
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
      );
    }
    return (
      <div className="row">
        <div className="row-icon"><RiKey2Line size={18} aria-hidden /></div>
        <div className="row-info">
          <div className="row-name code-mono">{s.key}</div>
          <div className="row-meta">
            <span className="code-mono">
              {revealed[s.key] !== undefined ? revealed[s.key] : "••••••••••••"}
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
          {canEdit && (
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
              <select
                value={s.category ?? ""}
                onChange={(e) =>
                  updateCategory(s.key, e.target.value as SecretCategory | "")
                }
                title="Changer la catégorie sans modifier la valeur"
                className="select"
                style={{ width: "auto", padding: "4px 8px", fontSize: 11 }}
              >
                <option value="">— {UNCATEGORIZED_LABEL} —</option>
                {SECRET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SECRET_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="section-header">
        <h2 className="section-title">
          Secrets — <span className="code-mono">{env}</span>
        </h2>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-primary btn-sm"
          >
            + Ajouter un secret
          </button>
        )}
      </div>

      {adding && canEdit && (
        <div className="create-card">
          <SecretForm
            slug={slug}
            env={env}
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
          <div className="empty-state-title">Aucun secret</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <section
              key={group.category ?? "_none"}
              className="flex flex-col gap-1.5"
            >
              <div className="cat-header">
                <span>{group.label}</span>
                <span className="cat-count">({group.items.length})</span>
              </div>
              <div className="row-list">
                {group.items.map((s) => (
                  <div key={s.key}>{renderRow(s)}</div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SecretForm({
  slug,
  env,
  initialKey,
  initialCategory,
  onCancel,
  onSaved,
}: {
  slug: string;
  env: string;
  initialKey?: string;
  initialCategory?: SecretCategory | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(initialKey ?? "");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState<SecretCategory | "">(
    initialCategory ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initialKey);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${slug}/${env}/secrets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          value,
          category: category === "" ? null : category,
        }),
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
            placeholder="DATABASE_URL"
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
      <div className="form-row" style={{ marginTop: 8 }}>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Catégorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SecretCategory | "")}
            className="select"
          >
            <option value="">— {UNCATEGORIZED_LABEL} —</option>
            {SECRET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SECRET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
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
