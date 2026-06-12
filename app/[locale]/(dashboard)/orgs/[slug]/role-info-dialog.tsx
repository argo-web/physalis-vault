"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

type RoleRow = {
  role: "MEMBER" | "DEV" | "ADMIN_DEV" | "ADMIN" | "OWNER";
  title: string;
  badge: string;
  summary: string;
  rights: { label: string; granted: boolean | "read" }[];
};

// Rights label keys per role — mirrors orgs.roleInfo.* in en.json
const RIGHTS_ROWS: RoleRow[] = [
  {
    role: "MEMBER",
    title: "Member",
    badge: "role-member",
    summary: "",
    rights: [
      { label: "viewOrg", granted: true },
      { label: "viewProjects", granted: "read" },
      { label: "revealOrgSecret", granted: false },
      { label: "viewServers", granted: false },
      { label: "manageMembers", granted: false },
      { label: "viewAudit", granted: false },
      { label: "manageOrg", granted: false },
    ],
  },
  {
    role: "DEV",
    title: "Dev",
    badge: "role-dev",
    summary: "",
    rights: [
      { label: "implicitEditor", granted: true },
      { label: "revealOrgSecret", granted: "read" },
      { label: "manageOrgSecret", granted: false },
      { label: "viewServers", granted: "read" },
      { label: "manageServers", granted: false },
      { label: "manageMembers", granted: false },
      { label: "ownAudit", granted: "read" },
    ],
  },
  {
    role: "ADMIN_DEV",
    title: "AdminDev",
    badge: "role-admin_dev",
    summary: "",
    rights: [
      { label: "implicitEditor", granted: true },
      { label: "revealOrgSecret", granted: "read" },
      { label: "manageOrgSecret", granted: true },
      { label: "viewServers", granted: "read" },
      { label: "manageServers", granted: true },
      { label: "manageMembers", granted: false },
      { label: "ownAudit", granted: "read" },
    ],
  },
  {
    role: "ADMIN",
    title: "Admin",
    badge: "role-admin",
    summary: "",
    rights: [
      { label: "implicitOwner", granted: true },
      { label: "crudOrgSecretServer", granted: true },
      { label: "manageMembers", granted: true },
      { label: "promoteOwner", granted: false },
      { label: "renameOrg", granted: true },
      { label: "deleteOrg", granted: false },
      { label: "viewAudit", granted: true },
    ],
  },
  {
    role: "OWNER",
    title: "Owner",
    badge: "role-owner",
    summary: "",
    rights: [
      { label: "allAdmin", granted: true },
      { label: "promoteOwner", granted: true },
      { label: "deleteOrg", granted: true },
    ],
  },
];

function rightIcon(g: boolean | "read"): string {
  if (g === true) return "✅";
  if (g === "read") return "👁";
  return "—";
}

export default function RoleInfoDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("orgs.roleInfo");
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
          <p className="help">
            {t("dialogDesc")}
          </p>

          {RIGHTS_ROWS.map((r) => {
            const roleKey = r.role.toLowerCase() as
              | "member"
              | "dev"
              | "admin_dev"
              | "admin"
              | "owner";
            return (
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
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t(`${roleKey}.title`)}</span>
                </div>
                <p
                  className="help"
                  style={{ margin: "0 0 8px", fontSize: 13 }}
                >
                  {t(`${roleKey}.desc`)}
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
                  {r.rights.map((item, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 8,
                        color: item.granted ? "var(--fg)" : "var(--muted)",
                      }}
                    >
                      <span style={{ width: 22, textAlign: "center" }}>
                        {rightIcon(item.granted)}
                      </span>
                      <span>{t(`${roleKey}.${item.label}`)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <p className="help" style={{ marginTop: 8, fontSize: 12 }}>
            {t("legend")}
          </p>
        </div>
      </div>
    </div>
  );
}
