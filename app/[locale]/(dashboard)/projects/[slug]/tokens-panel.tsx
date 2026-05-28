"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { ProjectRole } from "@prisma/client";
import { RiShieldKeyholeLine } from "@remixicon/react";

type TokenItem = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  environment: { name: string };
};

const ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export default function TokensPanel({
  slug,
  env,
  role,
}: {
  slug: string;
  env: string;
  role: ProjectRole;
}) {
  const [tokens, setTokens] = useState<TokenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/tokens?project=${slug}&env=${encodeURIComponent(env)}`,
    );
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { tokens: TokenItem[] };
    setTokens(data.tokens);
  }, [slug, env]);

  useEffect(() => {
    setTokens(null);
    setIssuedToken(null);
    setCreating(false);
    reload();
  }, [reload]);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: slug, environment: env, name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Création impossible.");
        return;
      }
      const data = (await res.json()) as { token: string };
      setIssuedToken(data.token);
      setCreating(false);
      setName("");
      reload();
    });
  }

  async function revoke(id: string) {
    if (!confirm("Révoquer ce token ?")) return;
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Révocation impossible.");
      return;
    }
    reload();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="section-header">
        <h2 className="section-title">
          Machine tokens — <span className="code-mono">{env}</span>
        </h2>
        {canEdit && !creating && !issuedToken && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn btn-primary btn-sm"
          >
            + Nouveau token
          </button>
        )}
      </div>

      {issuedToken && (
        <div
          className="settings-section"
          style={{
            background: "var(--accent-bg)",
            borderColor: "var(--accent-soft)",
          }}
        >
          <p className="settings-section-title">
            Ce token ne sera affiché qu’une seule fois. Copiez-le maintenant.
          </p>
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <code
              className="code-mono"
              style={{
                flex: 1,
                padding: 10,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                wordBreak: "break-all",
              }}
            >
              {issuedToken}
            </code>
            <button
              type="button"
              onClick={() => copy(issuedToken)}
              className="btn btn-primary btn-sm"
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIssuedToken(null)}
            className="btn btn-ghost btn-xs"
            style={{ marginTop: 10 }}
          >
            J’ai sauvegardé le token
          </button>
        </div>
      )}

      {creating && canEdit && (
        <div className="create-card">
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Nom du token</label>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`VPS Ginko — ${env}`}
                className="input"
              />
            </div>
            {error && (
              <p className="error-text" style={{ marginTop: 8 }}>
                {error}
              </p>
            )}
            <div
              className="flex items-center gap-2"
              style={{ marginTop: 10 }}
            >
              <button
                type="submit"
                disabled={pending || name.trim().length === 0}
                className="btn btn-primary btn-sm"
              >
                {pending ? "Création..." : "Créer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setName("");
                  setError(null);
                }}
                className="btn btn-ghost btn-sm"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {error && !creating && <p className="error-text">{error}</p>}

      {tokens === null ? (
        <p className="help">Chargement…</p>
      ) : tokens.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            Aucun token pour cet environnement
          </div>
        </div>
      ) : (
        <div className="row-list">
          {tokens.map((t) => (
            <div key={t.id} className="row">
              <div className="row-icon"><RiShieldKeyholeLine size={18} aria-hidden /></div>
              <div className="row-info">
                <div className="row-name">
                  {t.name}{" "}
                  {t.revokedAt && (
                    <span className="badge danger" style={{ marginLeft: 6 }}>
                      révoqué
                    </span>
                  )}
                </div>
                <div className="row-meta">
                  <span>Créé le {new Date(t.createdAt).toLocaleString()}</span>
                  <span>
                    {t.lastUsedAt
                      ? `· dernière utilisation : ${new Date(t.lastUsedAt).toLocaleString()}`
                      : "· jamais utilisé"}
                  </span>
                </div>
              </div>
              <div className="row-actions">
                {canEdit && !t.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revoke(t.id)}
                    className="btn btn-danger btn-xs"
                  >
                    Révoquer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
