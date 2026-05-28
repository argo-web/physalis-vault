"use client";

import { useEffect, useState, useTransition } from "react";
import { RiSaveLine } from "@remixicon/react";

type Org = { id: string; name: string; slug: string };
type Project = { id: string; name: string; slug: string };

export default function SecretRequestCreateDialog({
  orgs,
  onClose,
  onCreated,
}: {
  orgs: Org[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [environmentName, setEnvironmentName] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{
    requestUrl: string;
    privateKey: string;
    label: string;
  } | null>(null);
  const [savingToVault, setSavingToVault] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);

  // Charge les projets de l'org sélectionnée.
  useEffect(() => {
    if (!orgId) {
      setProjects([]);
      return;
    }
    const slug = orgs.find((o) => o.id === orgId)?.slug;
    if (!slug) return;
    fetch(`/api/projects?org=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { projects?: Project[] } | null) => {
        setProjects(data?.projects ?? []);
        setProjectId("");
      })
      .catch(() => setProjects([]));
  }, [orgId, orgs]);

  // Esc → fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/secret-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label,
          description: description || undefined,
          organizationId: orgId,
          projectId: projectId || undefined,
          environmentName: environmentName || undefined,
          secretKey: secretKey || undefined,
          recipientEmail: recipientEmail || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Création impossible.");
        return;
      }
      const data = (await res.json()) as {
        id: string;
        requestUrl: string;
        privateKey: string;
      };
      setCreated({
        requestUrl: data.requestUrl,
        privateKey: data.privateKey,
        label,
      });
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  async function saveToVault() {
    if (!created) return;
    setSavingToVault(true);
    try {
      const res = await fetch("/api/vault/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Clé privée — ${created.label}`,
          password: created.privateKey,
          tags: ["secret-request", "ecdh-key"],
        }),
      });
      if (res.ok) setSavedToVault(true);
    } finally {
      setSavingToVault(false);
    }
  }

  function done() {
    setCreated(null);
    onCreated();
    onClose();
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560 }}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">
            {created ? "Demande créée" : "Autoriser un partage externe"}
          </h2>
          <button
            type="button"
            onClick={created ? done : onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          {created ? (
            <>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--accent-bg)",
                  fontSize: 13,
                }}
              >
                <strong>⚠️ Sauvegardez cette clé privée.</strong> Elle ne sera
                plus jamais affichée. Sans elle vous ne pourrez pas déchiffrer
                le secret reçu.
              </div>
              <div className="field">
                <label>Lien à transmettre au destinataire</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    readOnly
                    value={created.requestUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input input-mono"
                    style={{ fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => copy(created.requestUrl)}
                    className="btn btn-ghost btn-sm"
                  >
                    Copier
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Clé privée (à conserver)</label>
                <textarea
                  readOnly
                  rows={4}
                  value={created.privateKey}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input input-mono"
                  style={{ fontSize: 11, resize: "vertical" }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => copy(created.privateKey)}
                    className="btn btn-ghost btn-sm"
                  >
                    Copier la clé
                  </button>
                  <button
                    type="button"
                    onClick={saveToVault}
                    disabled={savingToVault || savedToVault}
                    className="btn btn-primary btn-sm"
                  >
                    {savedToVault
                      ? "✓ Sauvegardée dans mon coffre"
                      : savingToVault
                        ? "Sauvegarde…"
                        : (
                          <>
                            <RiSaveLine size={14} aria-hidden /> Sauvegarder dans mon coffre
                          </>
                        )}
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  onClick={done}
                  className="btn btn-primary"
                >
                  Terminé
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="field">
                <label>Label *</label>
                <input
                  required
                  autoFocus
                  maxLength={200}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Clé API Stripe production"
                  className="input"
                />
              </div>

              <div className="field">
                <label>Description (optionnelle)</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Merci de coller votre clé sk_live_..."
                  className="input"
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className="field">
                <label>Email du destinataire (optionnel)</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@exemple.com"
                  className="input"
                />
                <div className="help" style={{ marginTop: 4, fontSize: 12 }}>
                  Si rempli, un email avec le lien est envoyé automatiquement.
                  Sinon copie manuelle après création.
                </div>
              </div>

              <div className="form-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Organisation *</label>
                  <select
                    required
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    className="select"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Projet (optionnel)</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="select"
                  >
                    <option value="">— Aucun —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {projectId && (
                <div className="form-row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>Environnement (pour import auto)</label>
                    <input
                      maxLength={100}
                      value={environmentName}
                      onChange={(e) => setEnvironmentName(e.target.value)}
                      placeholder="production"
                      className="input"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Clé .env</label>
                    <input
                      value={secretKey}
                      onChange={(e) =>
                        setSecretKey(e.target.value.toUpperCase())
                      }
                      placeholder="STRIPE_SECRET_KEY"
                      className="input input-mono"
                    />
                  </div>
                </div>
              )}

              {error && <p className="error-text">{error}</p>}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending || !label || !orgId}
                  className="btn btn-primary btn-sm"
                >
                  {pending ? "Création…" : "Créer la demande"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
