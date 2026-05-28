import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/roles";
import OrgPanels from "./org-panels";

export default async function OrgPage({
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
    include: {
      members: { where: { userId: session.user.id } },
      _count: { select: { projects: true, members: true } },
    },
  });
  if (!org) notFound();

  const role = org.members[0]?.role ?? (isAdmin ? "OWNER" : null);
  if (!role) notFound();

  // Audit log accessible à DEV+. ADMIN/OWNER voient tout l'org, DEV ne voit
  // que ses propres actions sur les projets accessibles (filtré côté API).
  const canSeeAudit = role === "OWNER" || role === "ADMIN" || role === "DEV";

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">← Tableau de bord</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {org.name}{" "}
              <span className={`role role-${role.toLowerCase()}`}>{role}</span>
            </h1>
            <div className="page-subtitle">
              {org._count.projects} projets · {org._count.members} membres
            </div>
          </div>
          {canSeeAudit && (
            <div className="page-actions">
              <Link
                href={`/orgs/${org.slug}/audit`}
                className="btn btn-ghost btn-sm"
              >
                Audit
              </Link>
            </div>
          )}
        </div>

        <OrgPanels slug={org.slug} orgName={org.name} role={role} />
      </div>
    </div>
  );
}
