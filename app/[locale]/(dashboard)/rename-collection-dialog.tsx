"use client";

// Modale generique de renommage d'une collection. Utilisee par le coffre
// perso (vault-panel.tsx) ET le coffre d'equipe (team-vault-panel.tsx,
// scope org + projet). On reste dans le style global de l'app via les
// classes .dialog* de globals.css.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

const NAME_MAX = 80;

export default function RenameCollectionDialog({
  currentName,
  endpoint,
  onClose,
  onRenamed,
}: {
  currentName: string;
  /** URL PATCH a appeler. Body envoye : { name }. */
  endpoint: string;
  onClose: () => void;
  /** Callback apres succes. Le caller doit reload sa liste : le slug
   *  peut avoir change (derive du nom). */
  onRenamed: () => void;
}) {
  const t = useTranslations("vault.renameCollection");
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onClose();
      return;
    }
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? t("error"));
        return;
      }
      onRenamed();
    });
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label={t("cancelBtn")}
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="dialog-body">
            <div className="field">
              <label htmlFor="rename-collection-name">{t("nameLabel")}</label>
              <input
                id="rename-collection-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                className="input"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              disabled={pending}
            >
              {t("cancelBtn")}
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="btn btn-primary btn-sm"
            >
              {pending ? t("submittingBtn") : t("submitBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
