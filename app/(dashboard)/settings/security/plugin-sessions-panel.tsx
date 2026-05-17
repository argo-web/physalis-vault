"use client";

import { useCallback, useEffect, useState } from "react";
import { RiPlugLine, RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";

const PAGE_SIZE = 5;

type PluginToken = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  userAgent: string | null;
  isActive: boolean;
};

export default function PluginSessionsPanel() {
  const [tokens, setTokens] = useState<PluginToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/plugin/tokens");
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { tokens: PluginToken[] };
    setTokens(data.tokens);
    setPage(0);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function revoke(id: string) {
    if (!confirm("Révoquer cette session plugin ?")) return;
    const res = await fetch(`/api/plugin/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Révocation impossible.");
      return;
    }
    reload();
  }

  const totalPages = tokens ? Math.ceil(tokens.length / PAGE_SIZE) : 0;
  const pageTokens = tokens ? tokens.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Sessions plugin actives</h2>
      <p className="settings-section-desc">
        Sessions ouvertes par l&apos;extension navigateur Physalis. Une
        session dure 4 heures par défaut. À expiration, l&apos;extension demande
        à nouveau le code TOTP. Tu peux révoquer manuellement n&apos;importe
        quelle session (par exemple si tu changes de poste ou perds un
        appareil).
      </p>

      {error && <p className="error-text">{error}</p>}

      {tokens === null ? (
        <p className="help">Chargement…</p>
      ) : tokens.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div>Aucune session plugin pour l&apos;instant.</div>
        </div>
      ) : (
        <>
          <div className="row-list">
            {pageTokens.map((t) => {
              const status = t.isActive
                ? "active"
                : t.revokedAt
                  ? "révoquée"
                  : "expirée";
              const badgeClass = t.isActive
                ? "badge success"
                : t.revokedAt
                  ? "badge danger"
                  : "badge";
              return (
                <div key={t.id} className="row">
                  <div className="row-icon"><RiPlugLine size={18} aria-hidden /></div>
                  <div className="row-info">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={badgeClass}>{status}</span>
                      {t.userAgent && (
                        <span className="row-name" style={{ fontSize: 13 }}>
                          {t.userAgent}
                        </span>
                      )}
                    </div>
                    <div className="row-meta code-mono">
                      Créée : {new Date(t.createdAt).toLocaleString()}
                      {" · "}Expire : {new Date(t.expiresAt).toLocaleString()}
                      {t.lastUsedAt && (
                        <>
                          {" · "}Dernière utilisation :{" "}
                          {new Date(t.lastUsedAt).toLocaleString()}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="row-actions">
                    {t.isActive && (
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
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              <span>{tokens.length} session{tokens.length > 1 ? "s" : ""} · page {page + 1}/{totalPages}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-ghost btn-xs"
                  aria-label="Page précédente"
                >
                  <RiArrowLeftSLine size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="btn btn-ghost btn-xs"
                  aria-label="Page suivante"
                >
                  <RiArrowRightSLine size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
