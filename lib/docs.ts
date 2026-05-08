// Loader pour la documentation utilisateur de Physalis.
//
// Source : fichiers markdown dans `docs/documentation/<slug>.md` à la racine
// du repo. Chaque fichier a un frontmatter YAML-like minimal :
//
//   ---
//   title: ...
//   order: 1
//   icon: 🚀
//   summary: ...
//   ---
//
// Le slug exposé dans l'URL (`/docs/<slug>`) est le nom du fichier sans
// extension ET sans préfixe `NN-` (les préfixes ne servent qu'à l'ordre
// alphabétique sur le filesystem, l'ordre réel est piloté par `order`).
//
// Note : cache en mémoire process-wide. En dev (HMR), Next.js recrée le
// process à chaque modif de fichier source — le cache se reset tout seul.
// En prod, les fichiers markdown sont figés dans l'image Docker, donc le
// cache éternel est correct.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

export type DocFrontmatter = {
  title: string;
  order: number;
  icon: string;
  summary: string;
};

export type DocPage = DocFrontmatter & {
  slug: string;
};

export type DocPageWithContent = DocPage & {
  /** HTML rendu depuis le markdown (déjà sanitizé via marked, source de confiance). */
  html: string;
};

const DOCS_DIR = path.join(process.cwd(), "docs", "documentation");
const SLUG_PREFIX_RE = /^\d+-/;

let listCache: DocPage[] | null = null;
const pageCache = new Map<string, DocPageWithContent>();

function fileBaseToSlug(base: string): string {
  return base.replace(/\.md$/, "").replace(SLUG_PREFIX_RE, "");
}

function parseFrontmatter(raw: string): { meta: DocFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Frontmatter manquant : `---\\n…\\n---` requis en tête");
  }
  const [, header, body] = match;
  const meta: Partial<DocFrontmatter> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "order") {
      meta.order = Number(value);
    } else if (key === "title" || key === "icon" || key === "summary") {
      meta[key] = value;
    }
  }
  if (!meta.title || meta.order === undefined || !meta.icon || !meta.summary) {
    throw new Error(
      "Frontmatter incomplet : title, order, icon, summary tous requis",
    );
  }
  return { meta: meta as DocFrontmatter, body };
}

export async function listDocPages(): Promise<DocPage[]> {
  if (listCache) return listCache;
  const entries = await readdir(DOCS_DIR);
  const pages: DocPage[] = [];
  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const raw = await readFile(path.join(DOCS_DIR, file), "utf8");
    const { meta } = parseFrontmatter(raw);
    pages.push({ ...meta, slug: fileBaseToSlug(file) });
  }
  pages.sort((a, b) => a.order - b.order);
  listCache = pages;
  return pages;
}

export async function getDocPage(
  slug: string,
): Promise<DocPageWithContent | null> {
  const cached = pageCache.get(slug);
  if (cached) return cached;
  // On retrouve le fichier en re-listant : un slug `coffres` peut correspondre
  // à `05-coffres.md`. Pas de mapping séparé pour éviter une 2e source de vérité.
  const entries = await readdir(DOCS_DIR);
  const file = entries.find(
    (f) => f.endsWith(".md") && fileBaseToSlug(f) === slug,
  );
  if (!file) return null;
  const raw = await readFile(path.join(DOCS_DIR, file), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const html = await marked.parse(body, { gfm: true, breaks: false });
  const page: DocPageWithContent = { ...meta, slug, html };
  pageCache.set(slug, page);
  return page;
}
