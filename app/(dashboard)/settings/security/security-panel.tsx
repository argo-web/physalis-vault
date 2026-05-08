"use client";

import { useState, useTransition } from "react";
import Image from "next/image";

type SetupData = {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
};

type Step = "idle" | "setup" | "backup-codes" | "disable";

export default function SecurityPanel({
  initialEnabled,
  initialBackupCount,
}: {
  initialEnabled: boolean;
  initialBackupCount: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [backupCount, setBackupCount] = useState(initialBackupCount);
  const [step, setStep] = useState<Step>("idle");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  function reset() {
    setStep("idle");
    setSetupData(null);
    setCode("");
    setError(null);
    setBackupCodes(null);
  }

  function startSetup() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/me/2fa/setup", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Setup impossible.");
        return;
      }
      setSetupData((await res.json()) as SetupData);
      setStep("setup");
    });
  }

  function verifySetup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/me/2fa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Code invalide.");
        return;
      }
      const data = (await res.json()) as { backupCodes: string[] };
      setBackupCodes(data.backupCodes);
      setBackupCount(data.backupCodes.length);
      setEnabled(true);
      setSetupData(null);
      setCode("");
      setStep("backup-codes");
    });
  }

  function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/me/2fa", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Désactivation impossible.");
        return;
      }
      setEnabled(false);
      setBackupCount(0);
      reset();
    });
  }

  function copyAll() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n")).catch(() => {
      // ignore
    });
  }

  if (step === "backup-codes" && backupCodes) {
    return (
      <section
        className="settings-section"
        style={{
          background: "var(--accent-bg)",
          borderColor: "var(--accent-soft)",
        }}
      >
        <h2 className="settings-section-title">
          ✅ 2FA activée — sauvegardez ces codes
        </h2>
        <p className="settings-section-desc">
          Ces 8 codes de secours ne seront <strong>plus jamais affichés</strong>
          . Chaque code est utilisable <strong>une seule fois</strong> en
          remplacement d&apos;un code TOTP (si vous perdez votre téléphone).
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            marginTop: 4,
          }}
        >
          {backupCodes.map((c) => (
            <div
              key={c}
              className="code-mono"
              style={{
                padding: "8px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={copyAll}
            className="btn btn-primary btn-sm"
          >
            Copier tout
          </button>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost btn-sm"
          >
            J&apos;ai sauvegardé les codes
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        Authentification à deux facteurs (TOTP)
      </h2>
      <p className="settings-section-desc">
        {enabled ? (
          <>
            ✅ Activée. {backupCount} code{backupCount > 1 ? "s" : ""} de secours
            restant{backupCount > 1 ? "s" : ""}.
          </>
        ) : (
          <>
            Ajoute un 2e facteur (Google Authenticator, Authy, 1Password…) en
            plus du mot de passe pour la connexion web. Les machine tokens ne
            sont pas affectés.
          </>
        )}
      </p>

      {!enabled && step === "idle" && (
        <button
          type="button"
          onClick={startSetup}
          disabled={pending}
          className="btn btn-primary btn-sm"
        >
          {pending ? "..." : "Activer la 2FA"}
        </button>
      )}

      {!enabled && step === "setup" && setupData && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm" style={{ fontWeight: 500 }}>
              1. Scannez le QR code avec votre app authenticator
            </p>
            <div
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: 8,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              <Image
                src={setupData.qrDataUrl}
                alt="QR code 2FA"
                width={200}
                height={200}
                unoptimized
              />
            </div>
            <p className="help" style={{ marginTop: 8 }}>
              Ou saisie manuelle du secret :{" "}
              <code className="code-mono select-all">{setupData.secret}</code>
            </p>
          </div>
          <form onSubmit={verifySetup} className="flex flex-col gap-2">
            <label className="text-sm">
              2. Saisissez le code à 6 chiffres affiché par votre app pour
              confirmer :
            </label>
            <div className="flex items-center gap-2">
              <input
                required
                autoFocus
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                className="input input-mono"
                style={{ width: 140 }}
              />
              <button
                type="submit"
                disabled={pending || code.length !== 6}
                className="btn btn-primary btn-sm"
              >
                {pending ? "..." : "Confirmer"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="btn btn-ghost btn-sm"
              >
                Annuler
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </form>
        </div>
      )}

      {enabled && step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("disable")}
          className="btn btn-danger btn-sm"
        >
          Désactiver la 2FA
        </button>
      )}

      {enabled && step === "disable" && (
        <form onSubmit={disable} className="flex flex-col gap-2">
          <p className="text-sm">
            Pour désactiver, saisissez un code TOTP courant ou un code de
            secours :
          </p>
          <div className="flex items-center gap-2">
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456 ou code de secours"
              className="input input-mono"
              style={{ maxWidth: 260 }}
            />
            <button
              type="submit"
              disabled={pending || !code}
              className="btn btn-danger btn-sm"
            >
              {pending ? "..." : "Désactiver"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="btn btn-ghost btn-sm"
            >
              Annuler
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}
    </section>
  );
}
