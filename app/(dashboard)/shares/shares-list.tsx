"use client";

import { useCallback, useEffect, useState } from "react";
import { RiShareForward2Line } from "@remixicon/react";

type Status = "active" | "consumed" | "expired" | "revoked";

type ShareItem = {
  id: string;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  viewedFromIp: string | null;
  revokedAt: string | null;
  status: Status;
};

const STATUS_LABEL: Record<Status, string> = {
  active: "Actif",
  consumed: "Consommé",
  expired: "Expiré",
  revoked: "Révoqué",
};

const STATUS_BADGE: Record<Status, string> = {
  active: "badge success",
  consumed: "badge",
  expired: "badge expired",
  revoked: "badge danger",
};

export default function SharesList() {
  const [shares, setShares] = useState<ShareItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/me/shares");
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { shares: ShareItem[] };
    setShares(data.shares);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function revoke(s: ShareItem) {
    if (!confirm(`Révoquer ce partage ?\n\n${s.title ?? "(sans titre)"}`)) {
      return;
    }
    const res = await fetch(`/api/me/shares/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Révocation impossible.");
      return;
    }
    reload();
  }

  if (error) return <p className="error-text">{error}</p>;
  if (shares === null) return <p className="help">Chargement…</p>;
  if (shares.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Aucun partage</div>
        <div>
          Clique sur « 📤 Créer un partage » en haut à droite pour créer ton
          premier lien à usage unique.
        </div>
      </div>
    );
  }

  return (
    <div className="row-list">
      {shares.map((s) => (
        <div key={s.id} className="row">
          <div className="row-icon"><RiShareForward2Line size={18} aria-hidden /></div>
          <div className="row-info">
            <div className="row-name">
              {s.title ?? <span className="text-muted">(sans titre)</span>}{" "}
              <span
                className={STATUS_BADGE[s.status]}
                style={{ marginLeft: 6 }}
              >
                {STATUS_LABEL[s.status]}
              </span>
            </div>
            <div className="row-meta">
              <span>Créé le {new Date(s.createdAt).toLocaleString()}</span>
              <span>· Expire {new Date(s.expiresAt).toLocaleString()}</span>
              {s.consumedAt && (
                <span>
                  · Consommé {new Date(s.consumedAt).toLocaleString()}
                  {s.viewedFromIp && (
                    <>
                      {" "}depuis{" "}
                      <code className="code-mono">{s.viewedFromIp}</code>
                    </>
                  )}
                </span>
              )}
              {s.revokedAt && (
                <span>· Révoqué {new Date(s.revokedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="row-actions">
            {s.status === "active" && (
              <button
                type="button"
                onClick={() => revoke(s)}
                className="btn btn-danger btn-xs"
              >
                Révoquer
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
