"use client";

// Dialog d'import bulk d'un .env vers les Secrets d'un environnement.
// Workflow en 2 etapes : (1) saisie + Analyser (dryRun), (2) preview +
// Importer (execute). On NE montre JAMAIS les valeurs des secrets dans
// la preview — uniquement les cles.

import { useState, useTransition } from "react";
import {
  SECRET_CATEGORIES,
  SECRET_CATEGORY_LABELS,
  UNCATEGORIZED_LABEL,
  type SecretCategory,
} from "@/lib/categories";

type ConflictPolicy = "skip" | "overwrite";

type DryRunResponse = {
  dryRun: true;
  summary: {
    parsed: number;
    toCreate: number;
    toUpdate: number;
    toSkip: number;
    invalid: number;
    parseErrors: number;
  };
  keys: {
    toCreate: string[];
    toUpdate: string[];
    toSkip: string[];
    invalid: { key: string; reason: string }[];
  };
  parseErrors: { line: number; reason: string }[];
};

type ExecuteResponse = {
  dryRun: false;
  summary: {
    parsed: number;
    created: number;
    updated: number;
    skipped: number;
    invalid: number;
    parseErrors: number;
    failed: number;
  };
  keys: {
    created: string[];
    updated: string[];
    skipped: string[];
    invalid: { key: string; reason: string }[];
    failed: { key: string; reason: string }[];
  };
  parseErrors: { line: number; reason: string }[];
};

const ENV_TEXT_MAX = 100 * 1024;

export default function SecretsImportDialog({
  slug,
  env,
  onClose,
  onImported,
}: {
  slug: string;
  env: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [envText, setEnvText] = useState("");
  const [conflictPolicy, setConflictPolicy] =
    useState<ConflictPolicy>("skip");
  const [defaultCategory, setDefaultCategory] = useState<SecretCategory | "">(
    "",
  );
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const url = `/api/projects/${slug}/${env}/secrets/import`;

  function buildBody(dryRun: boolean) {
    return JSON.stringify({
      envText,
      conflictPolicy,
      dryRun,
      defaultCategory: defaultCategory || null,
    });
  }

  function analyze() {
    setError(null);
    if (!envText.trim()) {
      setError("Le contenu .env est vide.");
      return;
    }
    if (envText.length > ENV_TEXT_MAX) {
      setError(`Contenu trop volumineux (max ${Math.round(ENV_TEXT_MAX / 1024)} KB).`);
      return;
    }
    startTransition(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildBody(true),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Analyse impossible.");
        return;
      }
      setPreview((await res.json()) as DryRunResponse);
    });
  }

  function execute() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildBody(false),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Import impossible.");
        return;
      }
      setResult((await res.json()) as ExecuteResponse);
      onImported();
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > ENV_TEXT_MAX) {
      setError(`Fichier trop volumineux (max ${Math.round(ENV_TEXT_MAX / 1024)} KB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEnvText(String(reader.result ?? ""));
      // Reset preview/result si le user recharge un autre fichier.
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file);
  }

  // ─── Etape 3 : resultat final ─────────────────────────────────────
  if (result) {
    return (
      <div className="dialog-overlay" onClick={onClose}>
        <div
          className="dialog dialog-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-header">
            <h2 className="dialog-title">Import terminé</h2>
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
            <ResultSummary result={result} />
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary btn-sm"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Etape 1 + 2 : saisie + (optionnellement) preview ─────────────
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-lg" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            Importer un .env — <span className="code-mono">{env}</span>
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
        <div className="dialog-body">
          <div className="field">
            <label htmlFor="envText">Contenu .env</label>
            <textarea
              id="envText"
              value={envText}
              onChange={(e) => {
                setEnvText(e.target.value);
                setPreview(null);
              }}
              placeholder="DATABASE_URL=postgres://...&#10;API_KEY=..."
              className="textarea input-mono"
              rows={10}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="help">
              Colle ton .env ou charge un fichier. Limite&nbsp;:{" "}
              {Math.round(ENV_TEXT_MAX / 1024)} KB.{" "}
              <label
                style={{
                  display: "inline-block",
                  cursor: "pointer",
                  color: "var(--accent)",
                  textDecoration: "underline",
                }}
              >
                Charger un fichier
                <input
                  type="file"
                  accept=".env,text/plain"
                  onChange={onFile}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="conflictPolicy">En cas de doublon</label>
              <select
                id="conflictPolicy"
                value={conflictPolicy}
                onChange={(e) => {
                  setConflictPolicy(e.target.value as ConflictPolicy);
                  setPreview(null);
                }}
                className="select"
              >
                <option value="skip">
                  Ignorer (ne pas écraser les valeurs existantes)
                </option>
                <option value="overwrite">
                  Écraser (avec snapshot dans l&apos;historique)
                </option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="defaultCategory">Catégorie (optionnel)</label>
              <select
                id="defaultCategory"
                value={defaultCategory}
                onChange={(e) =>
                  setDefaultCategory(e.target.value as SecretCategory | "")
                }
                className="select"
              >
                <option value="">{UNCATEGORIZED_LABEL}</option>
                {SECRET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SECRET_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          {preview && <PreviewSummary preview={preview} />}
        </div>

        <div className="dialog-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            Annuler
          </button>
          {!preview ? (
            <button
              type="button"
              onClick={analyze}
              disabled={pending || !envText.trim()}
              className="btn btn-primary btn-sm"
            >
              {pending ? "Analyse…" : "Analyser"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="btn btn-ghost btn-sm"
                disabled={pending}
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={execute}
                disabled={
                  pending ||
                  preview.summary.toCreate + preview.summary.toUpdate === 0
                }
                className="btn btn-primary btn-sm"
              >
                {pending
                  ? "Import…"
                  : `Importer ${
                      preview.summary.toCreate + preview.summary.toUpdate
                    } secret${
                      preview.summary.toCreate + preview.summary.toUpdate === 1
                        ? ""
                        : "s"
                    }`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: DryRunResponse }) {
  const { summary, keys, parseErrors } = preview;
  return (
    <div
      style={{
        background: "var(--code-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>Analyse du contenu</div>
      <div className="row-meta">
        <span>
          <strong>{summary.parsed}</strong> entrée
          {summary.parsed === 1 ? "" : "s"} lue{summary.parsed === 1 ? "" : "s"}
        </span>
        <span style={{ color: "var(--success)" }}>
          ✓ {summary.toCreate} nouvelle{summary.toCreate === 1 ? "" : "s"}
        </span>
        {summary.toUpdate > 0 && (
          <span style={{ color: "var(--accent)" }}>
            ↻ {summary.toUpdate} à écraser
          </span>
        )}
        {summary.toSkip > 0 && (
          <span style={{ color: "var(--muted)" }}>
            ⊘ {summary.toSkip} ignorée{summary.toSkip === 1 ? "" : "s"}
          </span>
        )}
        {summary.invalid > 0 && (
          <span style={{ color: "var(--danger)" }}>
            ⚠ {summary.invalid} nom{summary.invalid === 1 ? "" : "s"} invalide
            {summary.invalid === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <KeyList label="Nouvelles" keys={keys.toCreate} />
      <KeyList
        label="Seront écrasées"
        keys={keys.toUpdate}
        color="var(--accent)"
      />
      <KeyList label="Ignorées (déjà existantes)" keys={keys.toSkip} />
      {keys.invalid.length > 0 && (
        <div>
          <div className="help" style={{ fontWeight: 600, marginBottom: 4 }}>
            Noms invalides
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {keys.invalid.map((it, idx) => (
              <li key={`${it.key}-${idx}`}>
                <span className="code-mono">{it.key}</span> — {it.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {parseErrors.length > 0 && (
        <div>
          <div className="help" style={{ fontWeight: 600, marginBottom: 4 }}>
            Avertissements parser
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {parseErrors.slice(0, 10).map((e, idx) => (
              <li key={`${e.line}-${idx}`}>
                Ligne {e.line} — {e.reason}
              </li>
            ))}
            {parseErrors.length > 10 && (
              <li>…et {parseErrors.length - 10} autre(s)</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: ExecuteResponse }) {
  const { summary, keys } = result;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row-meta">
        <span style={{ color: "var(--success)" }}>
          ✓ {summary.created} créé{summary.created === 1 ? "" : "s"}
        </span>
        {summary.updated > 0 && (
          <span style={{ color: "var(--accent)" }}>
            ↻ {summary.updated} écrasé{summary.updated === 1 ? "" : "s"}
          </span>
        )}
        {summary.skipped > 0 && (
          <span style={{ color: "var(--muted)" }}>
            ⊘ {summary.skipped} ignoré{summary.skipped === 1 ? "" : "s"}
          </span>
        )}
        {summary.invalid > 0 && (
          <span style={{ color: "var(--danger)" }}>
            ⚠ {summary.invalid} invalide{summary.invalid === 1 ? "" : "s"}
          </span>
        )}
        {summary.failed > 0 && (
          <span style={{ color: "var(--danger)" }}>
            ✗ {summary.failed} échec{summary.failed === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <KeyList label="Créées" keys={keys.created} />
      <KeyList label="Écrasées" keys={keys.updated} color="var(--accent)" />
      {keys.failed.length > 0 && (
        <div>
          <div className="help" style={{ fontWeight: 600, marginBottom: 4 }}>
            Échecs
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {keys.failed.map((it, idx) => (
              <li key={`${it.key}-${idx}`}>
                <span className="code-mono">{it.key}</span> — {it.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KeyList({
  label,
  keys,
  color,
}: {
  label: string;
  keys: string[];
  color?: string;
}) {
  if (keys.length === 0) return null;
  const display = keys.slice(0, 30);
  return (
    <div>
      <div
        className="help"
        style={{ fontWeight: 600, marginBottom: 4, color }}
      >
        {label} ({keys.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {display.map((k) => (
          <span key={k} className="chip code-mono">
            {k}
          </span>
        ))}
        {keys.length > display.length && (
          <span className="chip">+{keys.length - display.length}</span>
        )}
      </div>
    </div>
  );
}
