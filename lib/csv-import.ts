// Parsing CSV minimaliste pour l'import du coffre perso (V2.0).
//
// Pas de dépendance — RFC 4180 compliant (gère les quotes, escapes "" et
// les newlines à l'intérieur des champs quotés). Volume ciblé < 5000
// lignes (export typique d'un BW perso) → perf O(n) suffisante.
//
// Détection auto du format : Bitwarden / Chrome / générique. Mapping
// vers la shape canonique :
//   { name, url, username, password, totpSecret, collectionName, favorite }

export type ImportedEntry = {
  name: string;
  url: string | null;
  username: string | null;
  password: string | null;
  totpSecret: string | null;
  collectionName: string | null;
  favorite: boolean;
};

export type ImportFormat = "bitwarden" | "chrome" | "generic";

export type ParseResult =
  | { ok: true; format: ImportFormat; entries: ImportedEntry[] }
  | { ok: false; error: string };

const NAME_MAX = 200;
const URL_MAX = 2048;
const USERNAME_MAX = 200;
const PASSWORD_MAX = 4096;
const TOTP_MAX = 512;
const COLLECTION_MAX = 80;
const ROW_LIMIT = 5000;

// ─── Tokenizer RFC 4180 ─────────────────────────────────────────────

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // CRLF or lone CR → end of row
      if (input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush dernier champ / dernière ligne (si pas de newline final)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Skip lignes vides finales
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
    else break;
  }

  return rows;
}

// ─── Format detection ───────────────────────────────────────────────

function detectFormat(header: string[]): ImportFormat {
  const lower = header.map((h) => h.trim().toLowerCase());
  if (lower.includes("login_password") || lower.includes("login_username")) {
    return "bitwarden";
  }
  // Chrome: "name,url,username,password,note"
  if (lower[0] === "name" && lower.includes("url") && lower.includes("password")) {
    return "chrome";
  }
  return "generic";
}

// ─── Mappers par format ──────────────────────────────────────────────

function buildIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    idx[header[i].trim().toLowerCase()] = i;
  }
  return idx;
}

function pick(row: string[], idx: Record<string, number>, key: string): string {
  const i = idx[key];
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function nonEmptyOrNull(s: string, max: number): string | null {
  const trimmed = s.trim();
  return trimmed ? clamp(trimmed, max) : null;
}

function mapBitwarden(row: string[], idx: Record<string, number>): ImportedEntry | null {
  // Bitwarden type=login → mappable. Ignore cards/identities/notes.
  const type = pick(row, idx, "type").toLowerCase();
  if (type && type !== "login") return null;

  const name = pick(row, idx, "name");
  if (!name) return null;

  return {
    name: clamp(name, NAME_MAX),
    url: nonEmptyOrNull(pick(row, idx, "login_uri"), URL_MAX),
    username: nonEmptyOrNull(pick(row, idx, "login_username"), USERNAME_MAX),
    password: nonEmptyOrNull(pick(row, idx, "login_password"), PASSWORD_MAX),
    totpSecret: nonEmptyOrNull(pick(row, idx, "login_totp"), TOTP_MAX),
    collectionName: nonEmptyOrNull(pick(row, idx, "folder"), COLLECTION_MAX),
    favorite: pick(row, idx, "favorite") === "1",
  };
}

function mapChrome(row: string[], idx: Record<string, number>): ImportedEntry | null {
  const name = pick(row, idx, "name");
  if (!name) return null;

  return {
    name: clamp(name, NAME_MAX),
    url: nonEmptyOrNull(pick(row, idx, "url"), URL_MAX),
    username: nonEmptyOrNull(pick(row, idx, "username"), USERNAME_MAX),
    password: nonEmptyOrNull(pick(row, idx, "password"), PASSWORD_MAX),
    totpSecret: null,
    collectionName: null,
    favorite: false,
  };
}

function mapGeneric(row: string[], idx: Record<string, number>): ImportedEntry | null {
  // Heuristique : prend le premier champ non vide comme name si pas
  // de header "name". Cherche url/username/password/totp/folder en
  // best-effort. Reste tolérant pour ne pas planter sur des CSV exotiques.
  let name =
    pick(row, idx, "name") ||
    pick(row, idx, "title") ||
    pick(row, idx, "site") ||
    "";
  if (!name) {
    name = (row[0] ?? "").trim();
  }
  if (!name) return null;

  const url =
    pick(row, idx, "url") ||
    pick(row, idx, "uri") ||
    pick(row, idx, "website") ||
    pick(row, idx, "site");
  const username =
    pick(row, idx, "username") ||
    pick(row, idx, "user") ||
    pick(row, idx, "login") ||
    pick(row, idx, "email");
  const password =
    pick(row, idx, "password") ||
    pick(row, idx, "pass") ||
    pick(row, idx, "pwd");
  const totp =
    pick(row, idx, "totp") ||
    pick(row, idx, "otp") ||
    pick(row, idx, "otpauth");
  const folder =
    pick(row, idx, "folder") ||
    pick(row, idx, "category") ||
    pick(row, idx, "group");

  return {
    name: clamp(name, NAME_MAX),
    url: nonEmptyOrNull(url, URL_MAX),
    username: nonEmptyOrNull(username, USERNAME_MAX),
    password: nonEmptyOrNull(password, PASSWORD_MAX),
    totpSecret: nonEmptyOrNull(totp, TOTP_MAX),
    collectionName: nonEmptyOrNull(folder, COLLECTION_MAX),
    favorite: false,
  };
}

// ─── Top-level entry point ──────────────────────────────────────────

export function parseImport(input: string): ParseResult {
  const rows = parseCsv(input.replace(/^﻿/, "")); // strip BOM
  if (rows.length < 2) {
    return { ok: false, error: "CSV vide ou sans données." };
  }
  if (rows.length - 1 > ROW_LIMIT) {
    return {
      ok: false,
      error: `Trop d'entrées (${rows.length - 1}). Limite : ${ROW_LIMIT}.`,
    };
  }

  const header = rows[0];
  const format = detectFormat(header);
  const idx = buildIndex(header);

  const mapper =
    format === "bitwarden" ? mapBitwarden : format === "chrome" ? mapChrome : mapGeneric;

  const entries: ImportedEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const mapped = mapper(rows[r], idx);
    if (mapped) entries.push(mapped);
  }

  if (entries.length === 0) {
    return { ok: false, error: "Aucune entrée importable trouvée." };
  }

  return { ok: true, format, entries };
}
