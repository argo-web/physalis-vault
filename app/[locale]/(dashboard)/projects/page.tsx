import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentOrgSlug } from "@/lib/api";
import { isPlatformAdmin } from "@/lib/roles";
import CreateProjectForm from "./create-project";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const orgSlug = await getCurrentOrgSlug(session.user.id);
  if (!orgSlug) {
    return (
      <div className="page">
        <div className="page-content">
          <h1 className="page-title">Projets</h1>
          <div
            className="card"
            style={{
              borderStyle: "dashed",
              borderColor: "var(--accent-soft)",
              background: "var(--accent-bg)",
              marginTop: 16,
            }}
          >
            Vous n&apos;êtes membre d&apos;aucune organisation. Créez-en une via le
            menu en haut à gauche.
          </div>
        </div>
      </div>
    );
  }

  // Filtrage : un projet apparait dans la liste si l'user y a acces
  // (cf. RBAC dans /projects/[slug]/page.tsx) :
  //   - Global ADMIN ou OrgADMIN/OWNER → tous les projets de l'org
  //   - DEV → tous les projets de l'org SAUF ceux marqués hidden=true
  //   - MEMBER → uniquement les projets où il est ProjectMember explicite
  //     (avec hidden=false)
  const isGlobalAdmin = isPlatformAdmin(session.user.role);
  const orgMembership = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { slug: orgSlug },
    },
    select: { role: true },
  });
  const orgRole = orgMembership?.role ?? null;
  const isOrgAdmin = orgRole === "OWNER" || orgRole === "ADMIN";

  const projects = await prisma.project.findMany({
    where:
      isGlobalAdmin || isOrgAdmin
        ? { organization: { slug: orgSlug } }
        : orgRole === "DEV"
          ? {
              organization: { slug: orgSlug },
              members: {
                none: { userId: session.user.id, hidden: true },
              },
            }
          : {
              // MEMBER : uniquement projets où il a une ligne ProjectMember
              // explicite (avec hidden=false).
              organization: { slug: orgSlug },
              members: {
                some: { userId: session.user.id, hidden: false },
              },
            },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      environments: {
        select: { _count: { select: { secrets: true } } },
      },
      _count: {
        select: {
          tokens: { where: { revokedAt: null } },
          environments: true,
          services: true,
          appAccounts: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { name: true },
  });

  return (
    <div className="page">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projets</h1>
            <div className="page-subtitle">
              Organisation : <strong>{org?.name}</strong>
            </div>
          </div>
        </div>

        <CreateProjectForm />

        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Aucun projet pour l&apos;instant</div>
            <div>Utilise le formulaire ci-dessus pour créer ton premier.</div>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((p) => {
              const secrets = p.environments.reduce(
                (n, e) => n + e._count.secrets,
                0,
              );
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.slug}`}
                  className="card card-link project-card"
                >
                  <div className="project-name">{p.name}</div>
                  <div className="project-slug">/{p.slug}</div>
                  <div className="project-stats">
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.services}</strong> services
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.appAccounts}</strong> comptes
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.environments}</strong> env
                      {p._count.environments === 1 ? "" : "s"}
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{secrets}</strong> secrets
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
