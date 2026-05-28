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
import Link from "next/link";
import { RiShareForward2Line } from "@remixicon/react";
import {
  encryptShareContent,
  generateShareKey,
} from "@/lib/share-crypto";

const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 heure" },
  { value: 14400, label: "4 heures" },
  { value: 86400, label: "24 heures" },
];

const DEFAULT_TTL = 3600;
const CONTENT_MAX = 10000;

export default function ShareCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary btn-sm"
        title="Créer un partage à durée limitée"
      >
        <RiShareForward2Line size={14} aria-hidden /> Créer un partage
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
      setError("Le contenu est requis.");
      return;
    }
    if (content.length > CONTENT_MAX) {
      setError(`Maximum ${CONTENT_MAX} caractères.`);
      return;
    }
    if (showPasswordField && password && password.length < PASSWORD_MIN) {
      setError(`Mot de passe : minimum ${PASSWORD_MIN} caractères.`);
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
          setError(data?.error ?? "Création impossible.");
          return;
        }
        const data = (await res.json()) as {
          id: string;
          token: string;
          expiresAt: string;
        };
        // Construit l'URL avec la cle dans le fragment (jamais envoye au serveur).
        const url = `${window.location.origin}/share/${data.token}#${key}`;
        setShareUrl(url);
        setExpiresAt(data.expiresAt);

        // Envoi par email si demande. Best-effort — si l'email echoue, le
        // share est quand meme cree, l'user peut copier l'URL manuellement.
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
            setError(
              `Lien créé mais email non envoyé : ${sendData?.error ?? "erreur"}.`,
            );
          }
        }
      } catch (err) {
        console.error(err);
        setError("Échec du chiffrement local.");
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
      setError("Copie impossible.");
    }
  }

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString("fr-FR")
    : "";

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-lg" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            <RiShareForward2Line size={18} aria-hidden /> Partager un secret
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
                  ✓ Email envoyé à <strong>{recipientEmail}</strong>.
                </p>
              )}
              <p className="help">
                <strong>L&apos;URL ne sera plus jamais affichée.</strong>{" "}
                Copie-la maintenant et envoie-la sur un canal sécurisé.
                Expire le {expiresLabel}.
              </p>
              <div className="field">
                <label>Lien de partage</label>
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
                <strong>Architecture zero-knowledge :</strong> la clé de
                chiffrement est dans le fragment <code>#</code> de l&apos;URL,
                jamais envoyée au serveur. Le contenu n&apos;est jamais lisible
                en base.{" "}
                <Link href="/shares" className="text-accent">
                  Voir mes partages
                </Link>
              </p>
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                onClick={copyUrl}
                className="btn btn-primary btn-sm"
              >
                {copied ? "✓ Copié" : "Copier le lien"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="dialog-body">
              <p className="help">
                Texte libre (mot de passe, .env, paragraphe). Chiffré
                localement avec une clé qui n&apos;est jamais envoyée au
                serveur. Lien à usage unique.
              </p>
              <div className="field">
                <label>Titre (optionnel)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex: Accès staging Marc"
                  maxLength={200}
                  className="input"
                />
                <div className="help" style={{ marginTop: 4 }}>
                  Visible côté serveur (pour la liste « Mes partages »). Ne
                  pas y mettre de secret.
                </div>
              </div>
              <div className="field">
                <label>Contenu *</label>
                <textarea
                  required
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Le mot de passe, le .env, …"
                  rows={10}
                  maxLength={CONTENT_MAX}
                  className="textarea textarea-mono"
                />
                <div className="help" style={{ marginTop: 4 }}>
                  {content.length} / {CONTENT_MAX} caractères. Chiffré côté
                  navigateur avant l&apos;envoi.
                </div>
              </div>
              <div className="field">
                <label>Durée de vie</label>
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
                <div className="help" style={{ marginTop: 4 }}>
                  Le lien sera détruit après lecture <strong>OU</strong>{" "}
                  expiration, selon ce qui arrive en premier.
                </div>
              </div>

              {showPasswordField && (
                <div className="field">
                  <label>Mot de passe (optionnel)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`≥ ${PASSWORD_MIN} caractères`}
                    autoComplete="new-password"
                    className="input"
                  />
                  <div className="help" style={{ marginTop: 4 }}>
                    Recommandé pour TTL ≥ 4h. À transmettre au destinataire
                    via un autre canal que le lien (SMS, appel...).
                  </div>
                </div>
              )}

              <div className="field">
                <label>Envoyer par email (optionnel)</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="destinataire@example.com"
                  autoComplete="off"
                  className="input"
                />
                <div className="help" style={{ marginTop: 4 }}>
                  ⚠ Mailgun verra l&apos;URL avec la clé de chiffrement
                  (zero-knowledge maintenu côté Physalis, mais pas vis-à-vis
                  du transport email).
                </div>
              </div>

              {error && <p className="error-text">{error}</p>}
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending || !content.trim()}
                className="btn btn-primary btn-sm"
              >
                {pending ? "Chiffrement…" : "Créer le lien"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
