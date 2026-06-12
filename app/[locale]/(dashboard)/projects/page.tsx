import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentOrgSlug } from "@/lib/api";
import { isPlatformAdmin, hasDevPrivileges } from "@/lib/roles";
import CreateProjectForm from "./create-project";
import { getTranslations } from "next-intl/server";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const t = await getTranslations("projects");

  const orgSlug = await getCurrentOrgSlug(session.user.id);
  if (!orgSlug) {
    return (
      <div className="page">
        <div className="page-content">
          <h1 className="page-title">{t("pageTitle")}</h1>
          <div
            className="card"
            style={{
              borderStyle: "dashed",
              borderColor: "var(--accent-soft)",
              background: "var(--accent-bg)",
              marginTop: 16,
            }}
          >
            {t("noOrg")}
          </div>
        </div>
      </div>
    );
  }

  // Filtrage : un projet apparait dans la liste si l'user y a acces
  //   - Global ADMIN ou OrgADMIN/OWNER → tous les projets de l'org
  //   - DEV → tous les projets de l'org SAUF ceux marqués hidden=true
  //   - MEMBER → uniquement les projets où il est ProjectMember explicite
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
        : hasDevPrivileges(orgRole)
          ? {
              organization: { slug: orgSlug },
              members: {
                none: { userId: session.user.id, hidden: true },
              },
            }
          : {
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

  // Dernier déploiement par projet.
  const projectIds = projects.map((p) => p.id);
  const lastDeployLogs = projectIds.length
    ? await prisma.accessLog.findMany({
        where: { action: "DEPLOY_AUTHORIZED", projectId: { in: projectIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["projectId"],
        select: { projectId: true, environmentId: true, createdAt: true },
      })
    : [];

  const envIds = lastDeployLogs
    .map((d) => d.environmentId)
    .filter((id): id is string => Boolean(id));
  const envs = envIds.length
    ? await prisma.environment.findMany({
        where: { id: { in: envIds } },
        select: { id: true, name: true },
      })
    : [];
  const envNameById = new Map(envs.map((e) => [e.id, e.name]));
  const lastDeployByProject = new Map(
    lastDeployLogs.map((d) => [
      d.projectId,
      {
        at: d.createdAt,
        envName: d.environmentId ? (envNameById.get(d.environmentId) ?? null) : null,
      },
    ]),
  );

  return (
    <div className="page">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("pageTitle")}</h1>
            <div className="page-subtitle">
              Organisation : <strong>{org?.name}</strong>
            </div>
          </div>
        </div>

        <CreateProjectForm />

        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("empty")}</div>
            <div>{t("emptyHint")}</div>
          </div>
        ) : (
          <div style={{
            border: "1px solid var(--accent-soft)",
            background: "var(--accent-bg)",
            borderRadius: 12,
            padding: 16,
          }}>
          <div className="projects-grid">
            {projects.map((p) => {
              const secrets = p.environments.reduce(
                (n, e) => n + e._count.secrets,
                0,
              );
              const lastDeploy = lastDeployByProject.get(p.id);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.slug}`}
                  className="card card-link project-card"
                  style={{ position: "relative" }}
                >
                  {lastDeploy && (
                    <span
                      title={lastDeploy.at.toISOString()}
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "#fde9c8",
                        color: "#8a4b00",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {lastDeploy.envName ? `${lastDeploy.envName} · ` : ""}
                      {relativeTime(lastDeploy.at, t)}
                    </span>
                  )}
                  <div className="project-name" style={{ paddingRight: lastDeploy ? 100 : 0 }}>
                    {p.name}
                  </div>
                  <div className="project-slug">/{p.slug}</div>
                  <div className="project-stats">
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.services}</strong> {t("card.services")}
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.appAccounts}</strong> {t("card.accounts")}
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{p._count.environments}</strong> {t("card.env")}
                    </span>
                    <span>
                      <span className="stat-icon">●</span>
                      <strong>{secrets}</strong> {t("card.secrets")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relativeTime(date: Date, t: (key: string, values?: any) => string): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("relTime.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("relTime.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("relTime.hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("relTime.daysAgo", { n: day });
  const month = Math.floor(day / 30);
  if (month < 12) return t("relTime.monthsAgo", { n: month });
  return t("relTime.yearsAgo", { n: Math.floor(day / 365) });
}
