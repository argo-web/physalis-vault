"use client";

// Bouton "Exporter mes données" — droit RGPD article 20 (portabilité).
// Déclenche un download du JSON depuis /api/me/export. Le navigateur
// gère le download automatiquement via le header Content-Disposition.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RiDownloadLine } from "@remixicon/react";

/**
 * `personal` : limite l'export au coffre personnel (profil + VaultEntry).
 * Utilisé pour les membres non owner/admin, qui ne doivent pas exporter les
 * données du client (orgs / projets / secrets co-détenus).
 */
export default function ExportButton({
  personal = false,
}: {
  personal?: boolean;
}) {
  const t = useTranslations("account");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setPending(true);
    try {
      // window.location.href déclenche un download natif (le serveur
      // pose Content-Disposition: attachment). Pas de fetch + blob,
      // moins de gestion mémoire côté client si le dump est gros.
      window.location.href = personal
        ? "/api/me/export?scope=personal"
        : "/api/me/export";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("export.networkError"));
    } finally {
      // Petite latence pour que le navigateur ait le temps de démarrer
      // le download avant qu'on réinitialise.
      setTimeout(() => setPending(false), 800);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={download}
      >
        <RiDownloadLine size={14} aria-hidden />{" "}
        {pending
          ? t("planChangePending")
          : personal
            ? t("export.personalLabel")
            : t("myDataSection")}
      </button>
      <div className="help" style={{ fontSize: 12, lineHeight: 1.4 }}>
        {personal ? t("export.descPersonal") : t("export.desc")}
      </div>
      {error && (
        <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
