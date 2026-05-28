import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/roles";
import AuditLogTable from "@/components/AuditLogTable";

export default async function OrgAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { slug } = await params;
  const isAdmin = isPlatformAdmin(session.user.role);

  const org = await prisma.organization.findUnique({
    where: { slug },
    include: { members: { where: { userId: session.user.id } } },
  });
  if (!org) notFound();

  const role = org.members[0]?.role ?? (isAdmin ? "OWNER" : null);
  if (
    !role ||
    (role !== "OWNER" && role !== "ADMIN" && role !== "DEV")
  ) {
    notFound();
  }

  const isAdminLevel = role === "OWNER" || role === "ADMIN";

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href={`/orgs/${slug}`}>← {org.name}</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Audit log</h1>
            <div className="page-subtitle">
              {isAdminLevel
                ? "Historique de toutes les actions sensibles de l'organisation."
                : "Vos actions sur les projets auxquels vous avez accès."}
              {" "}Cliquez sur une ligne pour voir les détails (metadata).
            </div>
          </div>
        </div>

        <AuditLogTable
          apiBase={`/api/orgs/${slug}/audit`}
          csvUrl={isAdminLevel ? `/api/orgs/${slug}/audit?format=csv` : null}
        />
      </div>
    </div>
  );
}
