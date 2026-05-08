"use client";

// Banner d'alerte affiche quand l'API renvoie 429 sur les flows d'auth.
// Style bien visible (cuivre + bordure danger) pour ne pas etre confondu
// avec une simple erreur inline.

export default function RateLimitAlert({
  title = "Trop de tentatives",
  message = "Tu as dépassé la limite de tentatives autorisées sur cette IP.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "16px 18px",
        borderRadius: 12,
        border: "1px solid var(--danger)",
        background: "var(--danger-bg)",
        color: "var(--danger-fg)",
      }}
    >
      <div
        aria-hidden
        style={{
          fontSize: 24,
          lineHeight: 1,
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        ⏱
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{message}</p>
        <p
          style={{
            fontSize: 12,
            margin: "8px 0 0",
            opacity: 0.85,
          }}
        >
          Patiente <strong>quelques minutes</strong> avant de réessayer
          (limite : 5 tentatives par 15 minutes).
        </p>
      </div>
    </div>
  );
}
