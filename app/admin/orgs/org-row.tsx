"use client";

import { useTransition } from "react";
import { deleteOrg } from "./actions";

type OrgData = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  _count: { members: number; projects: number };
};

export default function OrgRow({
  org,
  isLast,
}: {
  org: OrgData;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Supprimer l'organisation "${org.name}" (${org.slug}) ?\n` +
        `Cela supprimera également tous ses projets, secrets et membres. Action irréversible.`,
      )
    )
      return;
    startTransition(() => deleteOrg(org.id));
  }

  return (
    <tr
      style={{
        borderTop: isLast ? undefined : "1px solid var(--border)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 500 }}>{org.name}</td>
      <td style={{ padding: "12px 16px" }}>
        <span className="token-mono" style={{ fontSize: 12 }}>{org.slug}</span>
      </td>
      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>
        {org._count.members}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>
        {org._count.projects}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {org.createdAt.toLocaleDateString("fr-FR")}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="btn btn-sm"
          style={{ color: "var(--danger)", border: "1px solid var(--danger)" }}
        >
          Supprimer
        </button>
      </td>
    </tr>
  );
}
