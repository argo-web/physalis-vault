import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/roles";
import AuditLogTable from "@/components/AuditLogTable";

export default async function ProjectAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      members: { where: { userId: session.user.id } },
      organization: {
        include: { members: { where: { userId: session.user.id } } },
      },
    },
  });
  if (!project) notFound();

  const orgRole = project.organization.members[0]?.role;
  const projectRole = project.members[0]?.role;
  const isGlobalAdmin = isPlatformAdmin(session.user.role);

  const canSee =
    isGlobalAdmin ||
    orgRole === "OWNER" ||
    orgRole === "ADMIN" ||
    projectRole === "EDITOR" ||
    projectRole === "OWNER";
  if (!canSee) notFound();

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href={`/projects/${slug}`}>← {project.name}</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Audit log</h1>
            <div className="page-subtitle">
              Historique des actions sur ce projet (secrets, tokens). Cliquez
              sur une ligne pour voir les détails.
            </div>
          </div>
        </div>

        <AuditLogTable
          apiBase={`/api/projects/${slug}/audit`}
          csvUrl={`/api/projects/${slug}/audit?format=csv`}
        />
      </div>
    </div>
  );
}
