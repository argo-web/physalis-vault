"use client";

// Detection de l'extension Physalis sur le dashboard.
//
// Strategie : l'extension (content script) injecte un marqueur DOM sur le
// document du domaine vault et dispatche un CustomEvent
// `secretvault-extension-ready`. On cumule les deux mecanismes pour
// gerer la course :
//   - Le content script peut s'executer AVANT le mount du composant
//     (auquel cas le dataset est deja present, on le voit directement).
//   - Ou APRES (auquel cas l'event nous reveille).
//   - Si rien apres ~3s, on assume que l'extension n'est pas installee.

import { useEffect, useState } from "react";
import { RiDownload2Line, RiPuzzle2Line } from "@remixicon/react";

type Status = "checking" | "installed" | "not_installed";

const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 6; // ~3s

export default function ExtensionInstallPrompt() {
  const [status, setStatus] = useState<Status>("checking");
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function getVersion(): string | null {
      return document.documentElement.dataset.secretvaultExt ?? null;
    }

    const v = getVersion();
    if (v) {
      setVersion(v);
      setStatus("installed");
      return;
    }

    const onReady = () => {
      setVersion(getVersion());
      setStatus("installed");
    };
    document.addEventListener(
      "secretvault-extension-ready",
      onReady as EventListener,
    );

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const v2 = getVersion();
      if (v2) {
        setVersion(v2);
        setStatus("installed");
        clearInterval(timer);
      } else if (attempts >= POLL_MAX_ATTEMPTS) {
        setStatus("not_installed");
        clearInterval(timer);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener(
        "secretvault-extension-ready",
        onReady as EventListener,
      );
    };
  }, []);

  if (status === "installed") {
    const hasUpdate = version != null && isVersionLower(version, EXTENSION_VERSION);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <RiPuzzle2Line size={13} aria-hidden />
          Extension{version ? ` v${version}` : ""} installée
        </span>
        {hasUpdate && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "var(--accent-bg)",
              border: "1px solid var(--accent-soft)",
              borderRadius: 99,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            v{EXTENSION_VERSION} disponible
          </button>
        )}
      </span>
    );
  }

  if (status !== "not_installed") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost"
      >
        <RiPuzzle2Line size={14} aria-hidden /> Installer l&apos;extension
      </button>
      {open && <InstallModal onClose={() => setOpen(false)} />}
    </>
  );
}

type Browser = "chrome" | "firefox" | "other";

// Version courante de l'extension. A bumper en meme temps que les zips dans
// public/ : `physalis-extension-<version>-chrome.zip` et `-firefox.zip`.
const EXTENSION_VERSION = "0.5.0";

function isVersionLower(a: string, b: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  if (aMaj !== bMaj) return aMaj < bMaj;
  if (aMin !== bMin) return aMin < bMin;
  return aPatch < bPatch;
}

function downloadUrl(browser: Browser): string | null {
  if (browser === "chrome")
    return `/physalis-extension-${EXTENSION_VERSION}-chrome.zip`;
  if (browser === "firefox")
    return `/physalis-extension-${EXTENSION_VERSION}-firefox.zip`;
  return null;
}

function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  // Edge, Brave, Opera, Chrome — tous compatibles avec le format Chrome
  // (chargement non empaquete via chrome://extensions).
  if (/Chrome\//.test(ua)) return "chrome";
  return "other";
}

function InstallModal({ onClose }: { onClose: () => void }) {
  const browser = detectBrowser();
  const isChrome = browser === "chrome";
  const isFirefox = browser === "firefox";
  const zipUrl = downloadUrl(browser);

  const title = isChrome
    ? "Extension Chrome"
    : isFirefox
      ? "Extension Firefox"
      : "Extension navigateur";

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">{title}</h2>
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
          <section>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              L&apos;extension Physalis te permet de :
            </p>
            <ul
              style={{
                paddingLeft: 18,
                margin: "8px 0 0",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              <li>
                <strong>Auto-remplir</strong> les credentials sur les sites
                des Services et Comptes accessibles depuis tes projets
              </li>
              <li>
                <strong>Sauvegarder automatiquement</strong> un nouveau
                credential dans ton coffre quand tu te connectes à un site
              </li>
              <li>
                Accéder en un clic à tes credentials du coffre personnel et
                des coffres d&apos;équipe filtrés par domaine
              </li>
            </ul>
          </section>

          <section style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <h3
              className="section-title"
              style={{ fontSize: 14, marginBottom: 10 }}
            >
              Installation
            </h3>
            <ol
              style={{
                paddingLeft: 22,
                margin: 0,
                fontSize: 13,
                lineHeight: 1.9,
              }}
            >
              <li>Télécharge l&apos;archive ci-dessous.</li>
              {isChrome && (
                <>
                  <li>
                    Ouvre{" "}
                    <a
                      href="chrome://extensions/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="code-mono text-accent"
                    >
                      chrome://extensions/
                    </a>{" "}
                    et active <strong>Mode développeur</strong> (interrupteur
                    en haut à droite).
                  </li>
                  <li>
                    Clique sur{" "}
                    <strong>Charger l&apos;extension non empaquetée</strong>{" "}
                    et sélectionne le dossier décompressé, ou glisse le zip
                    sur la fenêtre.
                  </li>
                </>
              )}
              {isFirefox && (
                <>
                  <li>
                    Ouvre{" "}
                    <a
                      href="about:debugging#/runtime/this-firefox"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="code-mono text-accent"
                    >
                      about:debugging#/runtime/this-firefox
                    </a>
                    .
                  </li>
                  <li>
                    Clique sur{" "}
                    <strong>
                      Charger un module complémentaire temporaire
                    </strong>{" "}
                    et sélectionne le fichier{" "}
                    <code className="code-mono">manifest.json</code> du
                    dossier décompressé.
                  </li>
                  <li className="text-muted" style={{ fontSize: 12 }}>
                    Note : sur Firefox, l&apos;installation temporaire est
                    réinitialisée au prochain redémarrage. Pour une
                    installation permanente, attendre la publication sur
                    addons.mozilla.org.
                  </li>
                </>
              )}
              {!isChrome && !isFirefox && (
                <li>
                  L&apos;extension n&apos;est disponible que pour Chrome
                  (et navigateurs basés sur Chromium) et Firefox pour le
                  moment.
                </li>
              )}
            </ol>

            {zipUrl && (
              <a
                href={zipUrl}
                download
                className="btn btn-primary"
                style={{ marginTop: 16, alignSelf: "flex-start" }}
              >
                <RiDownload2Line size={14} aria-hidden /> Télécharger l&apos;extension v{EXTENSION_VERSION}{" "}
                ({isChrome ? "Chrome" : "Firefox"}, .zip)
              </a>
            )}
          </section>

          <section style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <h3
              className="section-title"
              style={{ fontSize: 14, marginBottom: 6 }}
            >
              Astuce
            </h3>
            <p className="help" style={{ margin: 0, lineHeight: 1.8 }}>
              Pour épingler l&apos;extension à la barre d&apos;outils :
              <br />
              clique sur l&apos;icône <strong>🧩 Extensions</strong> dans la
              barre d&apos;outils du navigateur,
              <br />
              puis sur l&apos;icône <strong>📌 épingle</strong> à côté de
              Physalis.
              <br />
              L&apos;icône Physalis sera alors toujours visible.
            </p>
          </section>
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
