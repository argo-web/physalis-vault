// Test statique : l'audit log (`accessLog`) doit être strictement
// append-only. Aucun appel `accessLog.update/delete/upsert/deleteMany/
// updateMany` ne doit exister hors d'un éventuel script de purge admin
// (à autoriser explicitement si introduit un jour).
//
// Couvre proposal Audit #2 — l'invariant d'immuabilité est garanti par
// l'absence de code qui muterait des entrées existantes. Test au niveau
// du code source pour catcher les régressions futures (vs un test HTTP
// qui ne couvrirait que les URLs qu'on pense à essayer).

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

/** Cherche dans app/, lib/, components/ — les seuls dossiers où peut
 *  vivre du code qui écrirait dans l'audit log. */
function grepCode(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rn ${JSON.stringify(pattern)} app/ lib/ components/ \
        --include='*.ts' --include='*.tsx'`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(REPO_ROOT + "/", ""));
  } catch {
    // grep retourne exit code 1 si aucune ligne ne matche.
    return [];
  }
}

describe("Audit log immutability — code-level invariant (Audit #2)", () => {
  it("aucun appel `accessLog.update` ne doit exister", () => {
    const hits = grepCode("accessLog\\.update");
    expect(hits).toEqual([]);
  });

  it("aucun appel `accessLog.delete` ne doit exister", () => {
    const hits = grepCode("accessLog\\.delete");
    expect(hits).toEqual([]);
  });

  it("aucun appel `accessLog.upsert` ne doit exister", () => {
    const hits = grepCode("accessLog\\.upsert");
    expect(hits).toEqual([]);
  });

  it("aucun appel `accessLog.deleteMany` ne doit exister", () => {
    const hits = grepCode("accessLog\\.deleteMany");
    expect(hits).toEqual([]);
  });

  it("aucun appel `accessLog.updateMany` ne doit exister", () => {
    const hits = grepCode("accessLog\\.updateMany");
    expect(hits).toEqual([]);
  });

  it("aucune raw query SQL n'écrit dans `AccessLog` (UPDATE/DELETE)", () => {
    // Cherche les SQL bruts via $queryRaw* ou $executeRaw* qui mentionneraient
    // AccessLog en mutation. Whitelist : 0 hit attendu.
    const updates = grepCode('UPDATE "AccessLog"');
    const deletes = grepCode('DELETE FROM "AccessLog"');
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("le seul appel `accessLog.create` vit dans `lib/audit.ts`", () => {
    const hits = grepCode("accessLog\\.create");
    // Au moins un hit, et tous dans lib/audit.ts (ou un test).
    expect(hits.length).toBeGreaterThan(0);
    const offendingFiles = hits.filter(
      (line) => !line.startsWith("lib/audit.ts:"),
    );
    expect(offendingFiles).toEqual([]);
  });
});
