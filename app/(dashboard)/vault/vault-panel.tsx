"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RiShuffleLine } from "@remixicon/react";
import { generatePassword } from "@/lib/generate-password";

type VaultEntryListItem = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  tags: string[];
  favorite: boolean;
  hasTotpSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function VaultPanel() {
  const [entries, setEntries] = useState<VaultEntryListItem[] | null>(null);
  const [allTagsList, setAllTagsList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editing, setEditing] = useState<VaultEntryListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<VaultEntryListItem | null>(null);

  // Liste complete des tags : recalculee uniquement quand le contenu de fond
  // change (ajout/suppression/edition), pas quand l'user toggle un filtre.
  // Sinon allTagsList n'aurait que le tag courant et les autres tags
  // disparaitraient de l'UI.
  const reloadAllTags = useCallback(async () => {
    const res = await fetch("/api/vault/entries");
    if (!res.ok) return;
    const data = (await res.json()) as { entries: VaultEntryListItem[] };
    const set = new Set<string>();
    for (const e of data.entries) for (const t of e.tags) set.add(t);
    setAllTagsList(Array.from(set).sort());
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (favoritesOnly) params.set("favorite", "true");
    if (activeTag) params.set("tag", activeTag);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    const res = await fetch(`/api/vault/entries${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { entries: VaultEntryListItem[] };
    setEntries(data.entries);
  }, [favoritesOnly, activeTag, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    reloadAllTags();
  }, [reloadAllTags]);

  async function reveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed((r) => {
        const copy = { ...r };
        delete copy[id];
        return copy;
      });
      return;
    }
    const res = await fetch(`/api/vault/entries/${id}`);
    if (!res.ok) {
      setError("Impossible de révéler.");
      return;
    }
    const data = (await res.json()) as { entry: { password: string | null } };
    setRevealed((r) => ({ ...r, [id]: data.entry.password ?? "" }));
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError(`✓ ${label} copié`);
      setTimeout(() => setError(null), 1500);
    } catch {
      setError("Copie impossible.");
    }
  }

  async function copyPassword(id: string) {
    const res = await fetch(`/api/vault/entries/${id}`);
    if (!res.ok) {
      setError("Impossible de récupérer.");
      return;
    }
    const data = (await res.json()) as { entry: { password: string | null } };
    if (!data.entry.password) {
      setError("Aucun mot de passe.");
      return;
    }
    copyToClipboard(data.entry.password, "Mot de passe");
  }

  async function toggleFavorite(entry: VaultEntryListItem) {
    const res = await fetch(`/api/vault/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite: !entry.favorite }),
    });
    if (!res.ok) {
      setError("Mise à jour impossible.");
      return;
    }
    reload();
  }

  async function remove(entry: VaultEntryListItem) {
    if (!confirm(`Supprimer "${entry.name}" ?`)) return;
    const res = await fetch(`/api/vault/entries/${entry.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    setRevealed((r) => {
      const copy = { ...r };
      delete copy[entry.id];
      return copy;
    });
    reload();
    reloadAllTags();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="form-row" style={{ alignItems: "center" }}>
        <div className="field" style={{ minWidth: 220 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher (nom / url / login)"
            className="input"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`chip chip-button ${favoritesOnly ? "active" : ""}`}
          style={{ height: 40, padding: "0 12px" }}
        >
          {favoritesOnly ? "★ Favoris" : "☆ Favoris"}
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-primary"
        >
          + Ajouter
        </button>
      </div>

      {allTagsList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`chip chip-button ${
              activeTag === null ? "active chip-active" : ""
            }`}
          >
            tous
          </button>
          {allTagsList.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`chip chip-button ${
                activeTag === tag ? "active chip-active" : ""
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {error && <p className="help text-accent">{error}</p>}

      {(adding || editing) && (
        <EntryDialog
          initial={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            reload();
            reloadAllTags();
          }}
        />
      )}

      {moving && (
        <MoveDialog
          entry={moving}
          onClose={() => setMoving(null)}
          onMoved={(target) => {
            setMoving(null);
            setRevealed((r) => {
              const copy = { ...r };
              delete copy[moving.id];
              return copy;
            });
            setError(`✓ Déplacé vers ${target}`);
            setTimeout(() => setError(null), 2500);
            reload();
            reloadAllTags();
          }}
        />
      )}

      {entries === null ? (
        <p className="help">Chargement…</p>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucune entrée</div>
          <div>Clique sur « + Ajouter » pour créer ta première.</div>
        </div>
      ) : (
        <div className="row-list">
          {entries.map((e) => (
            <div key={e.id} className="row">
              <div className="row-icon">{initials(e.name)}</div>
              <div className="row-info">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(e)}
                    title={
                      e.favorite ? "Retirer des favoris" : "Ajouter aux favoris"
                    }
                    className={`star-btn ${e.favorite ? "active" : ""}`}
                  >
                    ★
                  </button>
                  <div className="row-name">
                    {e.name}
                    {e.hasTotpSecret && (
                      <span
                        className="chip"
                        style={{ marginLeft: 6, fontSize: 10 }}
                        title="Code 2FA configuré"
                      >
                        🔐 2FA
                      </span>
                    )}
                  </div>
                </div>
                <div className="row-meta">
                  {e.url && (
                    <a
                      href={
                        e.url.startsWith("http") ? e.url : `https://${e.url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {e.url}
                    </a>
                  )}
                  {e.username && (
                    <span className="code-mono">{e.username}</span>
                  )}
                  <span className="code-mono">
                    {revealed[e.id] !== undefined
                      ? revealed[e.id]
                      : "••••••••••••"}
                  </span>
                </div>
                {e.tags.length > 0 && (
                  <div
                    className="flex flex-wrap gap-1"
                    style={{ marginTop: 6 }}
                  >
                    {e.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="row-actions">
                {e.username && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(e.username!, "Login")}
                    className="btn btn-ghost btn-xs"
                  >
                    Copier login
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyPassword(e.id)}
                  className="btn btn-ghost btn-xs"
                >
                  Copier mdp
                </button>
                <button
                  type="button"
                  onClick={() => reveal(e.id)}
                  className="btn btn-ghost btn-xs"
                >
                  {revealed[e.id] !== undefined ? "Masquer" : "Afficher"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(e)}
                  className="btn btn-ghost btn-xs"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => setMoving(e)}
                  className="btn btn-ghost btn-xs"
                  title="Déplacer vers une organisation ou un projet"
                >
                  Déplacer
                </button>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="btn btn-danger btn-xs"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: VaultEntryListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [showTotpSecret, setShowTotpSecret] = useState(false);
  const [totpLoaded, setTotpLoaded] = useState(false);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [pwdLoaded, setPwdLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadCurrentSecrets() {
    if (!initial) return;
    const res = await fetch(`/api/vault/entries/${initial.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      entry: { password: string | null; totpSecret: string | null };
    };
    setPassword(data.entry.password ?? "");
    setPwdLoaded(true);
    setShowPassword(true);
    setTotpSecret(data.entry.totpSecret ?? "");
    setTotpLoaded(true);
  }

  function generate() {
    setPassword(generatePassword(24));
    setShowPassword(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = {
        name,
        url: url.trim() || null,
        username: username.trim() || null,
        tags,
        favorite,
      };
      if (!isEdit || pwdLoaded) {
        body.password = password;
      }
      if (!isEdit || totpLoaded) {
        body.totpSecret = totpSecret.trim() || null;
      }

      const url2 = isEdit
        ? `/api/vault/entries/${initial!.id}`
        : "/api/vault/entries";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url2, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            {isEdit ? "Modifier l'entrée" : "Nouvelle entrée"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="dialog-body">
            <div className="field">
              <label>Nom *</label>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gmail perso"
                className="input"
              />
            </div>
            <div className="field">
              <label>URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://gmail.com"
                className="input input-mono"
              />
            </div>
            <div className="field">
              <label>Login / Email</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gael@gmail.com"
                className="input input-mono"
              />
            </div>

            <div className="field">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <label style={{ margin: 0 }}>Mot de passe</label>
                <div className="flex items-center gap-2">
                  {isEdit && !pwdLoaded && (
                    <button
                      type="button"
                      onClick={loadCurrentSecrets}
                      className="btn btn-ghost btn-xs"
                    >
                      Charger l&apos;actuel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={generate}
                    title="Générer (24 chars base64url)"
                    className="btn btn-ghost btn-xs"
                  >
                    <RiShuffleLine size={12} aria-hidden /> Générer
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="btn btn-ghost btn-xs"
                  >
                    {showPassword ? "Masquer" : "Voir"}
                  </button>
                </div>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwdLoaded(true);
                }}
                placeholder={
                  isEdit && !pwdLoaded ? "(inchangé)" : "••••••••••••"
                }
                className="input input-mono"
              />
            </div>

            <div className="field">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <label style={{ margin: 0 }}>Code 2FA (TOTP)</label>
                <div className="flex items-center gap-2">
                  {isEdit && !totpLoaded && (
                    <button
                      type="button"
                      onClick={loadCurrentSecrets}
                      className="btn btn-ghost btn-xs"
                    >
                      Charger l&apos;actuel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTotpSecret((v) => !v)}
                    className="btn btn-ghost btn-xs"
                  >
                    {showTotpSecret ? "Masquer" : "Voir"}
                  </button>
                </div>
              </div>
              <input
                type={showTotpSecret ? "text" : "password"}
                value={totpSecret}
                onChange={(e) => {
                  setTotpSecret(e.target.value);
                  setTotpLoaded(true);
                }}
                placeholder={
                  isEdit && !totpLoaded
                    ? "(inchangé)"
                    : "Secret base32 ou otpauth://…"
                }
                className="input input-mono"
              />
              <div className="help" style={{ marginTop: 4 }}>
                Optionnel. Colle le secret base32 affiché à côté du QR code,
                ou l&apos;URL <code className="code-mono">otpauth://</code>{" "}
                complète. L&apos;extension affichera le code 6 chiffres en
                temps réel.
              </div>
            </div>

            <div className="field">
              <label>Tags</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="chip"
                    style={{ display: "inline-flex", gap: 4 }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-muted"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 12,
                      }}
                      aria-label={`Retirer le tag ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={() => addTag()}
                  placeholder="+ tag"
                  className="input"
                  style={{ width: 120, padding: "6px 10px", fontSize: 12 }}
                />
              </div>
            </div>

            <label
              className="flex items-center gap-2"
              style={{ cursor: "pointer", fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span>⭐ Favori</span>
            </label>

            {error && <p className="error-text">{error}</p>}
          </div>

          <div className="dialog-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="btn btn-primary btn-sm"
            >
              {pending ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── MoveDialog ──────────────────────────────────────────────────────────
// Dialog pour deplacer une entree perso vers une collection d'equipe (org
// ou projet). Charge l'arborescence via /api/vault/destinations a
// l'ouverture, propose deux selecteurs en cascade : scope (org | projet) →
// collection. Seules les collections EDITOR+ apparaissent.

type Destination = {
  slug: string;
  name: string;
  collections: Array<{ slug: string; name: string; role: string }>;
};

type Destinations = {
  orgs: Destination[];
  projects: Array<Destination & { orgSlug: string }>;
};

function MoveDialog({
  entry,
  onClose,
  onMoved,
}: {
  entry: VaultEntryListItem;
  onClose: () => void;
  onMoved: (targetLabel: string) => void;
}) {
  const [destinations, setDestinations] = useState<Destinations | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<"team_org" | "team_project">("team_org");
  const [parentSlug, setParentSlug] = useState<string>("");
  const [collectionSlug, setCollectionSlug] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/vault/destinations");
      if (cancelled) return;
      if (!res.ok) {
        setLoadError("Impossible de charger les destinations.");
        return;
      }
      const data = (await res.json()) as Destinations;
      setDestinations(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orgs = destinations?.orgs ?? [];
  const projects = destinations?.projects ?? [];

  const parentOptions = scope === "team_org" ? orgs : projects;
  const selectedParent = parentOptions.find((p) => p.slug === parentSlug);
  const collections = selectedParent?.collections ?? [];

  // Reset cascade quand l'utilisateur change de scope.
  function changeScope(next: "team_org" | "team_project") {
    setScope(next);
    setParentSlug("");
    setCollectionSlug("");
    setError(null);
  }

  function changeParent(slug: string) {
    setParentSlug(slug);
    setCollectionSlug("");
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!parentSlug || !collectionSlug) {
      setError("Sélectionne une destination.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const body: Record<string, string> = {
        target: scope,
        collectionSlug,
      };
      if (scope === "team_org") body.orgSlug = parentSlug;
      else body.projectSlug = parentSlug;

      const res = await fetch(`/api/vault/entries/${entry.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Déplacement impossible.");
        return;
      }
      const label = `${selectedParent?.name ?? parentSlug} / ${
        collections.find((c) => c.slug === collectionSlug)?.name ??
        collectionSlug
      }`;
      onMoved(label);
    });
  }

  const noTargets = parentOptions.length === 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">Déplacer « {entry.name} »</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {loadError ? (
          <div className="dialog-body">
            <p className="error-text">{loadError}</p>
          </div>
        ) : !destinations ? (
          <div className="dialog-body">
            <p className="help">Chargement des destinations…</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="dialog-body">
              <p className="help">
                Vers une collection d&apos;équipe. L&apos;entrée sortira de ton
                coffre personnel et deviendra accessible aux membres de la
                collection.
              </p>

              <div className="field">
                <label>Type de destination</label>
                <div className="flex items-center gap-3">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value="team_org"
                      checked={scope === "team_org"}
                      onChange={() => changeScope("team_org")}
                    />
                    Organisation
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value="team_project"
                      checked={scope === "team_project"}
                      onChange={() => changeScope("team_project")}
                    />
                    Projet
                  </label>
                </div>
              </div>

              <div className="field">
                <label>{scope === "team_org" ? "Organisation" : "Projet"}</label>
                <select
                  value={parentSlug}
                  onChange={(e) => changeParent(e.target.value)}
                  className="select"
                  required
                  disabled={noTargets}
                >
                  <option value="">— Sélectionner —</option>
                  {parentOptions.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                      {p.collections.length === 0 ? " (aucune collection)" : ""}
                    </option>
                  ))}
                </select>
                {noTargets && (
                  <div className="help" style={{ marginTop: 6 }}>
                    {scope === "team_org"
                      ? "Aucune organisation accessible."
                      : "Aucun projet accessible."}
                  </div>
                )}
              </div>

              <div className="field">
                <label>Collection</label>
                <select
                  value={collectionSlug}
                  onChange={(e) => setCollectionSlug(e.target.value)}
                  className="select"
                  required
                  disabled={!parentSlug || collections.length === 0}
                >
                  <option value="">— Sélectionner —</option>
                  {collections.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {parentSlug && collections.length === 0 && (
                  <div className="help" style={{ marginTop: 6 }}>
                    Aucune collection EDITOR+ ici. Crée-en une depuis
                    l&apos;onglet Coffre.
                  </div>
                )}
              </div>

              {error && <p className="error-text">{error}</p>}
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending || !parentSlug || !collectionSlug}
                className="btn btn-primary btn-sm"
              >
                {pending ? "Déplacement…" : "Déplacer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
