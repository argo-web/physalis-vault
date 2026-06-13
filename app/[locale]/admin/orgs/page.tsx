import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import OrgRow from "./org-row";

export default async function AdminOrgsPage() {
  const t = await getTranslations("admin.orgs");
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { members: true, projects: true } },
    },
  });

  return (
    <div className="page">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("title")}</h1>
            <div className="page-subtitle">{t("count", { count: orgs.length })}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[t("colName"), t("colSlug"), t("colMembers"), t("colProjects"), t("colCreatedAt"), ""].map((h, i) => (
                  <th
                    key={i}
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
              {orgs.map((org, idx) => (
                <OrgRow
                  key={org.id}
                  org={org}
                  isLast={idx === orgs.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
