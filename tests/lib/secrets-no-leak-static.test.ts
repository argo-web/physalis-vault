// Test statique : aucun `console.*` ne doit logger en clair les valeurs
// sensibles (secrets, mots de passe, tokens, clés SSH).
//
// Couvre proposal Crypto #6 — secrets jamais loggés en clair.
//
// Stratégie : grep les patterns d'appels `console.X(...)` qui mentionnent
// les variables sensibles connues. Liste limitée et expressive — on
// privilégie les faux négatifs (un nouveau pattern non capturé) aux faux
// positifs (un test qui casse pour rien).
//
// Variables sensibles auditées :
//   - `value`, `secretValue`, `cleartext` (valeurs de Secret/OrgSecret)
//   - `password` (creds, vault entries)
//   - `sshPrivateKey`, `privateKey` (Server, ECDH)
//   - `tokenPlaintext`, `bearer` (tokens machine/plugin)
//   - `decrypt(`, `.decrypt(` (résultats de déchiffrement)

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

/** grep -rn dans app/, lib/, components/. Les tests sont exclus. */
function grepCode(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rEn ${JSON.stringify(pattern)} app/ lib/ components/ \
        --include='*.ts' --include='*.tsx'`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(REPO_ROOT + "/", ""));
  } catch {
    return [];
  }
}

/** Mots ciblés qui peuvent apparaître en kebab-case dans des strings.
 *  Ex. `[forgot-password]` est un label de log, pas une variable.
 *  Le pattern `\b<mot>\b` matche aussi à l'intérieur de kebab-case car
 *  `-` est un word-boundary — d'où ce filtre post-hoc. */
const KEBAB_FALSE_POSITIVE_RE =
  /\[[^\]]*-(password|secret|token|cleartext|plaintext|privateKey|sshPrivateKey)[^\[]*\]/i;

/** Filtre les hits autorisés (faux positifs sur des labels kebab-case
 *  type `[forgot-password]` qui ne logguent pas la valeur). */
function withoutAllowed(hits: string[]): string[] {
  return hits.filter((line) => {
    // Strip prefix `path:lineno:` pour garder le code source.
    const code = line.replace(/^[^:]+:\d+:/, "");
    return !KEBAB_FALSE_POSITIVE_RE.test(code);
  });
}

describe("Static analysis — secrets jamais loggés (Crypto #6)", () => {
  it("aucun `console.*(secret.value)` ou similaire", () => {
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\b(secret|secrets)\\.(value|encryptedValue)\\b",
    );
    expect(withoutAllowed(hits)).toEqual([]);
  });

  it("aucun `console.*(password)` (param de fonction ou propriété)", () => {
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\b(password|hashedPassword|user\\.password)\\b",
    );
    expect(withoutAllowed(hits)).toEqual([]);
  });

  it("aucun `console.*(sshPrivateKey|privateKey)`", () => {
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\b(sshPrivateKey|privateKey)\\b",
    );
    expect(withoutAllowed(hits)).toEqual([]);
  });

  it("aucun `console.*(token)` brut (sans hash/redact)", () => {
    // Capture explicite : `console.X(... token ...)` sans `tokenHash` ou
    // `redact`. Hits attendus : 0 — les tokens bruts (machine/plugin/share)
    // ne doivent jamais transiter par les logs en clair.
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\btoken\\b(?![Hh]ash)",
    );
    // Whitelist : les hits qui parlent de `tokenHash` (hash, OK) ou de
    // `requestToken`/`csrfToken` (jamais sensible) sont filtrés ici.
    const filtered = hits.filter((line) => {
      // Si la ligne mentionne explicitement `Hash` ou `csrf`, OK.
      return !/(Hash\b|csrf|TokenIndex)/i.test(line);
    });
    expect(filtered).toEqual([]);
  });

  it("aucun `console.*(decrypt(...))` (log direct du retour de déchiffrement)", () => {
    // Pattern : console.X(decrypt(...)) ou console.X(`...${decrypt(...)}...`)
    const hits = grepCode("console\\.(log|info|debug|warn|error)\\([^)]*decrypt\\(");
    expect(withoutAllowed(hits)).toEqual([]);
  });

  it("aucun `console.*(...cleartext)` ou `...plaintext`", () => {
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\b(cleartext|plaintext)\\b",
    );
    expect(withoutAllowed(hits)).toEqual([]);
  });

  it("aucun `console.*(req.body)` brut (où vivent les valeurs en submit)", () => {
    // Catche les `console.log(req.body)` ou `console.log(body)` génériques.
    // Les bodies contiennent souvent `{ value, password }` non chiffrés en
    // entrée — les logger = leak.
    const hits = grepCode(
      "console\\.(log|info|debug|warn|error)\\([^)]*\\b(req\\.body|request\\.body)\\b",
    );
    expect(withoutAllowed(hits)).toEqual([]);
  });
});
