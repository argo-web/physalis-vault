"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ProjectRole } from "@prisma/client";
import { useTranslations } from "next-intl";
import TagsInput from "@/components/TagsInput";

const ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

const ENV_DISPLAY_NAMES: Record<string, string> = {};

function envDisplay(name: string): string {
  return ENV_DISPLAY_NAMES[name] ?? name;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type EnvSummary = { id: string; name: string; url: string | null };

// Extrait l'en-tete du README (titre + description) : tout le HTML AVANT le
// premier <h2> (= premiere section « ## »). Le HTML est deja sanitize cote
// serveur et les badges GitHub deja retires (cf. renderMarkdownSafe). Regex
// volontaire (pas de DOMParser) pour rester SSR-safe. Retourne null si vide.
function readmeHeaderHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const h2 = html.search(/<h2\b/i);
  let header = h2 === -1 ? html : html.slice(0, h2);
  header = header
    // Pas d'image dans l'encart (logo/banniere de README) + liens/paragraphes
    // devenus vides apres suppression.
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<p\b[^>]*>\s*<\/p>/gi, "")
    // Pas de <hr> en fin de texte (separateur avant la 1re section).
    .replace(/(?:\s*<hr\b[^>]*?\/?>\s*)+$/i, "")
    .trim();
  // Au moins un peu de texte exploitable (evite un en-tete vide / image seule).
  if (header.replace(/<[^>]*>/g, "").trim().length === 0) return null;
  return header;
}

type ServiceListItem = {
  id: string;
  name: string;
  url: string | null;
  tags: string[];
  updatedAt: string;
};

type AccountListItem = {
  id: string;
  name: string;
  tags: string[];
  updatedAt: string;
};

export default function AccessPanel({
  slug,
  role,
  environments,
  readmeHtml,
  addingService,
  setAddingService,
  addingAccount,
  setAddingAccount,
  onServicesEmptyChange,
  onAccountsEmptyChange,
}: {
  slug: string;
  role: ProjectRole;
  environments: EnvSummary[];
  /** HTML du README (deja rendu/sanitize). Si fourni, on en extrait l'en-tete
   *  (titre + description) pour un encart de presentation en tete d'onglet. */
  readmeHtml?: string | null;
  // Etat « ajout » pilote par InfosPanel : quand une section est vide, son
  // bouton d'ajout est rendu dans la barre d'onglets (parent), pas ici.
  addingService: boolean;
  setAddingService: (v: boolean) => void;
  addingAccount: boolean;
  setAddingAccount: (v: boolean) => void;
  onServicesEmptyChange: (empty: boolean | null) => void;
  onAccountsEmptyChange: (empty: boolean | null) => void;
}) {
  const t = useTranslations("projects");
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;

  const intro = useMemo(() => readmeHeaderHtml(readmeHtml), [readmeHtml]);

  // On n'affiche que les environnements ayant une URL configuree. Ceux
  // sans URL (env "interne", config en cours) ne sont pas pertinents
  // dans l'onglet Acces qui sert a ouvrir les apps deployees.
  const visibleEnvs = environments.filter((e) => Boolean(e.url));

  return (
    <div className="flex flex-col gap-8">
      {intro && (
        <article
          className="card docs-prose"
          dangerouslySetInnerHTML={{ __html: intro }}
        />
      )}

      {visibleEnvs.length > 0 && (
        <section>
          <div className="section-header">
            <h2 className="section-title">{t("access.envTitle")}</h2>
          </div>
          <div className="env-grid">
            {visibleEnvs.map((env) => (
              <a
                key={env.id}
                href={env.url ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="card card-link env-card"
              >
                <div className="env-name">{envDisplay(env.name)}</div>
                <div className="env-url">{env.url}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <ServicesSection
        slug={slug}
        canEdit={canEdit}
        adding={addingService}
        setAdding={setAddingService}
        onEmptyChange={onServicesEmptyChange}
      />
      <AccountsSection
        slug={slug}
        canEdit={canEdit}
        adding={addingAccount}
        setAdding={setAddingAccount}
        onEmptyChange={onAccountsEmptyChange}
      />
    </div>
  );
}

function ServicesSection({
  slug,
  canEdit,
  adding,
  setAdding,
  onEmptyChange,
}: {
  slug: string;
  canEdit: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onEmptyChange: (empty: boolean | null) => void;
}) {
  const t = useTranslations("projects");
  const [items, setItems] = useState<ServiceListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<
    Record<string, { user: string; password: string }>
  >({});
  const [editId, setEditId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/projects/${slug}/services`);
    if (!res.ok) {
      setError(t("access.loadError"));
      return;
    }
    const data = (await res.json()) as { services: ServiceListItem[] };
    setItems(data.services);
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => {
        const copy = { ...r };
        delete copy[id];
        return copy;
      });
      return;
    }
    const res = await fetch(`/api/projects/${slug}/services/${id}`);
    if (!res.ok) {
      setError(t("access.revealError"));
      return;
    }
    const data = (await res.json()) as {
      service: { user: string; password: string };
    };
    setRevealed((r) => ({
      ...r,
      [id]: { user: data.service.user, password: data.service.password },
    }));
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("access.serviceDeleteConfirm", { name }))) return;
    const res = await fetch(`/api/projects/${slug}/services/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError(t("access.deleteError"));
      return;
    }
    reload();
  }

  const isEmpty = items !== null && items.length === 0;

  // Remonte l'etat vide au parent : il affiche le bouton d'ajout rapide dans
  // l'en-tete « Environnements » quand la section est vide.
  useEffect(() => {
    onEmptyChange(items === null ? null : items.length === 0);
  }, [items, onEmptyChange]);

  const allTags = useMemo<string[]>(() => {
    if (!items) return [];
    const set = new Set<string>();
    for (const s of items) for (const tag of s.tags) set.add(tag);
    return Array.from(set).sort();
  }, [items]);

  // Section vide sans formulaire ouvert : on n'affiche rien (titre masque,
  // bouton d'ajout remonte dans l'en-tete des environnements).
  if (isEmpty && !adding && !error) return null;

  return (
    <section>
      {!isEmpty && (
        <div className="section-header">
          <div>
            <h2 className="section-title">{t("access.servicesTitle")}</h2>
            <p className="help" style={{ marginTop: 4 }}>
              {t("access.servicesHelp")}
            </p>
          </div>
          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn btn-primary btn-sm"
            >
              {t("access.addBtn")}
            </button>
          )}
        </div>
      )}

      {adding && canEdit && (
        <div className="create-card">
          <ServiceForm
            slug={slug}
            allTags={allTags}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              reload();
            }}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {items === null ? (
        <p className="help">{t("access.loading")}</p>
      ) : items.length === 0 ? null : (
        <div className="row-list">
          {items.map((s) =>
            editId === s.id && canEdit ? (
              <div key={s.id} className="card">
                <ServiceForm
                  slug={slug}
                  initialId={s.id}
                  initialName={s.name}
                  initialUrl={s.url}
                  initialTags={s.tags}
                  allTags={allTags}
                  onCancel={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null);
                    setRevealed((r) => {
                      const copy = { ...r };
                      delete copy[s.id];
                      return copy;
                    });
                    reload();
                  }}
                />
              </div>
            ) : (
              <CredentialsRow
                key={s.id}
                name={s.name}
                url={s.url}
                revealed={revealed[s.id]}
                onReveal={() => reveal(s.id)}
                onEdit={canEdit ? () => setEditId(s.id) : null}
                onRemove={canEdit ? () => remove(s.id, s.name) : null}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function ServiceForm({
  slug,
  initialId,
  initialName,
  initialUrl,
  initialTags,
  allTags,
  onCancel,
  onSaved,
}: {
  slug: string;
  initialId?: string;
  initialName?: string;
  initialUrl?: string | null;
  initialTags?: string[];
  allTags?: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("projects");
  const isEdit = Boolean(initialId);
  const [name, setName] = useState(initialName ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = { name, tags };
      if (url.trim()) body.url = url.trim();
      if (!isEdit || user) body.user = user;
      if (!isEdit || password) body.password = password;

      const res = await fetch(
        isEdit
          ? `/api/projects/${slug}/services/${initialId}`
          : `/api/projects/${slug}/services`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? t("access.saveError"));
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="field">
          <label>{t("access.nameLabel")}</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Stripe"
            className="input"
          />
        </div>
        <div className="field">
          <label>{t("access.urlLabel")}</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://dashboard.stripe.com (optionnel)"
            className="input input-mono"
          />
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <div className="field">
          <label>{t("access.userLabel")}</label>
          <input
            required={!isEdit}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={
              isEdit ? t("access.leaveBlankHint") : t("access.userLabel")
            }
            autoComplete="off"
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>{t("access.passwordLabel")}</label>
          <input
            required={!isEdit}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              isEdit ? t("access.leaveBlankHint") : t("access.passwordLabel")
            }
            autoComplete="new-password"
            className="input input-mono"
          />
        </div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>
          {t("access.tagsLabel")}{" "}
          <span className="text-muted" style={{ fontSize: 11 }}>
            {t("access.tagsHint")}
          </span>
        </label>
        <TagsInput value={tags} onChange={setTags} suggestions={allTags ?? []} />
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
          {pending ? "..." : isEdit ? t("access.updateBtn") : t("access.createBtn")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          {t("access.cancelBtn")}
        </button>
      </div>
    </form>
  );
}

function AccountsSection({
  slug,
  canEdit,
  adding,
  setAdding,
  onEmptyChange,
}: {
  slug: string;
  canEdit: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onEmptyChange: (empty: boolean | null) => void;
}) {
  const t = useTranslations("projects");
  const [items, setItems] = useState<AccountListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<
    Record<string, { user: string; password: string }>
  >({});
  const [editId, setEditId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/projects/${slug}/accounts`);
    if (!res.ok) {
      setError(t("access.loadError"));
      return;
    }
    const data = (await res.json()) as { accounts: AccountListItem[] };
    setItems(data.accounts);
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => {
        const copy = { ...r };
        delete copy[id];
        return copy;
      });
      return;
    }
    const res = await fetch(`/api/projects/${slug}/accounts/${id}`);
    if (!res.ok) {
      setError(t("access.revealError"));
      return;
    }
    const data = (await res.json()) as {
      account: { user: string; password: string };
    };
    setRevealed((r) => ({
      ...r,
      [id]: { user: data.account.user, password: data.account.password },
    }));
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("access.accountDeleteConfirm", { name }))) return;
    const res = await fetch(`/api/projects/${slug}/accounts/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError(t("access.deleteError"));
      return;
    }
    reload();
  }

  const isEmpty = items !== null && items.length === 0;

  // Remonte l'etat vide au parent : il affiche le bouton d'ajout rapide dans
  // l'en-tete « Environnements » quand la section est vide.
  useEffect(() => {
    onEmptyChange(items === null ? null : items.length === 0);
  }, [items, onEmptyChange]);

  const allTags = useMemo<string[]>(() => {
    if (!items) return [];
    const set = new Set<string>();
    for (const a of items) for (const tag of a.tags) set.add(tag);
    return Array.from(set).sort();
  }, [items]);

  // Section vide sans formulaire ouvert : on n'affiche rien (titre masque,
  // bouton d'ajout remonte dans l'en-tete des environnements).
  if (isEmpty && !adding && !error) return null;

  return (
    <section>
      {!isEmpty && (
        <div className="section-header">
          <div>
            <h2 className="section-title">{t("access.accountsTitle")}</h2>
            <p className="help" style={{ marginTop: 4 }}>
              {t("access.accountsHelp")}
            </p>
          </div>
          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn btn-primary btn-sm"
            >
              {t("access.addBtn")}
            </button>
          )}
        </div>
      )}

      {adding && canEdit && (
        <div className="create-card">
          <AccountForm
            slug={slug}
            allTags={allTags}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              reload();
            }}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {items === null ? (
        <p className="help">{t("access.loading")}</p>
      ) : items.length === 0 ? null : (
        <div className="row-list">
          {items.map((a) =>
            editId === a.id && canEdit ? (
              <div key={a.id} className="card">
                <AccountForm
                  slug={slug}
                  initialId={a.id}
                  initialTags={a.tags}
                  allTags={allTags}
                  initialName={a.name}
                  onCancel={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null);
                    setRevealed((r) => {
                      const copy = { ...r };
                      delete copy[a.id];
                      return copy;
                    });
                    reload();
                  }}
                />
              </div>
            ) : (
              <CredentialsRow
                key={a.id}
                name={a.name}
                url={null}
                revealed={revealed[a.id]}
                onReveal={() => reveal(a.id)}
                onEdit={canEdit ? () => setEditId(a.id) : null}
                onRemove={canEdit ? () => remove(a.id, a.name) : null}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function AccountForm({
  slug,
  initialId,
  initialName,
  initialTags,
  allTags,
  onCancel,
  onSaved,
}: {
  slug: string;
  initialId?: string;
  initialName?: string;
  initialTags?: string[];
  allTags?: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("projects");
  const isEdit = Boolean(initialId);
  const [name, setName] = useState(initialName ?? "");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = { name, tags };
      if (!isEdit || user) body.user = user;
      if (!isEdit || password) body.password = password;

      const res = await fetch(
        isEdit
          ? `/api/projects/${slug}/accounts/${initialId}`
          : `/api/projects/${slug}/accounts`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? t("access.saveError"));
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="field">
          <label>{t("access.nameLabel")}</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Admin demo"
            className="input"
          />
        </div>
        <div className="field">
          <label>{t("access.userLabel")}</label>
          <input
            required={!isEdit}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={
              isEdit ? t("access.leaveBlankHint") : t("access.userLabel")
            }
            autoComplete="off"
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>{t("access.passwordLabel")}</label>
          <input
            required={!isEdit}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              isEdit ? t("access.leaveBlankHint") : t("access.passwordLabel")
            }
            autoComplete="new-password"
            className="input input-mono"
          />
        </div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>
          {t("access.tagsLabel")}{" "}
          <span className="text-muted" style={{ fontSize: 11 }}>
            {t("access.tagsHint")}
          </span>
        </label>
        <TagsInput value={tags} onChange={setTags} suggestions={allTags ?? []} />
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
          {pending ? "..." : isEdit ? t("access.updateBtn") : t("access.createBtn")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          {t("access.cancelBtn")}
        </button>
      </div>
    </form>
  );
}

function CredentialsRow({
  name,
  url,
  revealed,
  onReveal,
  onEdit,
  onRemove,
}: {
  name: string;
  url: string | null;
  revealed?: { user: string; password: string };
  onReveal: () => void;
  onEdit: (() => void) | null;
  onRemove: (() => void) | null;
}) {
  const t = useTranslations("projects");
  return (
    <div className="row">
      <div className="row-icon">{initials(name)}</div>
      <div className="row-info">
        <div className="row-name">{name}</div>
        <div className="row-meta">
          {url && (
            <a href={url} target="_blank" rel="noreferrer noopener">
              {url}
            </a>
          )}
          <span className="code-mono">
            <span className="text-muted">user:</span>{" "}
            {revealed ? revealed.user || t("access.empty") : "••••••••"}
          </span>
          <span className="code-mono">
            <span className="text-muted">pass:</span>{" "}
            {revealed ? revealed.password || t("access.empty") : "••••••••"}
          </span>
        </div>
      </div>
      <div className="row-actions">
        <button
          type="button"
          onClick={onReveal}
          className="btn btn-ghost btn-xs"
        >
          {revealed ? t("access.hideBtn") : t("access.revealBtn")}
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-ghost btn-xs"
          >
            {t("access.editBtn")}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn btn-danger btn-xs"
          >
            {t("access.deleteBtn")}
          </button>
        )}
      </div>
    </div>
  );
}
