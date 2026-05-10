// Audit statique des variables `NEXT_PUBLIC_*` (exposées au bundle client).
//
// Couvre proposal Infra #3 (`.env` non exposé client) + #4 (NEXT_PUBLIC_*
// sans données sensibles).
//
// Règle Next.js : toute variable d'env préfixée `NEXT_PUBLIC_` est inlinée
// dans le bundle JS exposé au navigateur. Une fuite de secret via cette
// voie est silencieuse et catastrophique.
//
// Ce test :
//   - Liste toutes les références à `NEXT_PUBLIC_*` dans le code source
//   - Vérifie qu'aucune ne contient un suffixe sensible (_KEY, _SECRET,
//     _PASSWORD, _TOKEN, _PAT, _PRIVATE, _CREDENTIAL)
//   - Vérifie .env.example pour cohérence
//
// Fail si une variable suspecte apparaît — l'auteur doit prouver que ce
// nom est légitime (et soit, ajouter à WHITELIST avec justification).

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

const SENSITIVE_SUFFIXES = [
  "_KEY",
  "_SECRET",
  "_PASSWORD",
  "_PWD",
  "_TOKEN",
  "_PAT",
  "_PRIVATE",
  "_CREDENTIAL",
  "_CREDENTIALS",
  "_API_KEY",
  "_AUTH",
];

/** Whitelist des `NEXT_PUBLIC_*` qui matchent un pattern sensible MAIS
 *  qui sont légitimes (ex. une URL d'API publique, pas un secret). */
const WHITELIST: string[] = [
  // Aucun pour l'instant. Ajouter avec un commentaire qui explique
  // pourquoi le nom contient un suffixe sensible (ex. NEXT_PUBLIC_AUTH_URL
  // est OK car c'est juste une URL).
];

function grepCode(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rEon ${JSON.stringify(pattern)} app/ lib/ components/ \
        --include='*.ts' --include='*.tsx'`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Extrait les noms uniques de variables `NEXT_PUBLIC_*` référencées dans le code. */
function extractNextPublicVars(): Set<string> {
  const lines = grepCode("NEXT_PUBLIC_[A-Z_]+");
  const names = new Set<string>();
  const re = /\bNEXT_PUBLIC_[A-Z_]+\b/g;
  for (const line of lines) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      names.add(m[0]);
    }
  }
  return names;
}

describe("NEXT_PUBLIC audit (Infra #3, #4)", () => {
  it("aucun `NEXT_PUBLIC_*` n'a un suffixe sensible (_KEY, _SECRET, _TOKEN, ...)", () => {
    const vars = extractNextPublicVars();
    const offenders: string[] = [];

    for (const name of vars) {
      if (WHITELIST.includes(name)) continue;
      const upper = name.toUpperCase();
      const matched = SENSITIVE_SUFFIXES.find(
        (suf) => upper.endsWith(suf) || upper.includes(suf + "_"),
      );
      if (matched) {
        offenders.push(`${name} (matche le suffixe sensible '${matched}')`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it(".env.example ne définit aucun `NEXT_PUBLIC_*` avec un suffixe sensible", () => {
    const envExamplePath = resolve(REPO_ROOT, ".env.example");
    if (!existsSync(envExamplePath)) {
      // Pas d'.env.example → rien à tester côté file (l'audit code suffit).
      return;
    }
    const content = readFileSync(envExamplePath, "utf8");
    const offenders: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;
      const m = trimmed.match(/^(NEXT_PUBLIC_[A-Z_]+)\s*=/);
      if (!m) continue;
      const name = m[1];
      if (WHITELIST.includes(name)) continue;
      const upper = name.toUpperCase();
      const matched = SENSITIVE_SUFFIXES.find(
        (suf) => upper.endsWith(suf) || upper.includes(suf + "_"),
      );
      if (matched) {
        offenders.push(`${name} (matche '${matched}')`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("aucune assignation `NEXT_PUBLIC_*` directement avec une valeur littérale longue (suspect)", () => {
    // Catche les cas où quelqu'un aurait fait `NEXT_PUBLIC_FOO = "very-long-secret-base64..."`
    // dans le code source. Heuristique : valeur littérale > 40 chars suspecte.
    const lines = grepCode(
      "NEXT_PUBLIC_[A-Z_]+\\s*[:=]\\s*[\"'][^\"']{40,}[\"']",
    );
    expect(lines).toEqual([]);
  });

  it("ENCRYPTION_KEY n'est jamais préfixé NEXT_PUBLIC", () => {
    // Sanity dédié à la clé maître AES-256.
    const hits = grepCode("NEXT_PUBLIC_[A-Z_]*ENCRYPTION");
    expect(hits).toEqual([]);
  });

  it("DATABASE_URL n'est jamais préfixé NEXT_PUBLIC", () => {
    const hits = grepCode("NEXT_PUBLIC_DATABASE");
    expect(hits).toEqual([]);
  });
});
