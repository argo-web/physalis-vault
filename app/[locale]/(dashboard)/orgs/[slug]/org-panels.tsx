"use client";

import { useState } from "react";
import type { OrgRole } from "@prisma/client";
import { RiSafe2Line } from "@remixicon/react";
import OrgMembersPanel from "./members-panel";
import OrgSecretsPanel from "./org-secrets-panel";
import ServersPanel from "./servers-panel";
import OrgSettingsDialog from "./org-settings-dialog";
import OrgTokensPanel from "./org-tokens-panel";
import TeamVaultPanel from "../../team-vault-panel";

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  MEMBER: 1,
  DEV: 2,
  ADMIN_DEV: 3,
  ADMIN: 4,
  OWNER: 5,
};

type Tab = "members" | "secrets" | "servers" | "vault" | "tokens";

export default function OrgPanels({
  slug,
  orgName,
  role,
}: {
  slug: string;
  orgName: string;
  role: OrgRole;
}) {
  const [tab, setTab] = useState<Tab>("vault");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // DEV+ peut voir les onglets Secrets globaux et Serveurs (lecture seule
  // pour DEV, R/W pour ADMIN+).
  const canRead = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.DEV;
  const canManage = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.ADMIN;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="tab-bar"
        style={{ display: "flex", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex" }}>
          <button
            type="button"
            className={`tab ${tab === "vault" ? "active" : ""}`}
            onClick={() => setTab("vault")}
          >
            <RiSafe2Line size={14} aria-hidden /> Coffre d&apos;équipe
          </button>
          {canRead && (
            <button
              type="button"
              className={`tab ${tab === "secrets" ? "active" : ""}`}
              onClick={() => setTab("secrets")}
            >
              Secrets globaux
            </button>
          )}
          {canRead && (
            <button
              type="button"
              className={`tab ${tab === "servers" ? "active" : ""}`}
              onClick={() => setTab("servers")}
            >
              Serveurs
            </button>
          )}
          <button
            type="button"
            className={`tab ${tab === "members" ? "active" : ""}`}
            onClick={() => setTab("members")}
          >
            Membres
          </button>
          {canRead && (
            <button
              type="button"
              className={`tab ${tab === "tokens" ? "active" : ""}`}
              onClick={() => setTab("tokens")}
              title="Tokens d'intégration (N8n, Make, scripts)"
            >
              Tokens
            </button>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="tab"
            aria-label="Paramètres de l'organisation"
            title="Paramètres"
            style={{ padding: "10px 14px" }}
          >
            <SettingsIcon />
          </button>
        )}
      </div>

      {tab === "members" ? (
        <OrgMembersPanel slug={slug} role={role} />
      ) : tab === "secrets" ? (
        <OrgSecretsPanel slug={slug} role={role} />
      ) : tab === "servers" ? (
        <ServersPanel slug={slug} role={role} />
      ) : tab === "tokens" && canRead ? (
        <OrgTokensPanel slug={slug} />
      ) : (
        <TeamVaultPanel
          scope={{ kind: "org", orgSlug: slug }}
          canCreate={canRead}
        />
      )}

      {settingsOpen && canManage && (
        <OrgSettingsDialog
          slug={slug}
          initialName={orgName}
          role={role}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
