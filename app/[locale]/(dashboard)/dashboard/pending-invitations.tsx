"use client";

// Section affichee en haut du dashboard SI l'user a des invitations in-app
// en attente. Sinon le composant ne rend rien (pas de zone vide).
//
// Boutons inline :
//   - Valider → POST /api/me/invitations/[id]/accept → switch org courante
//     vers la nouvelle, refresh
//   - Refuser → DELETE /api/me/invitations/[id] → reload la liste

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RiMailLine } from "@remixicon/react";

type PendingInvitation = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  expiresAt: string;
  createdAt: string;
  organization: { slug: string; name: string };
  invitedBy: { email: string };
};

export default function PendingInvitations() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/me/invitations");
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { invitations: PendingInvitation[] };
    setInvitations(data.invitations);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function accept(inv: PendingInvitation) {
    startTransition(async () => {
      const res = await fetch(`/api/me/invitations/${inv.id}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Acceptation impossible.");
        return;
      }
      // Bascule l'org courante sur la nouvelle (UX : on arrive direct dedans).
      await fetch("/api/me/current-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: inv.organization.slug }),
      }).catch(() => {});
      router.push(`/orgs/${inv.organization.slug}`);
      router.refresh();
    });
  }

  function decline(inv: PendingInvitation) {
    if (!confirm(`Refuser l'invitation à rejoindre ${inv.organization.name} ?`))
      return;
    startTransition(async () => {
      const res = await fetch(`/api/me/invitations/${inv.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Refus impossible.");
        return;
      }
      reload();
    });
  }

  if (!invitations || invitations.length === 0) {
    return null;
  }

  return (
    <section
      className="card"
      style={{
        background: "var(--accent-bg)",
        borderColor: "var(--accent-soft)",
        marginBottom: 24,
      }}
    >
      <h2
        className="section-title"
        style={{ fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}
      >
        <RiMailLine size={16} aria-hidden /> Invitation{invitations.length > 1 ? "s" : ""} en attente
      </h2>
      {error && <p className="error-text">{error}</p>}
      <div className="row-list" style={{ gap: 6 }}>
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="row"
            style={{ background: "var(--surface)" }}
          >
            <div className="row-icon"><RiMailLine size={18} aria-hidden /></div>
            <div className="row-info">
              <div className="row-name">
                Rejoindre <strong>{inv.organization.name}</strong>{" "}
                <span
                  className={`role role-${inv.role.toLowerCase()}`}
                  style={{ marginLeft: 6 }}
                >
                  {inv.role}
                </span>
              </div>
              <div className="row-meta">
                <span>Invité par {inv.invitedBy.email}</span>
                <span>
                  · expire le {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="row-actions">
              <button
                type="button"
                onClick={() => accept(inv)}
                disabled={pending}
                className="btn btn-primary btn-sm"
              >
                Valider
              </button>
              <button
                type="button"
                onClick={() => decline(inv)}
                disabled={pending}
                className="btn btn-ghost btn-sm"
              >
                Refuser
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
