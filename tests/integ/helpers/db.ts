// Helpers DB direct pour les tests qui ont besoin de seeder ou d'inspecter
// la base sous-jacente. Utilise `docker compose exec db psql` car la DB de
// la stack prod n'est pas exposée sur l'hôte (réseau internal).

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const DB_CONTAINER = process.env.TEST_DB_CONTAINER ?? "secretvault-db";

/**
 * Exécute une requête SQL via psql dans le conteneur DB. Retourne stdout
 * (mode tuples-only `-At`, donc lignes sans en-tête, séparées par `\n`,
 * colonnes séparées par `|`).
 */
export async function execSql(sql: string): Promise<string> {
  // -A: unaligned, -t: tuples only, -X: ignore .psqlrc
  const cmd = [
    "docker",
    "exec",
    DB_CONTAINER,
    "psql",
    "-U",
    "secretvault",
    "-d",
    "secretvault",
    "-AtX",
    "-c",
    sql,
  ];
  const escaped = cmd
    .map((arg) => (arg.includes(" ") ? `'${arg.replace(/'/g, "'\\''")}'` : arg))
    .join(" ");
  const { stdout, stderr } = await execAsync(escaped, { maxBuffer: 10_000_000 });
  if (stderr.trim()) {
    // psql écrit certaines erreurs sur stderr ; les remonter.
    throw new Error(`psql stderr: ${stderr}`);
  }
  return stdout.trim();
}

/**
 * SELECT qui retourne un tableau de lignes (chaque ligne = string entière,
 * à splitter sur `|` si plusieurs colonnes).
 */
export async function selectRows(sql: string): Promise<string[]> {
  const out = await execSql(sql);
  return out.length === 0 ? [] : out.split("\n");
}

export async function execSqlValue(sql: string): Promise<string> {
  const out = await execSql(sql);
  return out;
}
