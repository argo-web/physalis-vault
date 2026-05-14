// Helpers communs pour la validation et le shape des TeamVaultEntry.
// Reutilises par les routes org/* et project/* (logique identique sauf
// le check d'acces, gere par lib/vault-access.ts).
//
// Le coffre personnel (VaultEntry) reste autonome dans /api/vault/entries —
// pas de partage de code pour eviter de coupler deux modeles distincts.

import { NextResponse } from "next/server";
import { parseTotpInput } from "./otpauth-parse";

export const VAULT_LIMITS = {
  nameMax: 200,
  urlMax: 2048,
  usernameMax: 200,
  passwordMax: 4096,
  totpSecretMax: 512,
  tagMax: 50,
  tagsMax: 20,
} as const;

export function normalizeTags(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  if (input.length > VAULT_LIMITS.tagsMax) return null;
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) continue;
    if (t.length > VAULT_LIMITS.tagMax) return null;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export type EntryCreateBody = {
  name?: string;
  url?: string | null;
  username?: string | null;
  password?: string | null;
  totpSecret?: string | null;
  tags?: unknown;
  favorite?: boolean;
};

export type EntryPatchBody = {
  name?: string;
  url?: string | null;
  username?: string | null;
  password?: string | null;
  totpSecret?: string | null;
  tags?: unknown;
  favorite?: boolean;
  /** Deplace l'entry vers une autre TeamVaultCollection du MEME scope
   *  (org→org dans la meme org, project→project dans le meme projet).
   *  RBAC : EDITOR+ requis sur la collection cible. */
  targetCollectionId?: string;
};

/**
 * Valide un body de creation. Retourne les valeurs normalisees ou une
 * NextResponse 400.
 */
export function validateEntryCreate(body: EntryCreateBody | null):
  | {
      ok: true;
      name: string;
      url: string | null;
      username: string | null;
      password: string | null;
      totpSecret: string | null;
      tags: string[];
      favorite: boolean;
    }
  | { ok: false; error: NextResponse } {
  if (!body || typeof body.name !== "string") {
    return {
      ok: false,
      error: NextResponse.json({ error: "name is required" }, { status: 400 }),
    };
  }
  const name = body.name.trim();
  if (!name || name.length > VAULT_LIMITS.nameMax) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: `name must be 1-${VAULT_LIMITS.nameMax} chars` },
        { status: 400 },
      ),
    };
  }
  const url =
    typeof body.url === "string" && body.url.trim()
      ? body.url.trim().slice(0, VAULT_LIMITS.urlMax)
      : null;
  const username =
    typeof body.username === "string" && body.username.trim()
      ? body.username.trim().slice(0, VAULT_LIMITS.usernameMax)
      : null;
  const tags = normalizeTags(body.tags);
  if (tags === null) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: `tags must be a string array of <= ${VAULT_LIMITS.tagsMax} entries, each <= ${VAULT_LIMITS.tagMax} chars`,
        },
        { status: 400 },
      ),
    };
  }

  let password: string | null = null;
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length > VAULT_LIMITS.passwordMax) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: `password must be <= ${VAULT_LIMITS.passwordMax} chars` },
          { status: 400 },
        ),
      };
    }
    password = body.password;
  }

  let totpSecret: string | null = null;
  if (typeof body.totpSecret === "string" && body.totpSecret.length > 0) {
    if (body.totpSecret.length > VAULT_LIMITS.totpSecretMax) {
      return {
        ok: false,
        error: NextResponse.json(
          {
            error: `totpSecret must be <= ${VAULT_LIMITS.totpSecretMax} chars`,
          },
          { status: 400 },
        ),
      };
    }
    const parsed = parseTotpInput(body.totpSecret);
    if (!parsed) {
      return {
        ok: false,
        error: NextResponse.json(
          {
            error:
              "totpSecret must be a base32 secret or an otpauth:// URL",
          },
          { status: 400 },
        ),
      };
    }
    totpSecret = parsed;
  }

  return {
    ok: true,
    name,
    url,
    username,
    password,
    totpSecret,
    tags,
    favorite: body.favorite === true,
  };
}

/**
 * Valide un body PATCH partiel. Retourne les champs a modifier (uniquement
 * ceux presents dans le body) ou une NextResponse 400.
 */
export function validateEntryPatch(body: EntryPatchBody | null):
  | {
      ok: true;
      data: Partial<{
        name: string;
        url: string | null;
        username: string | null;
        password: string | null; // null = effacer, string = re-encrypt
        totpSecret: string | null; // null = effacer, string = re-encrypt
        tags: string[];
        favorite: boolean;
        targetCollectionId: string;
      }>;
      changed: string[];
    }
  | { ok: false; error: NextResponse } {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      error: NextResponse.json({ error: "Invalid body" }, { status: 400 }),
    };
  }

  const data: Partial<{
    name: string;
    url: string | null;
    username: string | null;
    password: string | null;
    totpSecret: string | null;
    tags: string[];
    favorite: boolean;
    targetCollectionId: string;
  }> = {};
  const changed: string[] = [];

  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v || v.length > VAULT_LIMITS.nameMax) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: `name must be 1-${VAULT_LIMITS.nameMax} chars` },
          { status: 400 },
        ),
      };
    }
    data.name = v;
    changed.push("name");
  }
  if ("url" in body) {
    if (body.url === null || body.url === "") {
      data.url = null;
    } else if (typeof body.url === "string") {
      data.url = body.url.trim().slice(0, VAULT_LIMITS.urlMax) || null;
    }
    changed.push("url");
  }
  if ("username" in body) {
    if (body.username === null || body.username === "") {
      data.username = null;
    } else if (typeof body.username === "string") {
      data.username =
        body.username.trim().slice(0, VAULT_LIMITS.usernameMax) || null;
    }
    changed.push("username");
  }
  if ("password" in body) {
    if (body.password === null || body.password === "") {
      data.password = null;
    } else if (typeof body.password === "string") {
      if (body.password.length > VAULT_LIMITS.passwordMax) {
        return {
          ok: false,
          error: NextResponse.json(
            { error: `password must be <= ${VAULT_LIMITS.passwordMax} chars` },
            { status: 400 },
          ),
        };
      }
      data.password = body.password;
    }
    changed.push("password");
  }
  if ("totpSecret" in body) {
    if (body.totpSecret === null || body.totpSecret === "") {
      data.totpSecret = null;
    } else if (typeof body.totpSecret === "string") {
      if (body.totpSecret.length > VAULT_LIMITS.totpSecretMax) {
        return {
          ok: false,
          error: NextResponse.json(
            {
              error: `totpSecret must be <= ${VAULT_LIMITS.totpSecretMax} chars`,
            },
            { status: 400 },
          ),
        };
      }
      const parsed = parseTotpInput(body.totpSecret);
      if (!parsed) {
        return {
          ok: false,
          error: NextResponse.json(
            {
              error:
                "totpSecret must be a base32 secret or an otpauth:// URL",
            },
            { status: 400 },
          ),
        };
      }
      data.totpSecret = parsed;
    }
    changed.push("totpSecret");
  }
  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) {
      return {
        ok: false,
        error: NextResponse.json(
          {
            error: `tags must be a string array of <= ${VAULT_LIMITS.tagsMax} entries, each <= ${VAULT_LIMITS.tagMax} chars`,
          },
          { status: 400 },
        ),
      };
    }
    data.tags = tags;
    changed.push("tags");
  }
  if (typeof body.favorite === "boolean") {
    data.favorite = body.favorite;
    changed.push("favorite");
  }
  if (typeof body.targetCollectionId === "string") {
    const v = body.targetCollectionId.trim();
    if (!v) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "targetCollectionId must be a non-empty string" },
          { status: 400 },
        ),
      };
    }
    data.targetCollectionId = v;
    changed.push("collection");
  }

  return { ok: true, data, changed };
}
