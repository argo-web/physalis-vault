"use client";

// Phase 11c — UI gestion des OrgToken (tokens org-level pour N8n / Make).
//
// Réservé OrgADMIN+ (côté serveur via requireOrgMember("ADMIN")).
//
// Sécurité par défaut :
//   - Nouveau token sans projet sélectionné → bouton désactivé
//   - Checkbox "Tous les projets actuels et futurs" avec confirm dialog
//   - Token brut affiché UNE SEULE FOIS après création

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { RiKey2Line } from "@remixicon/react";

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  PROJECTS_LIST: {
    label: "Lister les projets",
    description: "Nécessaire pour le chargement dynamique du nœud N8n.",
  },
  SECRETS_READ: {
    label: "Lire les secrets",
    description: "Valeurs déchiffrées des secrets d'environnement.",
  },
  SERVICES_READ: {
    label: "Lire les services",
    description: "Identifiants des services externes (Stripe, Firebase…).",
  },
  ACCOUNTS_READ: {
    label: "Lire les comptes applicatifs",
    description: "Identifiants des comptes de test / admin.",
  },
};

const SCOPE_ORDER = ["PROJECTS_LIST", "SECRETS_READ", "SERVICES_READ", "ACCOUNTS_READ"] as const;
type Scope = (typeof SCOPE_ORDER)[number];

const EXPIRY_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: "Jamais", days: null },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "1 an (365 j)", days: 365 },
];

type ProjectOption = { id: string; slug: string; name: string };

type OrgToken = {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  allProjects: boolean;
  allowedProjectIds: string[];
  allowedScopes: Scope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByEmail: string | null;
};

type AccessLevel = "admin" | "dev" | "denied";

type DevConstraints = {
  maxExpiresInDays: number;
  maxActiveTokensPerUser: number;
};

export default function OrgTokensPanel({ slug }: { slug: string }) {
  const [tokens, setTokens] = useState<OrgToken[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("dev");
  const [devConstraints, setDevConstraints] = useState<DevConstraints | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{
    token: string;
    name: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/orgs/${slug}/org-tokens`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as {
      tokens: OrgToken[];
      accessLevel: AccessLevel;
      devConstraints: DevConstraints | null;
    };
    setTokens(data.tokens);
    setAccessLevel(data.accessLevel);
    setDevConstraints(data.devConstraints);
  }, [slug]);

  // Charge la liste des projets de l'org pour le selector. Endpoint
  // session-based (pas integrations) : retourne tous les projets de l'org
  // visibles par l'OrgADMIN courant.
  const loadProjects = useCallback(async () => {
    const res = await fetch(`/api/orgs/${slug}/projects`);
    if (!res.ok) return;
    const data = (await res.json()) as { projects: ProjectOption[] };
    setProjects(data.projects);
  }, [slug]);

  useEffect(() => {
    reload();
    loadProjects();
  }, [reload, loadProjects]);

  async function regenerate(t: OrgToken) {
    if (
      !confirm(
        `Régénérer le token « ${t.name} » ?\n\nLe secret actuel sera immédiatement invalidé. Mets à jour tes intégrations (N8n, scripts) avec la nouvelle valeur.\n\nLes scopes, projets et expiration sont conservés.`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/orgs/${slug}/org-tokens/${t.id}/regenerate`,
      { method: "POST" },
    );
    const data = (await res.json().catch(() => null)) as
      | { token?: string; error?: string }
      | null;
    if (!res.ok || !data?.token) {
      setError(data?.error ?? "Régénération impossible.");
      return;
    }
    setJustCreated({ token: data.token, name: t.name });
    reload();
  }

  async function revoke(t: OrgToken) {
    if (
      !confirm(
        `Révoquer le token « ${t.name} » ? Toutes les intégrations qui l'utilisent vont arrêter de fonctionner.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/orgs/${slug}/org-tokens/${t.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Révocation impossible.");
      return;
    }
    reload();
  }

  function isActive(t: OrgToken): boolean {
    if (t.revokedAt) return false;
    if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return false;
    return true;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="section-header">
        <div>
          <h2 className="section-title">Tokens d&apos;intégration</h2>
          <p className="help" style={{ marginTop: 4 }}>
            Tokens Bearer scopés à l&apos;organisation, pour intégrations N8n /
            Make / scripts. Différents des{" "}
            <em>tokens utilisateur</em> (Settings → Sécurité) car ils
            survivent au départ du créateur. <strong>Lecture seule</strong> en
            V1. Les <em>secrets globaux de l&apos;org</em> (GITHUB_DISPATCH_TOKEN
            etc.) ne sont jamais accessibles via ces tokens — par design.
          </p>
          {accessLevel === "dev" && devConstraints && (
            <p
              className="help"
              style={{
                marginTop: 6,
                fontSize: 11,
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                padding: "6px 10px",
                borderRadius: 4,
              }}
            >
              ℹ️ Mode <strong>DEV</strong> : tu peux créer tes propres tokens
              avec restrictions automatiques — projets limités à ceux dont tu
              es membre, expiration obligatoire ≤{" "}
              {devConstraints.maxExpiresInDays} jours, max{" "}
              {devConstraints.maxActiveTokensPerUser} tokens actifs. Tu vois
              uniquement tes propres tokens. Les ADMIN voient tous les tokens
              de l&apos;org.
            </p>
          )}
        </div>
        {!creating && !justCreated && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn btn-primary btn-sm"
          >
            + Nouveau token
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {justCreated && (
        <JustCreatedBanner
          token={justCreated.token}
          name={justCreated.name}
          onClose={() => setJustCreated(null)}
        />
      )}

      {creating && (
        <CreateForm
          slug={slug}
          projects={projects ?? []}
          accessLevel={accessLevel}
          devConstraints={devConstraints}
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
        <div className="empty-state">
          <div className="empty-state-title">Aucun token</div>
          <div>
            Crée un token pour permettre à N8n / Make / des scripts d&apos;accéder
            aux credentials de l&apos;organisation.
          </div>
        </div>
      ) : (
        <div className="row-list">
          {tokens.map((t) => {
            const active = isActive(t);
            const projectCount = t.allProjects
              ? "tous les projets"
              : `${t.allowedProjectIds.length} projet${t.allowedProjectIds.length === 1 ? "" : "s"}`;
            return (
              <div key={t.id} className="row" style={{ opacity: active ? 1 : 0.55 }}>
                <div className="row-icon"><RiKey2Line size={18} aria-hidden /></div>
                <div className="row-info">
                  <div className="row-name">
                    {t.name}
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
                    {t.allProjects && (
                      <span
                        className="chip"
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: "rgba(249, 115, 22, 0.15)",
                          color: "#f97316",
                        }}
                        title="Accès à tous les projets actuels et futurs"
                      >
                        ⚠ tous les projets
                      </span>
                    )}
                  </div>
                  <div className="row-meta">
                    <span>{projectCount}</span>
                    <span>· {t.allowedScopes.length} scope{t.allowedScopes.length === 1 ? "" : "s"}</span>
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
                    {t.createdByEmail && (
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        · créé par {t.createdByEmail}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <div className="row-meta" style={{ marginTop: 2 }}>
                      <span className="help" style={{ fontSize: 11 }}>{t.description}</span>
                    </div>
                  )}
                  {t.allowedScopes.length > 0 && (
                    <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
                      {t.allowedScopes.map((s) => (
                        <span key={s} className="chip" style={{ fontSize: 10 }}>
                          {SCOPE_LABELS[s]?.label ?? s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {active && (
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => regenerate(t)}
                      className="btn btn-ghost btn-xs"
                      title="Génère un nouveau secret pour ce token (mêmes scopes/projets, ancien invalidé)"
                    >
                      Régénérer
                    </button>
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
  slug,
  projects,
  accessLevel,
  devConstraints,
  onCancel,
  onCreated,
}: {
  slug: string;
  projects: ProjectOption[];
  accessLevel: AccessLevel;
  devConstraints: DevConstraints | null;
  onCancel: () => void;
  onCreated: (token: string, name: string) => void;
}) {
  const isDev = accessLevel === "dev";
  // Pour DEV : pas d'option "Jamais", limite à devConstraints.maxExpiresInDays.
  const expiryOptions = isDev && devConstraints
    ? EXPIRY_OPTIONS.filter(
        (o) => o.days !== null && o.days <= devConstraints.maxExpiresInDays,
      )
    : EXPIRY_OPTIONS;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(["PROJECTS_LIST"]));
  const [allProjects, setAllProjects] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [expiresInDays, setExpiresInDays] = useState<number | null>(
    isDev && devConstraints ? Math.min(90, devConstraints.maxExpiresInDays) : 365,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleScope(s: Scope) {
    const next = new Set(scopes);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setScopes(next);
  }

  function toggleProject(id: string) {
    const next = new Set(selectedProjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjects(next);
  }

  function handleAllProjectsToggle(checked: boolean) {
    if (checked) {
      const ok = confirm(
        "Activer « tous les projets actuels et futurs » donne accès à tous les projets de l'organisation, y compris ceux créés ultérieurement. À utiliser avec précaution.\n\nConfirmer ?",
      );
      if (!ok) return;
    }
    setAllProjects(checked);
  }

  const canSubmit =
    name.trim().length > 0 &&
    scopes.size > 0 &&
    (allProjects || selectedProjects.size > 0) &&
    !pending;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}/org-tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          scopes: Array.from(scopes),
          allProjects,
          allowedProjectIds: allProjects ? [] : Array.from(selectedProjects),
          expiresInDays,
        }),
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
    <form onSubmit={submit} className="card" style={{ padding: 16 }}>
      <h3 className="section-title" style={{ fontSize: 14, marginBottom: 12 }}>
        Nouveau token d&apos;intégration
      </h3>

      <div className="form-row">
        <div className="field" style={{ minWidth: 240, flex: 1 }}>
          <label>Nom *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="N8n - Argoweb prod"
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
              setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))
            }
            className="select"
            disabled={pending}
          >
            {expiryOptions.map((o) => (
              <option key={o.label} value={o.days === null ? "never" : String(o.days)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>Description (optionnelle)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ex : Workflow de synchro Voyages → Mailgun"
          className="input"
          disabled={pending}
        />
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Scopes autorisés *</label>
        <div className="flex flex-col gap-1.5" style={{ marginTop: 4 }}>
          {SCOPE_ORDER.map((s) => (
            <label
              key={s}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={scopes.has(s)}
                onChange={() => toggleScope(s)}
                disabled={pending}
                style={{ marginTop: 3, cursor: "pointer" }}
              />
              <div>
                <div>{SCOPE_LABELS[s].label}</div>
                <div className="help" style={{ fontSize: 11 }}>
                  {SCOPE_LABELS[s].description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Projets autorisés *</label>
        <div className="help" style={{ fontSize: 11, marginBottom: 6 }}>
          Sélectionne uniquement les projets nécessaires. Recommandé pour le
          principe du moindre privilège.
        </div>
        {projects.length === 0 ? (
          <p className="help">Aucun projet dans cette organisation.</p>
        ) : (
          <div
            className="flex flex-col gap-1"
            style={{
              maxHeight: 200,
              overflowY: "auto",
              padding: 6,
              border: "1px solid var(--border, rgba(255,255,255,0.1))",
              borderRadius: 4,
              opacity: allProjects ? 0.4 : 1,
            }}
          >
            {projects.map((p) => (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: allProjects ? "not-allowed" : "pointer",
                  fontSize: 13,
                  padding: "2px 4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedProjects.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  disabled={pending || allProjects}
                  style={{ cursor: "inherit" }}
                />
                <span>{p.name}</span>
                <code className="code-mono text-muted" style={{ fontSize: 11 }}>
                  {p.slug}
                </code>
              </label>
            ))}
          </div>
        )}
        {!isDev && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              cursor: "pointer",
              fontSize: 13,
              color: allProjects ? "#f97316" : "inherit",
            }}
          >
            <input
              type="checkbox"
              checked={allProjects}
              onChange={(e) => handleAllProjectsToggle(e.target.checked)}
              disabled={pending}
              style={{ cursor: "pointer" }}
            />
            <span>
              ⚠ Tous les projets <strong>actuels et futurs</strong> de l&apos;organisation
            </span>
          </label>
        )}
        {isDev && (
          <p className="help" style={{ fontSize: 11, marginTop: 8 }}>
            ℹ️ La case « tous les projets » est réservée aux ADMIN. Tu peux
            uniquement sélectionner des projets dont tu es membre.
          </p>
        )}
      </div>

      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}

      <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
        <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-sm">
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

function JustCreatedBanner({
  token,
  name,
  onClose,
}: {
  token: string;
  name: string;
  onClose: () => void;
}) {
  const [savedToVault, setSavedToVault] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  async function saveToVault() {
    setSavedToVault("saving");
    const res = await fetch("/api/vault/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `OrgToken: ${name}`,
        username: null,
        password: token,
        tags: ["physalis-token", "n8n"],
      }),
    });
    setSavedToVault(res.ok ? "saved" : "error");
  }

  return (
    <div
      className="card"
      style={{
        padding: 14,
        background: "rgba(34, 197, 94, 0.08)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
      }}
    >
      <div className="row-name" style={{ marginBottom: 6 }}>
        ✓ Token « {name} » créé
      </div>
      <p className="help" style={{ marginBottom: 8 }}>
        Copie ce token <strong>maintenant</strong>. Il ne sera plus jamais
        affiché ensuite (tu pourras le <strong>régénérer</strong> via le
        bouton sur la liste si besoin).
      </p>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
          {token}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(token).catch(() => null);
          }}
          className="btn btn-primary btn-sm"
        >
          Copier
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-sm"
        >
          ✓ Fait
        </button>
      </div>
      <div
        className="flex items-center gap-2"
        style={{ marginTop: 8, flexWrap: "wrap" }}
      >
        <button
          type="button"
          onClick={saveToVault}
          disabled={savedToVault === "saving" || savedToVault === "saved"}
          className="btn btn-ghost btn-xs"
          title="Crée une entrée dans ton coffre personnel avec ce token comme mot de passe. Tu peux ensuite la déplacer dans une collection d'équipe pour la partager."
        >
          {savedToVault === "saved"
            ? "✓ Sauvegardé dans ton coffre"
            : savedToVault === "saving"
              ? "Sauvegarde…"
              : savedToVault === "error"
                ? "Erreur — réessayer"
                : "💾 Sauvegarder dans mon coffre perso"}
        </button>
        {savedToVault === "saved" && (
          <span className="help" style={{ fontSize: 11 }}>
            Visible dans <Link href="/vault" className="text-accent">ton coffre</Link>{" "}
            sous « OrgToken: {name} ».
          </span>
        )}
      </div>
      <p className="help" style={{ marginTop: 10, fontSize: 11 }}>
        Configuration N8n : <code className="code-mono">Vault URL</code> = ton
        instance Physalis,{" "}
        <code className="code-mono">Token</code> = ce token.
      </p>
    </div>
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
  return future
    ? `dans ${year} an${year > 1 ? "s" : ""}`
    : `il y a ${year} an${year > 1 ? "s" : ""}`;
}
