import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/roles";
import { getTranslations } from "next-intl/server";
import AuditLogTable from "@/components/AuditLogTable";

export default async function ProjectAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("projects.audit");
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
              {isGlobalAdmin || orgRole === "OWNER" || orgRole === "ADMIN"
                ? t("adminDesc")
                : t("memberDesc")}
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
