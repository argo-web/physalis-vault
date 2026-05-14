"use client";

// Dialog d'import CSV vers une TeamVaultCollection. Reutilise le pattern
// du ImportDialog perso (vault-panel.tsx :1864) mais dedie au team
// vault — l'URL d'import est calculee depuis `basePath` qui pointe deja
// vers la collection cible. Workflow : (1) selection fichier (lecture
// FileReader cote client + appel dryRun pour preview) → (2) confirme
// l'import.

import { useState, useTransition } from "react";

type ImportFormat = "bitwarden" | "chrome" | "generic";

type SampleEntry = {
  name: string;
  url: string | null;
  username: string | null;
  password: string | null;
  totpSecret: string | null;
  collectionName: string | null;
  favorite: boolean;
};

type ImportPreview = {
  ok: true;
  format: ImportFormat;
  imported: number;
  dryRun: true;
  sample: SampleEntry[];
};

export default function TeamVaultImportDialog({
  basePath,
  onClose,
  onImported,
}: {
  basePath: string; // ex: /api/vault/org/foo/collections/bar
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const importUrl = `${basePath}/import`;

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
      const res = await fetch(importUrl, {
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
      const res = await fetch(importUrl, {
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
    ? { bitwarden: "Bitwarden", chrome: "Chrome", generic: "Générique" }[
        preview.format
      ]
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
            Formats supportés&nbsp;: <strong>Bitwarden</strong>,{" "}
            <strong>Chrome</strong>, CSV générique. Les mots de passe sont
            chiffrés côté serveur avant stockage. Les entrées sont créées
            dans cette collection ; la colonne{" "}
            <code className="code-mono">folder</code> (si présente) est
            conservée comme <strong>tag</strong>.
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
                {fileName}{" "}
                <span className="chip" style={{ marginLeft: 6 }}>
                  {formatLabel}
                </span>
              </div>
              <p className="help">
                <strong>{preview.imported}</strong> entrée(s) prête(s) à être
                importée(s).
              </p>
              <div className="row-meta" style={{ marginTop: 8 }}>
                Aperçu (5 premières)&nbsp;:
              </div>
              <ul className="help" style={{ paddingLeft: 18, marginTop: 6 }}>
                {preview.sample.map((e, i) => (
                  <li key={i}>
                    <strong>{e.name}</strong>
                    {e.username && (
                      <>
                        {" "}·{" "}
                        <span className="code-mono">{e.username}</span>
                      </>
                    )}
                    {e.collectionName && (
                      <>
                        {" "}·{" "}
                        <span className="chip">{e.collectionName}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="error-text" style={{ marginTop: 10 }}>
              {error}
            </p>
          )}
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
              {pending
                ? "Import en cours…"
                : `Importer ${preview.imported} entrée(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
