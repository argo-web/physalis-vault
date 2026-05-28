import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import UserRow from "./user-row";

export default async function AdminUsersPage() {
  const session = await auth();
  const currentUserId = session!.user!.id;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { organizations: true } },
    },
  });

  return (
    <div className="page">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Utilisateurs</h1>
            <div className="page-subtitle">{users.length} utilisateur{users.length > 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Email", "Rôle", "Orgs", "Créé le", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  isLast={idx === users.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
