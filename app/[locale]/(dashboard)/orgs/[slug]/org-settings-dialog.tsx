"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { OrgRole } from "@prisma/client";

export default function OrgSettingsDialog({
  slug,
  initialName,
  role,
  rotationFeatureEnabled,
  onClose,
}: {
  slug: string;
  initialName: string;
  role: OrgRole;
  rotationFeatureEnabled: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("orgs.settings");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [rotationEnabled, setRotationEnabled] = useState(rotationFeatureEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== initialName && name.trim().length > 0;
  const isOwner = role === "OWNER";

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? t("saveError"));
        return;
      }
      router.refresh();
    });
  }

  function deleteOrg() {
    const confirm1 = prompt(
      `Pour supprimer l'organisation, tapez son nom : "${initialName}"`,
    );
    if (confirm1 !== initialName) return;
    if (!confirm(t("deleteConfirm"))) return;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? t("deleteError"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">{t("dialogTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label={t("closeLabel")}
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <section>
            <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
              {t("nameSection")}
            </h3>
            <form onSubmit={save} className="form-row">
              <div className="field" style={{ minWidth: 220 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={!dirty || pending}
                className="btn btn-primary btn-sm"
              >
                {pending ? t("savingBtn") : t("saveBtn")}
              </button>
            </form>
            <p className="help" style={{ marginTop: 6 }}>
              {t("slugNote")} (<code className="code-mono">/{slug}</code>)
            </p>
          </section>

          <section style={{ borderTop: "1px solid var(--border)", paddingTop: 18 }}>
            <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
              {t("advancedSection")}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={rotationEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRotationEnabled(next);
                    startTransition(async () => {
                      const res = await fetch(`/api/orgs/${slug}/rotation/settings`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ enabled: next }),
                      });
                      if (!res.ok) {
                        setRotationEnabled(!next);
                        const data = (await res.json().catch(() => null)) as { error?: string } | null;
                        setError(data?.error ?? t("saveError"));
                        return;
                      }
                      router.refresh();
                    });
                  }}
                />
                {t("rotationLabel")}
              </label>
            </div>
            <p className="help" style={{ marginTop: 6 }}>
              {t("rotationDesc")}
            </p>
          </section>

          {error && <p className="error-text">{error}</p>}

          {isOwner && (
            <section
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 18,
              }}
            >
              <h3
                className="section-title"
                style={{ fontSize: 14, color: "var(--danger)", marginBottom: 8 }}
              >
                {t("dangerSection")}
              </h3>
              <p className="help" style={{ marginBottom: 12 }}>
                {t("deleteDesc")}
              </p>
              <button
                type="button"
                onClick={deleteOrg}
                disabled={pending}
                className="btn btn-danger btn-sm"
              >
                {t("deleteBtn")}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
