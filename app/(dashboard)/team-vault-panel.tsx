"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RiFolderOpenLine, RiShuffleLine } from "@remixicon/react";
import { generatePassword } from "@/lib/generate-password";

type VaultRole = "OWNER" | "EDITOR" | "VIEWER";

const ROLE_RANK: Record<VaultRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export type TeamVaultScope =
  | { kind: "org"; orgSlug: string }
  | { kind: "project"; projectSlug: string };

type Collection = {
  id: string;
  name: string;
  slug: string;
  role: VaultRole;
  entryCount: number;
  memberCount?: number;
};

type Entry = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  tags: string[];
  favorite: boolean;
  hasTotpSecret: boolean;
};

type Member = {
  id: string;
  userId: string;
  email: string;
  role: VaultRole;
};

function basePath(scope: TeamVaultScope): string {
  return scope.kind === "org"
    ? `/api/vault/org/${scope.orgSlug}/collections`
    : `/api/vault/project/${scope.projectSlug}/collections`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TeamVaultPanel({ scope }: { scope: TeamVaultScope }) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(basePath(scope));
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { collections: Collection[] };
    setCollections(data.collections);
  }, [scope]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createCollection(name: string) {
    const res = await fetch(basePath(scope), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "Création impossible.");
      return false;
    }
    setCreating(false);
    reload();
    return true;
  }

  async function removeCollection(c: Collection) {
    if (!confirm(`Supprimer la collection "${c.name}" et toutes ses entrées ?`))
      return;
    const res = await fetch(`${basePath(scope)}/${c.slug}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    if (activeSlug === c.slug) setActiveSlug(null);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="section-header">
        <p className="help" style={{ marginRight: 12 }}>
          {scope.kind === "org"
            ? "Coffres partagés au niveau de l'organisation. Membres gérés par collection (OWNER/EDITOR/VIEWER). OrgADMIN+ ont accès OWNER implicite."
            : "Coffres partagés au niveau du projet. Droits hérités du RBAC projet (VIEWER/EDITOR/OWNER projet → même rôle sur les collections)."}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn btn-primary btn-sm"
        >
          + Nouvelle collection
        </button>
      </div>

      {creating && (
        <div className="create-card">
          <CreateCollectionForm
            onCancel={() => setCreating(false)}
            onCreated={createCollection}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {collections === null ? (
        <p className="help">Chargement…</p>
      ) : collections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucune collection</div>
          <div>Cliquez sur « + Nouvelle collection » pour créer.</div>
        </div>
      ) : (
        <div className="row-list">
          {collections.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <button
                type="button"
                onClick={() =>
                  setActiveSlug(activeSlug === c.slug ? null : c.slug)
                }
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  fontFamily: "inherit",
                  color: "inherit",
                }}
              >
                <div className="row-icon"><RiFolderOpenLine size={18} aria-hidden /></div>
                <div className="row-info">
                  <div className="row-name">{c.name}</div>
                  <div className="row-meta">
                    <span>
                      {c.entryCount} entrée{c.entryCount === 1 ? "" : "s"}
                    </span>
                    {c.memberCount !== undefined && (
                      <span>
                        · {c.memberCount} membre
                        {c.memberCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`role role-${c.role.toLowerCase()}`}>
                    {c.role}
                  </span>
                  <span className="text-muted">
                    {activeSlug === c.slug ? "▲" : "▼"}
                  </span>
                </div>
              </button>
              {activeSlug === c.slug && (
                <CollectionDetail
                  scope={scope}
                  collection={c}
                  onDeleted={() => removeCollection(c)}
                  onChanged={reload}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCollectionForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await onCreated(name.trim());
    });
  }

  return (
    <form onSubmit={submit} className="form-row">
      <div className="field" style={{ minWidth: 240 }}>
        <label>Nom de la collection</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Outils internes"
          className="input"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="btn btn-primary btn-sm"
      >
        {pending ? "..." : "Créer"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-ghost btn-sm"
      >
        Annuler
      </button>
    </form>
  );
}

function CollectionDetail({
  scope,
  collection,
  onDeleted,
  onChanged,
}: {
  scope: TeamVaultScope;
  collection: Collection;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [showMembers, setShowMembers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = ROLE_RANK[collection.role] >= ROLE_RANK.EDITOR;
  const canManage = collection.role === "OWNER";

  const entryBase = `${basePath(scope)}/${collection.slug}/entries`;

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(entryBase);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { entries: Entry[] };
    setEntries(data.entries);
  }, [entryBase]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function reveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed((r) => {
        const copy = { ...r };
        delete copy[id];
        return copy;
      });
      return;
    }
    const res = await fetch(`${entryBase}/${id}`);
    if (!res.ok) return setError("Impossible de révéler.");
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
    const res = await fetch(`${entryBase}/${id}`);
    if (!res.ok) return setError("Impossible de récupérer.");
    const data = (await res.json()) as { entry: { password: string | null } };
    if (!data.entry.password) return setError("Aucun mot de passe.");
    copyToClipboard(data.entry.password, "Mot de passe");
  }

  async function remove(e: Entry) {
    if (!confirm(`Supprimer "${e.name}" ?`)) return;
    const res = await fetch(`${entryBase}/${e.id}`, { method: "DELETE" });
    if (!res.ok) return setError("Suppression impossible.");
    setRevealed((r) => {
      const copy = { ...r };
      delete copy[e.id];
      return copy;
    });
    reload();
    onChanged();
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <div className="section-header">
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn btn-primary btn-sm"
            >
              + Entrée
            </button>
          )}
          {canManage && scope.kind === "org" && (
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              className="btn btn-ghost btn-sm"
            >
              {showMembers ? "Masquer membres" : "Membres"}
            </button>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onDeleted}
            className="btn btn-danger btn-xs"
          >
            Supprimer la collection
          </button>
        )}
      </div>

      {error && (
        <p className="help text-accent" style={{ marginBottom: 8 }}>
          {error}
        </p>
      )}

      {showMembers && scope.kind === "org" && (
        <MembersSection
          orgSlug={scope.orgSlug}
          collectionSlug={collection.slug}
        />
      )}

      {(adding || editing) && (
        <EntryDialog
          entryBase={entryBase}
          initial={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            reload();
            onChanged();
          }}
        />
      )}

      {entries === null ? (
        <p className="help">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="help" style={{ fontStyle: "italic" }}>
          Aucune entrée dans cette collection.
        </p>
      ) : (
        <div className="row-list">
          {entries.map((e) => (
            <div key={e.id} className="row">
              <div className="row-icon">{initials(e.name)}</div>
              <div className="row-info">
                <div className="flex items-center gap-2">
                  {e.favorite && <span className="star-btn active">★</span>}
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
                    Login
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyPassword(e.id)}
                  className="btn btn-ghost btn-xs"
                >
                  Mdp
                </button>
                <button
                  type="button"
                  onClick={() => reveal(e.id)}
                  className="btn btn-ghost btn-xs"
                >
                  {revealed[e.id] !== undefined ? "Masquer" : "Afficher"}
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      className="btn btn-ghost btn-xs"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      className="btn btn-danger btn-xs"
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersSection({
  orgSlug,
  collectionSlug,
}: {
  orgSlug: string;
  collectionSlug: string;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const base = `/api/vault/org/${orgSlug}/collections/${collectionSlug}/members`;

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(base);
    if (!res.ok) return setError("Erreur de chargement membres.");
    const data = (await res.json()) as { members: Member[] };
    setMembers(data.members);
  }, [base]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function add(email: string, role: VaultRole) {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "Ajout impossible.");
      return false;
    }
    setAdding(false);
    reload();
    return true;
  }

  async function changeRole(m: Member, role: VaultRole) {
    const res = await fetch(`${base}/${m.userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) return setError("Modification impossible.");
    reload();
  }

  async function remove(m: Member) {
    if (!confirm(`Retirer ${m.email} de cette collection ?`)) return;
    const res = await fetch(`${base}/${m.userId}`, { method: "DELETE" });
    if (!res.ok) return setError("Suppression impossible.");
    reload();
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div className="section-header">
        <h4 className="cat-header" style={{ margin: 0 }}>
          Membres
        </h4>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-ghost btn-xs"
          >
            + Ajouter
          </button>
        )}
      </div>
      {error && (
        <p className="help text-accent" style={{ marginBottom: 8 }}>
          {error}
        </p>
      )}
      {adding && (
        <AddMemberForm onCancel={() => setAdding(false)} onAdded={add} />
      )}
      {members === null ? (
        <p className="help">Chargement…</p>
      ) : members.length === 0 ? (
        <p className="help" style={{ fontStyle: "italic" }}>
          Aucun membre explicite. Les OrgADMIN+ ont accès OWNER implicite.
        </p>
      ) : (
        <div className="row-list">
          {members.map((m) => (
            <div key={m.id} className="row">
              <div className="row-icon">{initials(m.email)}</div>
              <div className="row-info">
                <div className="row-name">{m.email}</div>
              </div>
              <div className="row-actions">
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m, e.target.value as VaultRole)}
                  className="select"
                  style={{
                    width: "auto",
                    padding: "4px 8px",
                    fontSize: 11,
                  }}
                >
                  <option value="VIEWER">VIEWER</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="OWNER">OWNER</option>
                </select>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="btn btn-danger btn-xs"
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMemberForm({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: (email: string, role: VaultRole) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<VaultRole>("VIEWER");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      await onAdded(email.trim().toLowerCase(), role);
    });
  }

  return (
    <form onSubmit={submit} className="form-row" style={{ marginBottom: 12 }}>
      <div className="field" style={{ minWidth: 200 }}>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="input"
        />
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as VaultRole)}
        className="select"
        style={{ width: "auto" }}
      >
        <option value="VIEWER">VIEWER</option>
        <option value="EDITOR">EDITOR</option>
        <option value="OWNER">OWNER</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-sm"
      >
        Ajouter
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-ghost btn-sm"
      >
        Annuler
      </button>
    </form>
  );
}

function EntryDialog({
  entryBase,
  initial,
  onClose,
  onSaved,
}: {
  entryBase: string;
  initial: Entry | null;
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
    const res = await fetch(`${entryBase}/${initial.id}`);
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

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
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
      if (!isEdit || pwdLoaded) body.password = password;
      if (!isEdit || totpLoaded) body.totpSecret = totpSecret.trim() || null;

      const url2 = isEdit ? `${entryBase}/${initial!.id}` : entryBase;
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
                className="input"
              />
            </div>
            <div className="field">
              <label>URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input input-mono"
              />
            </div>
            <div className="field">
              <label>Login / Email</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                    onClick={() => {
                      setPassword(generatePassword(24));
                      setShowPassword(true);
                      setPwdLoaded(true);
                    }}
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
                Optionnel. Secret base32 ou URL otpauth:// — l&apos;extension
                affichera le code 6 chiffres en temps réel.
              </div>
            </div>
            <div className="field">
              <label>Tags</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {tags.map((t) => (
                  <span key={t} className="chip" style={{ gap: 4 }}>
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--muted)",
                        fontSize: 12,
                      }}
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
                  onBlur={addTag}
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
