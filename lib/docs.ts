// Loader pour la documentation utilisateur de Physalis.
//
// Source : fichiers markdown dans `docs/documentation/<locale>/<slug>.md`.
// Chaque fichier a un frontmatter YAML-like minimal :
//
//   ---
//   title: ...
//   order: 1
//   icon: 🚀
//   summary: ...
//   ---
//
// Le slug exposé dans l'URL (`/docs/<slug>`) est le nom du fichier sans
// extension ET sans préfixe `NN-`. La locale détermine le sous-dossier.
// Fallback : es → en (pas encore de traduction ES).
//
// Note : cache en mémoire process-wide, keyed par `locale:slug`.

import { readFile, readdir, access } from "node:fs/promises";
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
  /** HTML rendu depuis le markdown. */
  html: string;
};

const DOCS_ROOT = path.join(process.cwd(), "docs", "documentation");
const SLUG_PREFIX_RE = /^\d+-/;

// Fallback chain : if a locale folder doesn't exist, fall back to "en".
const FALLBACK: Record<string, string> = {};

const listCache = new Map<string, DocPage[]>();
const pageCache = new Map<string, DocPageWithContent>();

async function resolveLocale(locale: string): Promise<string> {
  const dir = path.join(DOCS_ROOT, locale);
  try {
    await access(dir);
    return locale;
  } catch {
    return FALLBACK[locale] ?? "en";
  }
}

function fileBaseToSlug(base: string): string {
  return base.replace(/\.md$/, "").replace(SLUG_PREFIX_RE, "");
}

function parseFrontmatter(raw: string): { meta: DocFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Frontmatter missing: `---\\n…\\n---` required at top");
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
    throw new Error("Incomplete frontmatter: title, order, icon, summary all required");
  }
  return { meta: meta as DocFrontmatter, body };
}

export async function listDocPages(locale = "en"): Promise<DocPage[]> {
  const resolved = await resolveLocale(locale);
  const cacheKey = resolved;
  const cached = listCache.get(cacheKey);
  if (cached) return cached;

  const dir = path.join(DOCS_ROOT, resolved);
  const entries = await readdir(dir);
  const pages: DocPage[] = [];
  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const raw = await readFile(path.join(dir, file), "utf8");
    const { meta } = parseFrontmatter(raw);
    pages.push({ ...meta, slug: fileBaseToSlug(file) });
  }
  pages.sort((a, b) => a.order - b.order);
  listCache.set(cacheKey, pages);
  return pages;
}

export async function getDocPage(
  slug: string,
  locale = "en",
): Promise<DocPageWithContent | null> {
  const resolved = await resolveLocale(locale);
  const cacheKey = `${resolved}:${slug}`;
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  const dir = path.join(DOCS_ROOT, resolved);
  const entries = await readdir(dir);
  const file = entries.find(
    (f) => f.endsWith(".md") && fileBaseToSlug(f) === slug,
  );
  if (!file) return null;
  const raw = await readFile(path.join(dir, file), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const html = await marked.parse(body, { gfm: true, breaks: false });
  const page: DocPageWithContent = { ...meta, slug, html };
  pageCache.set(cacheKey, page);
  return page;
}

/** Slugs canoniques (basés sur EN, identiques dans toutes les locales). */
export async function listDocSlugs(): Promise<string[]> {
  const pages = await listDocPages("en");
  return pages.map((p) => p.slug);
}
