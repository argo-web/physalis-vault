"use client";

// Bandeau dismissable invitant à installer l'extension Physalis sur la
// page coffre perso (V2.1). N'apparaît que si :
//   - le coffre contient au moins 1 entrée (sinon l'empty state propose
//     déjà l'install via OnboardingCard)
//   - l'extension n'est pas détectée après ~3s
//   - l'user n'a pas déjà fermé le bandeau (localStorage)
//
// Détection : même mécanique que dashboard/extension-install-prompt.tsx
// (dataset DOM + event `secretvault-extension-ready` + polling fallback).

import { useEffect, useState } from "react";

const DISMISS_KEY = "physalis-vault-extension-banner-dismissed";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 6; // ~3s
const DETECT_EVENT = "secretvault-extension-ready";
const DATASET_KEY = "secretvaultExt";

export default function ExtensionBanner({ totalCount }: { totalCount: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (totalCount === 0) return;

    // Pas de window/localStorage en SSR. Le composant est "use client" donc
    // on est OK ici, mais defensive check tout de même.
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    function detected(): boolean {
      return Boolean(document.documentElement.dataset[DATASET_KEY]);
    }
    if (detected()) return;

    let cancelled = false;
    const onReady = () => {
      cancelled = true;
      setShow(false);
    };
    document.addEventListener(DETECT_EVENT, onReady as EventListener);

    let attempts = 0;
    const timer = setInterval(() => {
      if (cancelled) {
        clearInterval(timer);
        return;
      }
      attempts++;
      if (detected()) {
        clearInterval(timer);
      } else if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        setShow(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener(DETECT_EVENT, onReady as EventListener);
    };
  }, [totalCount]);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 12,
        background: "rgba(59, 130, 246, 0.08)",
        border: "1px solid rgba(59, 130, 246, 0.25)",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>💡</span>
      <span style={{ flex: 1 }}>
        Installe l&apos;extension Physalis pour auto-remplir tes credentials
        directement depuis le navigateur.{" "}
        <a href="/dashboard" className="text-accent">
          Voir les instructions
        </a>
        .
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer ce bandeau"
        title="Ne plus afficher"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
