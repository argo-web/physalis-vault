"use client";

// Phase 11a — UI gestion des UserToken.
//
// Tokens user-scoped pour intégrations N8n / Make / scripts (READ only V1).
// Affichés dans /settings/security à côté des sessions plugin.
//
// UX :
//   - Liste les tokens actifs/révoqués (préfixe + nom + dates)
//   - Création via dialog : nom (req) + expiration optionnelle (1-365j)
//   - Token brut affiché UNE SEULE FOIS après création — copy button
//   - Révocation soft via clic (confirmation native)

import { useCallback, useEffect, useState, useTransition } from "react";
import { RiKey2Line } from "@remixicon/react";

type UserToken = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const EXPIRY_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: "Jamais", days: null },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "1 an (365 j)", days: 365 },
];

export default function UserTokensPanel() {
  const [tokens, setTokens] = useState<UserToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{
    token: string;
    name: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/user-tokens");
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { tokens: UserToken[] };
    setTokens(data.tokens);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function revoke(t: UserToken) {
    if (!confirm(`Révoquer le token « ${t.name} » ? Toutes les intégrations qui l'utilisent vont arrêter de fonctionner.`)) {
      return;
    }
    const res = await fetch(`/api/user-tokens/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Révocation impossible.");
      return;
    }
    reload();
  }

  function isActive(t: UserToken): boolean {
    if (t.revokedAt) return false;
    if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return false;
    return true;
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Tokens d&apos;intégration</h2>
      <p className="settings-section-desc">
        Tokens Bearer scopés à ton compte, à utiliser dans des workflows
        N8n / Make ou des scripts custom. Donnent accès en{" "}
        <strong>lecture</strong> aux secrets, services et comptes des projets
        dont tu es membre. Différents des{" "}
        <em>machine tokens</em> (scopés à un projet+env précis dans les
        paramètres d&apos;un projet).
      </p>

      {error && <p className="error-text">{error}</p>}

      {justCreated && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            background: "rgba(34, 197, 94, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
          }}
        >
          <div className="row-name" style={{ marginBottom: 6 }}>
            ✓ Token « {justCreated.name} » créé
          </div>
          <p className="help" style={{ marginBottom: 8 }}>
            Copie ce token <strong>maintenant</strong>. Il ne sera plus
            jamais affiché ensuite.
          </p>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <code
              className="code-mono"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "var(--surface-hover, rgba(0,0,0,0.2))",
                borderRadius: 4,
                wordBreak: "break-all",
                fontSize: 12,
              }}
            >
              {justCreated.token}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(justCreated.token).catch(() => null);
              }}
              className="btn btn-primary btn-sm"
            >
              Copier
            </button>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="btn btn-ghost btn-sm"
              title="J'ai bien copié le token"
            >
              ✓ Fait
            </button>
          </div>
        </div>
      )}

      {!creating && !justCreated && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn btn-primary btn-sm"
          >
            + Créer un token
          </button>
        </div>
      )}

      {creating && (
        <CreateForm
          onCancel={() => setCreating(false)}
          onCreated={(token, name) => {
            setCreating(false);
            setJustCreated({ token, name });
            reload();
          }}
        />
      )}

      {tokens === null ? (
        <p className="help">Chargement…</p>
      ) : tokens.length === 0 ? (
        <p className="help">Aucun token. Crée-en un pour intégrer un workflow N8n / Make.</p>
      ) : (
        <div className="row-list">
          {tokens.map((t) => {
            const active = isActive(t);
            return (
              <div key={t.id} className="row" style={{ opacity: active ? 1 : 0.55 }}>
                <div className="row-icon"><RiKey2Line size={18} aria-hidden /></div>
                <div className="row-info">
                  <div className="row-name">
                    {t.name}{" "}
                    <code className="code-mono" style={{ fontSize: 11, marginLeft: 6 }}>
                      {t.prefix}…
                    </code>
                    {!active && (
                      <span
                        className="chip"
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: "rgba(239, 68, 68, 0.15)",
                          color: "#ef4444",
                        }}
                      >
                        {t.revokedAt ? "révoqué" : "expiré"}
                      </span>
                    )}
                  </div>
                  <div className="row-meta">
                    <span title={new Date(t.createdAt).toLocaleString()}>
                      Créé {relativeTime(t.createdAt)}
                    </span>
                    {t.lastUsedAt && (
                      <span title={new Date(t.lastUsedAt).toLocaleString()}>
                        · Dernier usage {relativeTime(t.lastUsedAt)}
                      </span>
                    )}
                    {t.expiresAt && (
                      <span title={new Date(t.expiresAt).toLocaleString()}>
                        · Expire {relativeTime(t.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                {active && (
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => revoke(t)}
                      className="btn btn-danger btn-xs"
                    >
                      Révoquer
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (token: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/user-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), expiresInDays }),
      });
      const data = (await res.json().catch(() => null)) as
        | { token?: string; error?: string }
        | null;
      if (!res.ok || !data?.token) {
        setError(data?.error ?? "Création impossible.");
        return;
      }
      onCreated(data.token, name.trim());
    });
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div className="form-row">
        <div className="field" style={{ minWidth: 240, flex: 1 }}>
          <label>Nom *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="N8n Voyages workflows"
            className="input"
            disabled={pending}
            required
          />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Expiration</label>
          <select
            value={expiresInDays === null ? "never" : String(expiresInDays)}
            onChange={(e) =>
              setExpiresInDays(
                e.target.value === "never" ? null : Number(e.target.value),
              )
            }
            className="select"
            disabled={pending}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.label} value={o.days === null ? "never" : String(o.days)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Création…" : "Créer le token"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
          disabled={pending}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const sec = Math.floor(abs / 1000);
  if (sec < 60) return future ? "dans quelques sec" : "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return future ? `dans ${min} min` : `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return future ? `dans ${hr} h` : `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return future ? `dans ${day} j` : `il y a ${day} j`;
  const month = Math.floor(day / 30);
  if (month < 12) return future ? `dans ${month} mois` : `il y a ${month} mois`;
  const year = Math.floor(day / 365);
  return future ? `dans ${year} an${year > 1 ? "s" : ""}` : `il y a ${year} an${year > 1 ? "s" : ""}`;
}
