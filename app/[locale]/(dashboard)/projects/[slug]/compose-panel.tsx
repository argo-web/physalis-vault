"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ProjectRole } from "@prisma/client";

const ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export default function ComposePanel({
  slug,
  env,
  role,
}: {
  slug: string;
  env: string;
  role: ProjectRole;
}) {
  const t = useTranslations("projects.compose");
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.EDITOR;

  const [content, setContent] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(
      `/api/projects/${slug}/environments/${encodeURIComponent(env)}`,
    );
    if (!res.ok) {
      setError("Erreur de chargement.");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      environment: { dockerCompose: string | null };
    };
    const value = data.environment.dockerCompose ?? "";
    setContent(value);
    setOriginal(value);
    setLoading(false);
  }, [slug, env]);

  useEffect(() => {
    setSavedAt(null);
    load();
  }, [load]);

  const dirty = content !== original;

  function save() {
    setError(null);
    startSaving(async () => {
      const res = await fetch(
        `/api/projects/${slug}/environments/${encodeURIComponent(env)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dockerCompose: content }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      setOriginal(content);
      setSavedAt(new Date());
    });
  }

  function reset() {
    setContent(original);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-header">
        <h2 className="section-title">
          {t("title", { env })}
        </h2>
        {savedAt && !dirty && (
          <span className="help">
            {t("saved", { time: savedAt.toLocaleTimeString() })}
          </span>
        )}
      </div>

      {loading ? (
        <p className="help">Chargement…</p>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={!canEdit}
          spellCheck={false}
          placeholder={canEdit ? t("placeholder") : t("hint")}
          className="textarea textarea-mono"
          style={{ minHeight: 400, background: "var(--code-bg)" }}
        />
      )}

      {error && <p className="error-text">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? t("saving") : t("saveBtn")}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={reset}
              className="btn btn-ghost btn-sm"
            >
              {t("cancelBtn")}
            </button>
          )}
        </div>
      )}

      <p className="help">{t("hint")}</p>
    </div>
  );
}
