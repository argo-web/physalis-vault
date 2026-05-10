"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  RiFolderOpenLine,
  RiGridLine,
  RiInboxArchiveLine,
  RiListCheck2,
  RiShuffleLine,
  RiStarFill,
} from "@remixicon/react";
import { generatePassword } from "@/lib/generate-password";
import { estimateStrength } from "@/lib/password-strength";
import { computeDuplicates } from "@/lib/vault-duplicates";
import ExtensionBanner from "./extension-banner";

type VaultEntryListItem = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  tags: string[];
  favorite: boolean;
  hasTotpSecret: boolean;
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type VaultCollection = {
  id: string;
  name: string;
  slug: string;
  entryCount: number;
};

// "all" = toutes les entries, "favorites" = favoris seulement,
// "none" = entries sans collection, "duplicates" = entries en doublon
// (même domaine + même login), "<id>" = entries d'une collection précise.
type CollectionFilter = "all" | "favorites" | "none" | "duplicates" | string;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "à l'instant";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `il y a ${day} j`;
  const month = Math.floor(day / 30);
  if (month < 12) return `il y a ${month} mois`;
  const year = Math.floor(day / 365);
  return `il y a ${year} an${year > 1 ? "s" : ""}`;
}

export default function VaultPanel() {
  const [entries, setEntries] = useState<VaultEntryListItem[] | null>(null);
  const [collections, setCollections] = useState<VaultCollection[]>([]);
  const [allTagsList, setAllTagsList] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<VaultEntryListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<VaultEntryListItem | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState<"name" | "recent" | "favorite_first">("name");
  // Vue liste / grille — préférence persistée dans localStorage. SSR-safe :
  // l'init renvoie "list" (default) puis on se synchronise dans un effect.
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("physalis-vault-view-mode");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  function toggleViewMode(next: "list" | "grid") {
    setViewMode(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("physalis-vault-view-mode", next);
    }
  }

  // Liste complete des tags + counts globaux : recalculee uniquement quand
  // le contenu de fond change (ajout/suppression/edition), pas quand l'user
  // toggle un filtre. Sinon allTagsList n'aurait que le tag courant et les
  // autres tags disparaitraient de l'UI.
  const reloadAllTags = useCallback(async () => {
    const res = await fetch("/api/vault/entries");
    if (!res.ok) return;
    const data = (await res.json()) as { entries: VaultEntryListItem[] };
    const set = new Set<string>();
    let favCount = 0;
    let uncatCount = 0;
    for (const e of data.entries) {
      for (const t of e.tags) set.add(t);
      if (e.favorite) favCount++;
      if (e.collectionId === null) uncatCount++;
    }
    setAllTagsList(Array.from(set).sort());
    setTotalCount(data.entries.length);
    setFavoritesCount(favCount);
    setUncategorizedCount(uncatCount);
    setDuplicateIds(computeDuplicates(data.entries));
  }, []);

  const reloadCollections = useCallback(async () => {
    const res = await fetch("/api/vault/collections");
    if (!res.ok) return;
    const data = (await res.json()) as { collections: VaultCollection[] };
    setCollections(data.collections);
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (filter === "favorites") params.set("favorite", "true");
    else if (filter === "none") params.set("collectionId", "none");
    else if (filter !== "all" && filter !== "duplicates") {
      params.set("collectionId", filter);
    }
    if (activeTag) params.set("tag", activeTag);
    if (search.trim()) params.set("search", search.trim());
    if (sort !== "name") params.set("sort", sort);
    const qs = params.toString();
    const res = await fetch(`/api/vault/entries${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { entries: VaultEntryListItem[] };
    // Filtre "doublons" appliqué client-side (notion non connue du serveur).
    const filtered =
      filter === "duplicates"
        ? data.entries.filter((e) => duplicateIds.has(e.id))
        : data.entries;
    setEntries(filtered);
  }, [filter, activeTag, search, sort, duplicateIds]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    reloadAllTags();
    reloadCollections();
  }, [reloadAllTags, reloadCollections]);

  async function createCollection(name: string): Promise<boolean> {
    const res = await fetch("/api/vault/collections", {
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
    setCreatingCollection(false);
    reloadCollections();
    return true;
  }

  async function removeCollection(c: VaultCollection) {
    if (
      !confirm(
        `Supprimer la collection « ${c.name} » ? Les ${c.entryCount} entrée(s) reviendront dans « Sans catégorie ».`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/vault/collections/${c.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    if (filter === c.id) setFilter("all");
    reloadCollections();
    reloadAllTags();
    reload();
  }

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gap: 24,
        alignItems: "start",
      }}
    >
      {/* Sidebar — collections perso */}
      <aside className="flex flex-col gap-1" style={{ position: "sticky", top: 16 }}>
        <SidebarItem
          active={filter === "all"}
          onClick={() => setFilter("all")}
          icon={<RiInboxArchiveLine size={16} aria-hidden />}
          label="Toutes"
          count={totalCount}
        />
        <SidebarItem
          active={filter === "favorites"}
          onClick={() => setFilter("favorites")}
          icon={<RiStarFill size={16} aria-hidden style={{ color: "var(--accent, #f59e0b)" }} />}
          label="Favoris"
          count={favoritesCount}
        />

        <div
          className="cat-header"
          style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span>Collections</span>
          <button
            type="button"
            onClick={() => setCreatingCollection(true)}
            className="btn btn-ghost btn-xs"
            title="Nouvelle collection"
            style={{ padding: "2px 6px" }}
          >
            +
          </button>
        </div>

        {creatingCollection && (
          <div style={{ padding: "4px 0" }}>
            <CreateCollectionInline
              onCancel={() => setCreatingCollection(false)}
              onCreated={createCollection}
            />
          </div>
        )}

        {collections.length === 0 && !creatingCollection ? (
          <p className="help" style={{ padding: "4px 8px", fontSize: 11 }}>
            Aucune collection. Crée-en une pour organiser tes entrées.
          </p>
        ) : (
          collections.map((c) => (
            <SidebarItem
              key={c.id}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
              icon={<RiFolderOpenLine size={16} aria-hidden />}
              label={c.name}
              count={c.entryCount}
              onDelete={() => removeCollection(c)}
            />
          ))
        )}

        {uncategorizedCount > 0 && (
          <SidebarItem
            active={filter === "none"}
            onClick={() => setFilter("none")}
            icon={<RiInboxArchiveLine size={16} aria-hidden style={{ opacity: 0.5 }} />}
            label="Sans catégorie"
            count={uncategorizedCount}
            muted
          />
        )}

        {duplicateIds.size > 0 && (
          <SidebarItem
            active={filter === "duplicates"}
            onClick={() => setFilter("duplicates")}
            icon={<span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>}
            label="Doublons"
            count={duplicateIds.size}
            warning
          />
        )}
      </aside>

      {/* Main — entries de la collection sélectionnée */}
      <div className="flex flex-col gap-4">
        <ExtensionBanner totalCount={totalCount} />
        {/* Toolbar */}
        <div className="form-row" style={{ alignItems: "center" }}>
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher (nom / url / login)"
              className="input"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="select"
            title="Trier les entrées"
            style={{ width: "auto", minWidth: 140 }}
          >
            <option value="name">A → Z (favoris en haut)</option>
            <option value="recent">Récemment modifié</option>
            <option value="favorite_first">Favoris puis récents</option>
          </select>
          <div
            role="group"
            aria-label="Mode d'affichage"
            style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}
          >
            <button
              type="button"
              onClick={() => toggleViewMode("list")}
              title="Vue liste"
              aria-pressed={viewMode === "list"}
              className="btn btn-ghost"
              style={{
                padding: "6px 8px",
                borderRadius: 0,
                background: viewMode === "list" ? "var(--surface-hover, rgba(255,255,255,0.06))" : "transparent",
              }}
            >
              <RiListCheck2 size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => toggleViewMode("grid")}
              title="Vue grille"
              aria-pressed={viewMode === "grid"}
              className="btn btn-ghost"
              style={{
                padding: "6px 8px",
                borderRadius: 0,
                background: viewMode === "grid" ? "var(--surface-hover, rgba(255,255,255,0.06))" : "transparent",
              }}
            >
              <RiGridLine size={16} aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="btn btn-ghost"
            title="Importer depuis Bitwarden, Chrome, etc."
          >
            Importer CSV
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
            collections={collections}
            defaultCollectionId={
              !editing && filter !== "all" && filter !== "favorites" && filter !== "none"
                ? filter
                : null
            }
            onClose={() => {
              setAdding(false);
              setEditing(null);
            }}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              reload();
              reloadAllTags();
              reloadCollections();
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
              reloadCollections();
            }}
          />
        )}

        {importing && (
          <ImportDialog
            onClose={() => setImporting(false)}
            onImported={(count) => {
              setImporting(false);
              setError(`✓ ${count} entrée(s) importée(s)`);
              setTimeout(() => setError(null), 3000);
              reload();
              reloadAllTags();
              reloadCollections();
            }}
          />
        )}

        {entries === null ? (
          <p className="help">Chargement…</p>
        ) : entries.length === 0 ? (
          <EmptyEntries
            filter={filter}
            collections={collections}
            totalCount={totalCount}
            onAdd={() => setAdding(true)}
            onImport={() => setImporting(true)}
          />
        ) : viewMode === "grid" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {entries.map((e) => {
              const collection = collections.find((c) => c.id === e.collectionId);
              const domain = e.url
                ? e.url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
                : null;
              return (
                <div
                  key={e.id}
                  className="card vault-grid-card"
                  style={{
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 10,
                    position: "relative",
                  }}
                >
                  {/* Star top-left + collection chip top-right */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      minHeight: 22,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFavorite(e)}
                      title={e.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      className={`star-btn ${e.favorite ? "active" : ""}`}
                    >
                      ★
                    </button>
                    {collection && (
                      <span
                        className="chip"
                        style={{ fontSize: 10, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={collection.name}
                      >
                        {collection.name}
                      </span>
                    )}
                  </div>

                  {/* 48x48 initials circle centered */}
                  <div
                    aria-hidden
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "var(--surface-hover, rgba(99, 102, 241, 0.15))",
                      color: "var(--text-strong, #fff)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      alignSelf: "center",
                    }}
                  >
                    {initials(e.name)}
                  </div>

                  {/* Name + domain */}
                  <div style={{ textAlign: "center", overflow: "hidden" }}>
                    <div
                      className="row-name"
                      title={e.name}
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                    </div>
                    {domain && (
                      <div
                        className="text-muted"
                        title={e.url ?? undefined}
                        style={{
                          fontSize: 11,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {domain}
                      </div>
                    )}
                  </div>

                  {/* Badges 2FA + doublon */}
                  {(e.hasTotpSecret || duplicateIds.has(e.id)) && (
                    <div className="flex items-center gap-1 justify-center" style={{ flexWrap: "wrap" }}>
                      {e.hasTotpSecret && (
                        <span className="chip" style={{ fontSize: 10 }} title="2FA">🔐 2FA</span>
                      )}
                      {duplicateIds.has(e.id) && (
                        <button
                          type="button"
                          onClick={() => setFilter("duplicates")}
                          className="chip"
                          title="Voir tous les doublons"
                          style={{
                            fontSize: 10,
                            background: "rgba(249, 115, 22, 0.15)",
                            color: "#f97316",
                            border: "1px solid rgba(249, 115, 22, 0.3)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          ⚠ Doublon
                        </button>
                      )}
                    </div>
                  )}

                  {/* Hover actions */}
                  <div
                    className="vault-grid-actions"
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 4,
                      marginTop: "auto",
                      paddingTop: 8,
                      borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
                    }}
                  >
                    {e.username && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(e.username!, "Login")}
                        title="Copier le login"
                        className="btn btn-ghost btn-xs"
                        style={{ padding: "4px 8px" }}
                      >
                        👤
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyPassword(e.id)}
                      title="Copier le mot de passe"
                      className="btn btn-ghost btn-xs"
                      style={{ padding: "4px 8px" }}
                    >
                      🔑
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      title="Modifier"
                      className="btn btn-ghost btn-xs"
                      style={{ padding: "4px 8px" }}
                    >
                      ✎
                    </button>
                    <GridMoreMenu
                      onMove={() => setMoving(e)}
                      onDelete={() => remove(e)}
                    />
                  </div>
                </div>
              );
            })}
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
                      {duplicateIds.has(e.id) && (
                        <button
                          type="button"
                          onClick={() => setFilter("duplicates")}
                          title="Cliquer pour voir tous les doublons"
                          className="chip"
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            background: "rgba(249, 115, 22, 0.15)",
                            color: "#f97316",
                            border: "1px solid rgba(249, 115, 22, 0.3)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          ⚠ Doublon
                        </button>
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
                    <span className="text-muted" title={new Date(e.updatedAt).toLocaleString()}>
                      {relativeTime(e.updatedAt)}
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
    </div>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────

function SidebarItem({
  active,
  onClick,
  icon,
  label,
  count,
  muted,
  warning,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  muted?: boolean;
  warning?: boolean;
  onDelete?: () => void;
}) {
  const color = warning ? "#f97316" : muted ? "var(--text-muted)" : "inherit";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: 6,
        background: active ? "var(--surface-hover, rgba(255,255,255,0.04))" : "transparent",
      }}
      className={onDelete ? "vault-sidebar-item" : ""}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "transparent",
          border: "none",
          color,
          textAlign: "left",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          fontFamily: "inherit",
        }}
      >
        {icon}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span
          className="text-muted"
          style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
        >
          {count}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer la collection"
          aria-label={`Supprimer ${label}`}
          className="vault-sidebar-delete"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "0 8px",
            fontSize: 14,
            color: "var(--text-muted)",
            opacity: 0,
            transition: "opacity .15s",
          }}
        >
          ✕
        </button>
      )}
      <style jsx>{`
        .vault-sidebar-item:hover :global(.vault-sidebar-delete) {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

function CreateCollectionInline({
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
      const ok = await onCreated(name.trim());
      if (ok) setName("");
    });
  }

  return (
    <form onSubmit={submit} style={{ padding: "0 6px" }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Nom (puis Entrée)"
        className="input"
        style={{ fontSize: 12, padding: "4px 8px" }}
        disabled={pending}
      />
    </form>
  );
}

function GridMoreMenu({
  onMove,
  onDelete,
}: {
  onMove: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Click outside → close. Garde une dépendance simple (pas de ref complexe).
  useEffect(() => {
    if (!open) return;
    function handler(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (target?.closest("[data-grid-more-root]")) return;
      setOpen(false);
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  return (
    <div data-grid-more-root style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-ghost btn-xs"
        style={{ padding: "4px 8px" }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            bottom: "100%",
            marginBottom: 4,
            minWidth: 140,
            background: "var(--surface, #1a1a1a)",
            border: "1px solid var(--border, rgba(255,255,255,0.1))",
            borderRadius: 6,
            padding: 4,
            zIndex: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", justifyContent: "flex-start", padding: "6px 10px" }}
          >
            Déplacer…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="btn btn-ghost btn-sm"
            style={{
              width: "100%",
              justifyContent: "flex-start",
              padding: "6px 10px",
              color: "var(--danger, #ef4444)",
            }}
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, color, hint } = estimateStrength(password);
  const segments = [0, 1, 2, 3, 4];
  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          display: "flex",
          gap: 3,
          height: 4,
          borderRadius: 2,
          overflow: "hidden",
        }}
        aria-hidden
      >
        {segments.map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: i <= score ? color : "var(--surface-hover, rgba(255,255,255,0.06))",
              transition: "background .2s",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
          fontSize: 11,
        }}
      >
        <span style={{ color, fontWeight: 600 }}>{label}</span>
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}

function EmptyEntries({
  filter,
  collections,
  totalCount,
  onAdd,
  onImport,
}: {
  filter: CollectionFilter;
  collections: VaultCollection[];
  totalCount: number;
  onAdd: () => void;
  onImport: () => void;
}) {
  // Coffre 100% vide → onboarding 3 cards (créer, importer, extension).
  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="empty-state" style={{ paddingBottom: 18 }}>
          <div className="empty-state-title">Bienvenue dans ton coffre</div>
          <div style={{ marginTop: 6 }}>
            Stocke ici tes credentials privés (Gmail perso, Netflix, etc.).
            Aucun partage, visibles uniquement par toi.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <OnboardingCard
            title="Créer une entrée"
            description="Saisis manuellement ton premier mot de passe."
            ctaLabel="+ Ajouter"
            onClick={onAdd}
            primary
          />
          <OnboardingCard
            title="Importer depuis Bitwarden, Chrome…"
            description="Migre ton coffre existant en quelques secondes (CSV)."
            ctaLabel="Importer un CSV"
            onClick={onImport}
          />
          <OnboardingCard
            title="Installe l'extension"
            description="Auto-fill, génération, save-prompt sur tes sites."
            ctaLabel="Voir les extensions"
            onClick={() => window.open("/docs/extension", "_blank")}
          />
        </div>
      </div>
    );
  }

  let label = "Aucune entrée";
  if (filter === "favorites") label = "Aucun favori pour l'instant";
  else if (filter === "none") label = "Toutes tes entrées sont rangées 🎉";
  else if (filter === "duplicates") label = "Aucun doublon détecté 🎉";
  else if (filter !== "all") {
    const c = collections.find((c) => c.id === filter);
    label = c ? `« ${c.name} » est vide` : "Aucune entrée";
  }

  return (
    <div className="empty-state">
      <div className="empty-state-title">{label}</div>
    </div>
  );
}

function OnboardingCard({
  title,
  description,
  ctaLabel,
  onClick,
  primary,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div>
        <div className="row-name" style={{ marginBottom: 4 }}>{title}</div>
        <div className="help">{description}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`btn btn-sm ${primary ? "btn-primary" : "btn-ghost"}`}
        style={{ alignSelf: "flex-start" }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

function EntryDialog({
  initial,
  collections,
  defaultCollectionId,
  onClose,
  onSaved,
}: {
  initial: VaultEntryListItem | null;
  collections: VaultCollection[];
  defaultCollectionId: string | null;
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
  const [collectionId, setCollectionId] = useState<string | "">(
    initial?.collectionId ?? defaultCollectionId ?? "",
  );
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
        collectionId: collectionId === "" ? null : collectionId,
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
              {(pwdLoaded || !isEdit) && password.length > 0 && (
                <PasswordStrengthMeter password={password} />
              )}
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
              <label>Collection</label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="select"
              >
                <option value="">— Sans catégorie —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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

// ─── ImportDialog ───────────────────────────────────────────────────────
// Importe un CSV (Bitwarden / Chrome / générique). Workflow :
// 1. Drop / pick fichier → lit en text → POST dryRun pour preview format
// 2. Confirm → POST sans dryRun → crée collections (si folder rempli) +
//    entries chiffrées côté serveur
//
// Parsing fait côté serveur (lib/csv-import.ts) — code DRY, validable.

type ImportPreview = {
  ok: true;
  format: "bitwarden" | "chrome" | "generic";
  imported: number;
  collectionsCreated: number;
  dryRun: boolean;
  sample: Array<{
    name: string;
    url: string | null;
    username: string | null;
    collectionName: string | null;
  }>;
};

function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      doPreview(text);
    };
    reader.onerror = () => setError("Lecture du fichier impossible.");
    reader.readAsText(file);
  }

  function doPreview(text: string) {
    startTransition(async () => {
      const res = await fetch("/api/vault/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, dryRun: true }),
      });
      const data = (await res.json().catch(() => null)) as
        | ImportPreview
        | { error?: string }
        | null;
      if (!res.ok || !data || !("ok" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Analyse du CSV impossible.",
        );
        return;
      }
      setPreview(data);
    });
  }

  function confirmImport() {
    if (!csv) return;
    startTransition(async () => {
      const res = await fetch("/api/vault/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, dryRun: false }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: true; imported?: number }
        | { error?: string }
        | null;
      if (!res.ok || !data || !("ok" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Import impossible.",
        );
        return;
      }
      onImported(data.imported ?? 0);
    });
  }

  const formatLabel = preview
    ? { bitwarden: "Bitwarden", chrome: "Chrome", generic: "Générique" }[preview.format]
    : null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">Importer un CSV</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <p className="help">
            Formats supportés : <strong>Bitwarden</strong>, <strong>Chrome</strong>,
            CSV générique. Le mot de passe est chiffré côté serveur avant
            stockage. La colonne <code className="code-mono">folder</code>
            (Bitwarden) crée automatiquement les collections.
          </p>

          {!preview && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Fichier CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                disabled={pending}
                className="input"
              />
            </div>
          )}

          {preview && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <div className="row-name" style={{ marginBottom: 8 }}>
                {fileName} <span className="chip" style={{ marginLeft: 6 }}>{formatLabel}</span>
              </div>
              <p className="help">
                <strong>{preview.imported}</strong> entrée(s) prête(s) à être
                importée(s).
              </p>
              <div className="row-meta" style={{ marginTop: 8 }}>
                Aperçu (5 premières) :
              </div>
              <ul className="help" style={{ paddingLeft: 18, marginTop: 6 }}>
                {preview.sample.map((e, i) => (
                  <li key={i}>
                    <strong>{e.name}</strong>
                    {e.username && <> · <span className="code-mono">{e.username}</span></>}
                    {e.collectionName && <> · <span className="chip">{e.collectionName}</span></>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
        </div>

        <div className="dialog-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            Annuler
          </button>
          {preview && (
            <button
              type="button"
              onClick={confirmImport}
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              {pending ? "Import en cours…" : `Importer ${preview.imported} entrée(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
