"use client";

import { useEffect } from "react";

type RoleRow = {
  role: "MEMBER" | "DEV" | "ADMIN" | "OWNER";
  title: string;
  badge: string;
  summary: string;
  rights: { label: string; granted: boolean | "read" }[];
};

const RIGHTS_ROWS: RoleRow[] = [
  {
    role: "MEMBER",
    title: "Member",
    badge: "role-member",
    summary:
      "Accès basique. Ne voit AUCUN projet par défaut — l'admin doit l'ajouter explicitement comme ProjectMember (avec un rôle VIEWER/EDITOR/OWNER) sur chaque projet auquel il doit accéder.",
    rights: [
      { label: "Voir l'organisation", granted: true },
      { label: "Voir les projets (uniquement ceux où ProjectMember explicite)", granted: "read" },
      { label: "Reveal OrgSecret (variables globales)", granted: false },
      { label: "Voir les serveurs de l'org", granted: false },
      { label: "Inviter / retirer membres", granted: false },
      { label: "Voir l'audit log", granted: false },
      { label: "Modifier l'org / supprimer l'org", granted: false },
    ],
  },
  {
    role: "DEV",
    title: "Dev",
    badge: "role-dev",
    summary:
      "Profil développeur. EDITOR implicite sur tous les projets de l'org (CRUD secrets project-level, redeploy). Lecture des secrets globaux et des serveurs. Peut consulter ses propres actions dans l'audit log.",
    rights: [
      { label: "EDITOR implicite sur tous les projets de l'org", granted: true },
      { label: "Reveal OrgSecret (variables globales)", granted: "read" },
      { label: "Créer/modifier/supprimer OrgSecret", granted: false },
      { label: "Voir les serveurs (IP, user SSH)", granted: "read" },
      { label: "Créer/modifier/supprimer un serveur", granted: false },
      { label: "Inviter / retirer membres", granted: false },
      { label: "Audit log : ses propres actions sur projets accessibles", granted: "read" },
    ],
  },
  {
    role: "ADMIN",
    title: "Admin",
    badge: "role-admin",
    summary:
      "Gère l'organisation au quotidien. OWNER implicite sur tous les projets, peut ajouter/retirer des membres (sauf grant OWNER).",
    rights: [
      { label: "OWNER implicite sur tous les projets de l'org", granted: true },
      { label: "CRUD OrgSecret + Server", granted: true },
      { label: "Inviter, retirer, changer le rôle des membres", granted: true },
      { label: "Promouvoir un membre OWNER", granted: false },
      { label: "Modifier le nom de l'org", granted: true },
      { label: "Supprimer l'org", granted: false },
      { label: "Voir l'audit log", granted: true },
    ],
  },
  {
    role: "OWNER",
    title: "Owner",
    badge: "role-owner",
    summary:
      "Pleins pouvoirs sur l'organisation, y compris les actions destructives.",
    rights: [
      { label: "Tout ce qu'un Admin peut faire", granted: true },
      { label: "Promouvoir un membre OWNER", granted: true },
      { label: "Supprimer l'organisation", granted: true },
    ],
  },
];

function rightIcon(g: boolean | "read"): string {
  if (g === true) return "✅";
  if (g === "read") return "👁";
  return "—";
}

export default function RoleInfoDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">Rôles d&apos;organisation</h2>
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
          <p className="help">
            Les rôles d&apos;organisation contrôlent l&apos;accès aux secrets
            globaux, aux serveurs et aux projets. Du moins permissif au plus
            permissif :
          </p>

          {RIGHTS_ROWS.map((r) => (
            <section
              key={r.role}
              style={{
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <span className={`role ${r.badge}`}>{r.role}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
              </div>
              <p
                className="help"
                style={{ margin: "0 0 8px", fontSize: 13 }}
              >
                {r.summary}
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {r.rights.map((item) => (
                  <li
                    key={item.label}
                    style={{
                      display: "flex",
                      gap: 8,
                      color: item.granted ? "var(--fg)" : "var(--muted)",
                    }}
                  >
                    <span style={{ width: 22, textAlign: "center" }}>
                      {rightIcon(item.granted)}
                    </span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="help" style={{ marginTop: 8, fontSize: 12 }}>
            👁 = lecture seule (reveal/voir) — ✅ = lecture + écriture — — =
            pas d&apos;accès
          </p>
        </div>
      </div>
    </div>
  );
}
