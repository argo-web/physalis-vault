"use client";

import { useCallback, useEffect, useState } from "react";
import SecretRequestRevealDialog from "./secret-request-reveal-dialog";

type Status =
  | "pending"
  | "received"
  | "imported"
  | "revoked"
  | "expired";

type Org = { id: string; name: string; slug: string };

type SecretRequest = {
  id: string;
  label: string;
  description: string | null;
  requestedByEmail: string;
  recipientEmail: string | null;
  organization: { name: string; slug: string };
  project: { name: string; slug: string } | null;
  environmentName: string | null;
  secretKey: string | null;
  submittedAt: string | null;
  viewedAt: string | null;
  importedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  createdAt: string;
  status: Status;
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "en attente",
  received: "reçu",
  imported: "importé",
  revoked: "révoqué",
  expired: "expiré",
};

const STATUS_ICON: Record<Status, string> = {
  pending: "⏳",
  received: "✅",
  imported: "📥",
  revoked: "❌",
  expired: "⌛",
};

const STATUS_CHIP: Record<Status, string> = {
  pending: "role-trial",
  received: "role-active",
  imported: "role-active",
  revoked: "role-cancelled",
  expired: "role-cancelled",
};

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiré";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} j`;
  if (h >= 1) return `${h} h`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m} min`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export default function SecretRequestsTab({
  refreshKey = 0,
}: {
  /** Bump cette key depuis le parent pour forcer un reload (ex: après
   *  création d'une demande via le bouton du tab-bar). */
  refreshKey?: number;
}) {
  const [requests, setRequests] = useState<SecretRequest[] | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (orgFilter) params.set("org", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/secret-requests?${params.toString()}`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as {
      requests: SecretRequest[];
      orgs: Org[];
    };
    setRequests(data.requests);
    setOrgs(data.orgs);
  }, [orgFilter, statusFilter]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  async function copyLink(id: string) {
    // On rebuild l'URL côté client (le serveur ne renvoie pas le token brut
    // dans le détail — sécurité). Pour partager le lien à nouveau il faut
    // l'avoir copié au moment de la création. Sinon : recréer une demande.
    alert(
      "Pour des raisons de sécurité, le lien complet n'est affiché qu'une seule fois (à la création). Recréez une demande pour obtenir un nouveau lien.",
    );
    void id;
  }

  async function revoke(id: string, label: string) {
    if (!confirm(`Révoquer la demande "${label}" ?`)) return;
    const res = await fetch(`/api/secret-requests/${id}`, { method: "DELETE" });
    if (res.ok) reload();
    else setError("Révocation impossible.");
  }

  const reveal = revealId ? requests?.find((r) => r.id === revealId) : null;

  return (
    <div className="flex flex-col gap-4">
      {reveal && (
        <SecretRequestRevealDialog
          requestId={reveal.id}
          label={reveal.label}
          canImport={Boolean(
            reveal.environmentName &&
              reveal.secretKey &&
              reveal.project &&
              !reveal.importedAt,
          )}
          envName={reveal.environmentName}
          secretKey={reveal.secretKey}
          onClose={() => setRevealId(null)}
          onChanged={() => reload()}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="select"
          style={{ maxWidth: 200 }}
        >
          <option value="">Toutes les orgs</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.slug}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select"
          style={{ maxWidth: 200 }}
        >
          <option value="">Tous statuts</option>
          <option value="pending">En attente</option>
          <option value="received">Reçu</option>
          <option value="imported">Importé</option>
          <option value="revoked">Révoqué</option>
          <option value="expired">Expiré</option>
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {requests === null ? (
        <p className="help">Chargement…</p>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucune demande externe</div>
          <p className="help" style={{ marginTop: 6 }}>
            Cliquez sur « Autoriser un partage externe » pour générer un lien
            à transmettre à un tiers.
          </p>
        </div>
      ) : (
        <div className="row-list">
          {requests.map((r) => (
            <div key={r.id} className="row" id={`req-${r.id}`}>
              <div className="row-icon" title={STATUS_LABEL[r.status]}>
                {STATUS_ICON[r.status]}
              </div>
              <div className="row-info">
                <div
                  className="row-name"
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    whiteSpace: "normal",
                  }}
                >
                  <span>{r.label}</span>
                  <span className={`role ${STATUS_CHIP[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="row-meta">
                  <span>{r.organization.name}</span>
                  {r.project && <span>· {r.project.name}</span>}
                  {r.environmentName && r.secretKey && (
                    <span>
                      · cible <code className="code-mono">{r.environmentName}/{r.secretKey}</code>
                    </span>
                  )}
                  <span>· demandé par {r.requestedByEmail}</span>
                </div>
                <div
                  className="row-meta"
                  style={{ marginTop: 2, fontSize: 12 }}
                >
                  {r.status === "pending" && (
                    <span>expire dans {timeUntil(r.expiresAt)}</span>
                  )}
                  {r.status === "received" && r.submittedAt && (
                    <span>reçu {timeAgo(r.submittedAt)}</span>
                  )}
                  {r.status === "imported" && r.importedAt && (
                    <span>importé {timeAgo(r.importedAt)}</span>
                  )}
                  {r.status === "revoked" && r.revokedAt && (
                    <span>révoqué {timeAgo(r.revokedAt)}</span>
                  )}
                  {r.status === "expired" && (
                    <span>expiré {timeAgo(r.expiresAt)}</span>
                  )}
                </div>
              </div>
              <div className="row-actions">
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => copyLink(r.id)}
                    className="btn btn-ghost btn-xs"
                    title="Le lien complet n'est dispo qu'à la création (sécurité)"
                  >
                    ⓘ Lien
                  </button>
                )}
                {(r.status === "received" || r.status === "imported") && (
                  <button
                    type="button"
                    onClick={() => setRevealId(r.id)}
                    className="btn btn-ghost btn-xs"
                  >
                    Révéler
                  </button>
                )}
                {r.status !== "revoked" && r.status !== "imported" && (
                  <button
                    type="button"
                    onClick={() => revoke(r.id, r.label)}
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
