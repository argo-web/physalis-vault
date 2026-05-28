"use client";

import { useTransition } from "react";
import type { Role } from "@prisma/client";
import { changeUserRole, deleteUser } from "./actions";

const ROLES: Role[] = ["MEMBER", "ADMIN", "SUPERADMIN"];

const ROLE_COLORS: Record<Role, string> = {
  MEMBER: "var(--muted)",
  ADMIN: "var(--accent)",
  SUPERADMIN: "var(--danger)",
};

type UserData = {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  _count: { organizations: number };
};

export default function UserRow({
  user,
  isSelf,
  isLast,
}: {
  user: UserData;
  isSelf: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role;
    startTransition(() => changeUserRole(user.id, role));
  }

  function handleDelete() {
    if (!confirm(`Supprimer l'utilisateur ${user.email} ? Cette action est irréversible.`)) return;
    startTransition(() => deleteUser(user.id));
  }

  return (
    <tr
      style={{
        borderTop: isLast ? undefined : "1px solid var(--border)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <td style={{ padding: "12px 16px", fontSize: 14 }}>
        {user.email}
        {isSelf && (
          <span className="help" style={{ marginLeft: 6, fontSize: 11 }}>(vous)</span>
        )}
      </td>
      <td style={{ padding: "12px 16px" }}>
        {isSelf ? (
          <span
            className="token-mono"
            style={{ fontSize: 12, color: ROLE_COLORS[user.role] }}
          >
            {user.role}
          </span>
        ) : (
          <select
            value={user.role}
            onChange={handleRoleChange}
            disabled={pending}
            className="input input-mono"
            style={{ fontSize: 12, padding: "3px 8px", width: "auto" }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>
        {user._count.organizations}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {user.createdAt.toLocaleDateString("fr-FR")}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        {!isSelf && (
          <button
            onClick={handleDelete}
            disabled={pending}
            className="btn btn-sm"
            style={{ color: "var(--danger)", border: "1px solid var(--danger)" }}
          >
            Supprimer
          </button>
        )}
      </td>
    </tr>
  );
}
