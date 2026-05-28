"use client";

import { useEffect, useState, useTransition } from "react";
import { decryptFromSender } from "@/lib/secret-request-crypto";

export default function SecretRequestRevealDialog({
  requestId,
  label,
  canImport,
  envName,
  secretKey,
  onClose,
  onChanged,
}: {
  requestId: string;
  label: string;
  canImport: boolean;
  envName: string | null;
  secretKey: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [imported, setImported] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onReveal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!privateKey.trim()) {
      setError("Collez votre clé privée pour déchiffrer.");
      return;
    }
    startTransition(async () => {
      // 1. Récupère le ciphertext + iv + ephemeral pub côté serveur
      const res = await fetch(
        `/api/secret-requests/${requestId}/reveal`,
        { method: "POST" },
      );
      if (!res.ok) {
        setError(
          res.status === 410
            ? "Demande révoquée."
            : res.status === 404
              ? "Pas encore soumis ou introuvable."
              : "Impossible de récupérer le ciphertext.",
        );
        return;
      }
      const payload = (await res.json()) as {
        encryptedSecret: string;
        iv: string;
        ephemeralPublicJwk: string;
      };
      // 2. Déchiffre LOCALEMENT dans le navigateur
      try {
        const plain = await decryptFromSender(
          {
            ciphertext: payload.encryptedSecret,
            iv: payload.iv,
            ephemeralPublicJwk: payload.ephemeralPublicJwk,
          },
          privateKey.trim(),
        );
        setDecrypted(plain);
        // Remet le champ clé privée à vide par hygiène
        setPrivateKey("");
      } catch {
        setError(
          "Déchiffrement impossible. Clé privée invalide ou mauvaise demande ?",
        );
      }
    });
  }

  function copyDecrypted() {
    if (!decrypted) return;
    navigator.clipboard.writeText(decrypted).catch(() => undefined);
  }

  function importToProject() {
    if (!decrypted) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/secret-requests/${requestId}/import`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: decrypted }),
        },
      );
      if (res.ok) {
        setImported(true);
        // Trigger refresh côté liste
        setTimeout(() => {
          onChanged();
          onClose();
        }, 1200);
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Import impossible.");
      }
    });
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "92vw" }}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">Révéler le secret</h2>
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
          <p className="help" style={{ fontSize: 13 }}>
            <strong>{label}</strong>
          </p>

          {!decrypted ? (
            <form onSubmit={onReveal} className="flex flex-col gap-3">
              <div className="field">
                <label>Clé privée (depuis votre coffre Physalis)</label>
                <textarea
                  required
                  rows={6}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder='{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}'
                  className="input input-mono"
                  style={{ fontSize: 11, resize: "vertical" }}
                />
                <div className="help" style={{ marginTop: 4, fontSize: 12 }}>
                  Elle n&apos;est jamais envoyée au serveur. Tout le
                  déchiffrement se fait dans ce navigateur.
                </div>
              </div>
              {error && <p className="error-text">{error}</p>}
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending || !privateKey.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {pending ? "Déchiffrement…" : "Déchiffrer localement"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="field">
                <label>Secret déchiffré</label>
                <textarea
                  readOnly
                  rows={5}
                  value={decrypted}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input input-mono"
                  style={{ fontSize: 12, resize: "vertical" }}
                />
              </div>
              {imported && (
                <p
                  className="help"
                  style={{ color: "var(--success)", textAlign: "center" }}
                >
                  ✓ Importé dans le projet
                </p>
              )}
              {error && <p className="error-text">{error}</p>}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={copyDecrypted}
                  className="btn btn-ghost btn-sm"
                >
                  Copier
                </button>
                {canImport && !imported && (
                  <button
                    type="button"
                    onClick={importToProject}
                    disabled={pending}
                    className="btn btn-primary btn-sm"
                  >
                    {pending
                      ? "Import…"
                      : `Importer → ${envName} / ${secretKey}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDecrypted(null);
                    onClose();
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
