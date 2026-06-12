"use client";

// Bouton "Partager un secret" dans le header + modal de creation.
//
// Architecture zero-knowledge (cf. lib/share-crypto.ts) :
//   1. L'user tape le contenu dans la modale.
//   2. Au submit : on genere une cle AES-256 cote NAVIGATEUR, on encrypt,
//      on POST { ciphertext, iv, title?, ttlSeconds }. La cle ne quitte
//      jamais le navigateur.
//   3. Le serveur retourne un token public. On construit l'URL :
//      `https://<host>/share/<token>#<key>` et on l'affiche pour copy.
//   4. Le destinataire ouvre l'URL → fetch ciphertext → decrypt avec la
//      cle du fragment → affiche.

import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { RiShareForward2Line } from "@remixicon/react";
import { useTranslations, useLocale } from "next-intl";
import {
  encryptShareContent,
  generateShareKey,
} from "@/lib/share-crypto";

const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 14400, label: "4 hours" },
  { value: 86400, label: "24 hours" },
];

const DEFAULT_TTL = 3600;
const CONTENT_MAX = 10000;

export default function ShareCreateButton() {
  const t = useTranslations("shares");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary btn-sm"
      >
        <RiShareForward2Line size={14} aria-hidden /> {t("createBtn")}
      </button>
      {open && <ShareCreateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

// Seuils en secondes a partir desquels on suggere l'ajout d'un mot de passe :
// 4h ou plus → fenetre d'attaque longue, le password ajoute une defense en
// profondeur utile. <4h → on cache le champ, friction non justifiee.
const TTL_PASSWORD_THRESHOLD = 14400;
const PASSWORD_MIN = 4;

function ShareCreateDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("shares");
  const locale = useLocale();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState<number>(DEFAULT_TTL);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const showPasswordField = ttl >= TTL_PASSWORD_THRESHOLD;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError(t("createDialog.errorEmpty"));
      return;
    }
    if (content.length > CONTENT_MAX) {
      setError(t("createDialog.errorLength", { max: CONTENT_MAX }));
      return;
    }
    if (showPasswordField && password && password.length < PASSWORD_MIN) {
      setError(t("createDialog.errorPassword", { min: PASSWORD_MIN }));
      return;
    }
    startTransition(async () => {
      try {
        const key = await generateShareKey();
        const { ciphertext, iv } = await encryptShareContent(content, key);
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ciphertext,
            iv,
            title: title.trim() || null,
            ttlSeconds: ttl,
            password: showPasswordField && password ? password : null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error ?? t("createDialog.createError"));
          return;
        }
        const data = (await res.json()) as {
          id: string;
          token: string;
          expiresAt: string;
        };
        const url = `${window.location.origin}/${locale}/share/${data.token}#${key}`;
        setShareUrl(url);
        setExpiresAt(data.expiresAt);

        if (recipientEmail.trim()) {
          const sendRes = await fetch(`/api/me/shares/${data.id}/send`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: recipientEmail.trim(), url }),
          });
          if (sendRes.ok) setEmailSent(true);
          else {
            const sendData = (await sendRes.json().catch(() => null)) as
              | { error?: string }
              | null;
            setError(t("createDialog.errorEmailFailed", { error: sendData?.error ?? "error" }));
          }
        }
      } catch (err) {
        console.error(err);
        setError(t("createDialog.encryptionError"));
      }
    });
  }

  async function copyUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("copyError"));
    }
  }

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString()
    : "";

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-lg" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            <RiShareForward2Line size={18} aria-hidden /> {t("createDialog.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label={t("createDialog.closeLabel")}
          >
            ✕
          </button>
        </div>

        {shareUrl ? (
          <>
            <div className="dialog-body">
              {emailSent && (
                <p
                  className="help"
                  style={{
                    padding: 12,
                    background: "var(--accent-bg)",
                    border: "1px solid var(--accent-soft)",
                    borderRadius: 8,
                    color: "var(--fg)",
                  }}
                >
                  {t("createDialog.emailSentTo", { email: recipientEmail })}
                </p>
              )}
              <p className="help">
                <strong>{t("createDialog.urlNotShownAgain")}</strong>{" "}
                {t("createDialog.expiresOn", { date: expiresLabel })}
              </p>
              <div className="field">
                <label>{t("createDialog.linkLabel")}</label>
                <div
                  className="code-mono"
                  style={{
                    padding: 10,
                    background: "var(--code-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    wordBreak: "break-all",
                  }}
                >
                  {shareUrl}
                </div>
              </div>
              <p className="help">
                <strong>{t("createDialog.zkNote")} :</strong>{" "}
                <Link href="/shares" className="text-accent">
                  {t("createDialog.seeMyShares")}
                </Link>
              </p>
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                onClick={copyUrl}
                className="btn btn-primary btn-sm"
              >
                {copied ? t("createDialog.copiedBtn") : t("createDialog.copyBtn")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                {t("createDialog.closeLabel")}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="dialog-body">
              <div className="field">
                <label>{t("createDialog.titleLabel")}</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="input"
                />
              </div>
              <div className="field">
                <label>{t("createDialog.contentLabel")}</label>
                <textarea
                  required
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  maxLength={CONTENT_MAX}
                  className="textarea textarea-mono"
                />
              </div>
              <div className="field">
                <label>{t("createDialog.durationLabel")}</label>
                <select
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value))}
                  className="select"
                >
                  {TTL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {showPasswordField && (
                <div className="field">
                  <label>{t("createDialog.passwordLabel")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`≥ ${PASSWORD_MIN} chars`}
                    autoComplete="new-password"
                    className="input"
                  />
                </div>
              )}

              <div className="field">
                <label>{t("createDialog.emailLabel")}</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  autoComplete="off"
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
              >
                {t("createDialog.cancelBtn")}
              </button>
              <button
                type="submit"
                disabled={pending || !content.trim()}
                className="btn btn-primary btn-sm"
              >
                {pending ? t("createDialog.encryptingBtn") : t("createDialog.submitBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
