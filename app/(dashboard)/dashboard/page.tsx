import Link from "next/link";
import {
  RiBuilding2Line,
  RiDoorOpenLine,
  RiFolderOpenLine,
  RiIdCardLine,
  RiKey2Line,
  RiLeafLine,
  RiPuzzle2Line,
  RiRocketLine,
  RiSafe2Line,
  RiServerLine,
  RiShieldCheckLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiStackLine,
  RiToolsLine,
  RiUserLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import { auth } from "@/lib/auth";
import { adminPrisma, prisma } from "@/lib/prisma";
import { getCurrentOrgSlug } from "@/lib/api";
import { isPlatformAdmin } from "@/lib/roles";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plans";
import type { AccessAction } from "@prisma/client";
import ExtensionInstallPrompt from "./extension-install-prompt";
import PendingInvitations from "./pending-invitations";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 5;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    activity_page?: string;
    activity_filter?: string;
  }>;
}) {
  const sp = await searchParams;
  const activityFilter = isFilterId(sp.activity_filter)
    ? sp.activity_filter
    : "all";
  const requestedPage = Math.max(1, Number.parseInt(sp.activity_page ?? "1", 10) || 1);

  const session = await auth();
  if (!session?.user?.id) return null;

  const orgSlug = await getCurrentOrgSlug(session.user.id);
  const org = orgSlug
    ? await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { projects: true, members: true } },
        },
      })
    : null;

  // Filtre les projets accessibles a l'user (memes regles que /projects) :
  //   - Global ADMIN ou OrgADMIN+ → tous les projets
  //   - DEV → tous les projets de l'org sauf ceux marqués hidden=true
  //   - MEMBER → uniquement les projets où ProjectMember existe (et non hidden)
  const isGlobalAdmin = isPlatformAdmin(session.user.role);
  const orgMembership = org
    ? await prisma.orgMember.findFirst({
        where: {
          userId: session.user.id,
          organization: { slug: org.slug },
        },
        select: { role: true },
      })
    : null;
  const orgRole = orgMembership?.role ?? null;
  const isOrgAdmin = orgRole === "OWNER" || orgRole === "ADMIN";

  const projectsScoped = org
    ? await prisma.project.findMany({
        where:
          isGlobalAdmin || isOrgAdmin
            ? { organization: { slug: org.slug } }
            : orgRole === "DEV"
              ? {
                  organization: { slug: org.slug },
                  members: {
                    none: { userId: session.user.id, hidden: true },
                  },
                }
              : {
                  // MEMBER : uniquement projets où il a un ProjectMember explicite.
                  organization: { slug: org.slug },
                  members: {
                    some: { userId: session.user.id, hidden: false },
                  },
                },
        select: { id: true },
      })
    : [];

  const projectIds = projectsScoped.map((p) => p.id);
  const projectCount = projectIds.length;

  // Filtres pour le bloc activite recente. "all" = pas de filtre.
  const filterActions =
    activityFilter === "all" ? null : actionsForFilter(activityFilter);
  const activityWhere = org
    ? {
        organizationId: org.id,
        ...(filterActions ? { action: { in: filterActions } } : {}),
      }
    : null;

  // Stats supplementaires en parallele.
  const [
    myOrgsCount,
    tenantOrgsCount,
    tenantUsersCount,
    secretCount,
    recentDeploys,
    lastDeploysByProject,
    activityTotal,
    activityRows,
    tenantClient,
  ] = await Promise.all([
    prisma.orgMember.count({ where: { userId: session.user.id } }),
    // Total orgs et users distincts dans le tenant — pour la card "Plan".
    prisma.organization.count(),
    prisma.user.count(),
    org && projectIds.length
      ? prisma.secret.count({
          where: { environment: { projectId: { in: projectIds } } },
        })
      : Promise.resolve(0),
    org && projectIds.length
      ? prisma.accessLog.findMany({
          where: {
            organizationId: org.id,
            action: "DEPLOY_AUTHORIZED",
            createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
            projectId: { in: projectIds },
          },
          distinct: ["projectId"],
          select: { projectId: true },
        })
      : Promise.resolve([] as { projectId: string | null }[]),
    // 3 derniers projets deployes : groupe distinct par projectId, ordonne
    // par createdAt desc, take 3.
    org && projectIds.length
      ? prisma.accessLog.findMany({
          where: {
            organizationId: org.id,
            action: "DEPLOY_AUTHORIZED",
            projectId: { in: projectIds },
          },
          orderBy: { createdAt: "desc" },
          distinct: ["projectId"],
          take: 3,
          select: {
            projectId: true,
            environmentId: true,
            createdAt: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        })
      : Promise.resolve([] as LastDeployRow[]),
    activityWhere
      ? prisma.accessLog.count({ where: activityWhere })
      : Promise.resolve(0),
    activityWhere
      ? prisma.accessLog.findMany({
          where: activityWhere,
          orderBy: { createdAt: "desc" },
          skip: (requestedPage - 1) * ACTIVITY_PAGE_SIZE,
          take: ACTIVITY_PAGE_SIZE,
          select: {
            id: true,
            action: true,
            actorUserEmail: true,
            actorTokenName: true,
            secretKey: true,
            metadata: true,
            createdAt: true,
            project: { select: { name: true, slug: true } },
          },
        })
      : Promise.resolve([] as RecentActivityRow[]),
    // Métadonnées plan + quotas (admin schema, hors tenant).
    session.user.tenantSlug
      ? adminPrisma.client.findUnique({
          where: { slug: session.user.tenantSlug },
          select: {
            plan: true,
            maxOrgs: true,
            maxUsers: true,
            comped: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const activeProjectCount = recentDeploys.length;
  const activityTotalPages = Math.max(
    1,
    Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE),
  );
  const activityPage = Math.min(requestedPage, activityTotalPages);

  // Pour les "Projets recents", on a juste besoin du nom de l'env du dernier deploy.
  const recentDeployEnvIds = lastDeploysByProject
    .map((d) => d.environmentId)
    .filter((id): id is string => Boolean(id));

  const recentProjectEnvs = recentDeployEnvIds.length
    ? await prisma.environment.findMany({
        where: { id: { in: recentDeployEnvIds } },
        select: { id: true, name: true },
      })
    : [];
  const envNameById = new Map(recentProjectEnvs.map((e) => [e.id, e.name]));

  const recentProjects: RecentProjectRow[] = lastDeploysByProject
    .filter((d) => d.project)
    .map((d) => ({
      id: d.project!.id,
      name: d.project!.name,
      slug: d.project!.slug,
      lastDeployAt: d.createdAt,
      lastEnvName: d.environmentId
        ? (envNameById.get(d.environmentId) ?? null)
        : null,
    }));

  return (
    <div className="page">
      <div className="page-content">
        <PendingInvitations />
        <div className="page-header">
          <div>
            <h1 className="page-title">Tableau de bord</h1>
            <div className="page-subtitle">
              Connecté en tant que <strong>{session.user.email}</strong> (
              {session.user.role})
              {org ? (
                <>
                  {" · "}
                  Organisation :{" "}
                  <Link href={`/orgs/${org.slug}`} className="text-accent">
                    {org.name}
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {!org && (
          <>
            <div className="empty-state">
              <div className="empty-state-title">Aucune organisation</div>
              <div>Créez-en une via le menu en haut à gauche.</div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <ExtensionInstallPrompt />
            </div>
          </>
        )}

        {org && (
          <>
            <div
              className="flex gap-3 flex-wrap"
              style={{ marginBottom: 24 }}
            >
              <Link href="/projects" className="btn btn-primary">
                Voir les projets
              </Link>
              <Link href={`/orgs/${org.slug}`} className="btn btn-ghost">
                Gérer l&apos;organisation
              </Link>
              <Link href="/vault" className="btn btn-ghost">
                <RiSafe2Line size={14} aria-hidden /> Coffre personnel
              </Link>
              <ExtensionInstallPrompt />
            </div>

            {recentProjects.length > 0 && (
              <RecentProjects items={recentProjects} />
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
                marginBottom: 24,
              }}
            >
              <Stat
                label="Organisation"
                value={org._count.members}
                unit={`membre${org._count.members > 1 ? "s" : ""}`}
                hint={`${myOrgsCount} organisation${myOrgsCount > 1 ? "s" : ""}`}
              />
              <Stat
                label="Projets"
                value={activeProjectCount}
                unit={`actif${activeProjectCount > 1 ? "s" : ""} / ${projectCount}`}
              />
              <Stat
                label="Secrets"
                value={secretCount}
                unit={`secret${secretCount > 1 ? "s" : ""}`}
              />
              {tenantClient && (
                <PlanCard
                  plan={tenantClient.plan}
                  comped={tenantClient.comped}
                  orgs={tenantOrgsCount}
                  maxOrgs={tenantClient.maxOrgs}
                  users={tenantUsersCount}
                  maxUsers={tenantClient.maxUsers}
                />
              )}
            </div>

            <RecentActivity
              items={activityRows}
              filter={activityFilter}
              page={activityPage}
              totalPages={activityTotalPages}
              total={activityTotal}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        className="section-eyebrow"
        style={{ marginBottom: 6, fontSize: 11 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>
        {value}
        {unit && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--muted)",
              marginLeft: 6,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div
          className="help"
          style={{ marginTop: 6, fontSize: 12 }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  comped,
  orgs,
  maxOrgs,
  users,
  maxUsers,
}: {
  plan: "FREE" | "SHARED" | "DEDICATED";
  comped: boolean;
  orgs: number;
  maxOrgs: number;
  users: number;
  maxUsers: number;
}) {
  const priceLabel = comped ? "Offert" : PLAN_PRICES[plan];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        className="section-eyebrow"
        style={{ marginBottom: 6, fontSize: 11 }}
      >
        Plan
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>
        {PLAN_LABELS[plan]}
        <span
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "var(--muted)",
            marginLeft: 8,
          }}
        >
          {priceLabel}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 16,
          fontSize: 13,
          color: "var(--muted)",
        }}
      >
        <div>
          <span style={{ color: "var(--fg)", fontWeight: 500 }}>
            {orgs}/{maxOrgs}
          </span>{" "}
          org{maxOrgs > 1 ? "s" : ""}
        </div>
        <div>
          <span style={{ color: "var(--fg)", fontWeight: 500 }}>
            {users}/{maxUsers}
          </span>{" "}
          membre{maxUsers > 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Projets récents (3 derniers projets déployés)
// ─────────────────────────────────────────────────────────────────────

type LastDeployRow = {
  projectId: string | null;
  environmentId: string | null;
  createdAt: Date;
  project: { id: string; name: string; slug: string } | null;
};

type RecentProjectRow = {
  id: string;
  name: string;
  slug: string;
  lastDeployAt: Date;
  lastEnvName: string | null;
};

function RecentProjects({ items }: { items: RecentProjectRow[] }) {
  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Projets récents</h2>
      </div>
      <div className="projects-grid" style={{ marginBottom: 24 }}>
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.slug}`}
            className="card"
            style={{
              padding: 20,
              display: "block",
              textDecoration: "none",
              color: "inherit",
              position: "relative",
            }}
          >
            <span
              title={p.lastDeployAt.toISOString()}
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
              {relativeTime(p.lastDeployAt)}
            </span>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 12,
                paddingRight: 80,
              }}
            >
              {p.name}
            </div>
            {p.lastEnvName && (
              <div className="help" style={{ fontSize: 13 }}>
                <strong>{p.lastEnvName}</strong>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activité récente
// ─────────────────────────────────────────────────────────────────────

type RecentActivityRow = {
  id: string;
  action: AccessAction;
  actorUserEmail: string | null;
  actorTokenName: string | null;
  secretKey: string | null;
  metadata: unknown;
  createdAt: Date;
  project: { name: string; slug: string } | null;
};

// ─── Filtres ─────────────────────────────────────────────────────────

type FilterId =
  | "all"
  | "secrets"
  | "deploy"
  | "project"
  | "env"
  | "member"
  | "token"
  | "org"
  | "service"
  | "account"
  | "server"
  | "policy"
  | "login"
  | "2fa"
  | "plugin";

const FILTER_DEFS: {
  id: FilterId;
  label: string;
  Icon: RemixiconComponentType;
}[] = [
  { id: "all", label: "Tout", Icon: RiSparkling2Line },
  { id: "secrets", label: "Secrets", Icon: RiKey2Line },
  { id: "deploy", label: "Déploiements", Icon: RiRocketLine },
  { id: "project", label: "Projets", Icon: RiFolderOpenLine },
  { id: "env", label: "Environnements", Icon: RiLeafLine },
  { id: "member", label: "Membres", Icon: RiUserLine },
  { id: "token", label: "Tokens", Icon: RiShieldKeyholeLine },
  { id: "org", label: "Organisations", Icon: RiBuilding2Line },
  { id: "service", label: "Services", Icon: RiToolsLine },
  { id: "account", label: "Comptes", Icon: RiIdCardLine },
  { id: "server", label: "Serveurs", Icon: RiServerLine },
  { id: "policy", label: "Policies", Icon: RiStackLine },
  { id: "login", label: "Connexions", Icon: RiDoorOpenLine },
  { id: "2fa", label: "2FA", Icon: RiShieldCheckLine },
  { id: "plugin", label: "Extension", Icon: RiPuzzle2Line },
];

function isFilterId(v: unknown): v is FilterId {
  return (
    typeof v === "string" && FILTER_DEFS.some((f) => f.id === v)
  );
}

// Liste exhaustive des AccessAction. Garder en sync avec
// prisma/tenant-schema.prisma:enum AccessAction. Sert a deriver les sets
// d'actions pour chaque filtre cote DB (where: { action: { in: [...] } }).
const ALL_ACCESS_ACTIONS: AccessAction[] = [
  "SECRET_CREATE",
  "SECRET_UPDATE",
  "SECRET_DELETE",
  "SECRET_REVEAL",
  "SECRET_FETCH_BULK",
  "TOKEN_CREATE",
  "TOKEN_REVOKE",
  "TOKEN_USE_FAILED",
  "MEMBER_INVITE",
  "MEMBER_INVITE_ACCEPT",
  "MEMBER_INVITE_DECLINE",
  "MEMBER_ROLE_CHANGE",
  "MEMBER_REMOVE",
  "PROJECT_CREATE",
  "PROJECT_UPDATE",
  "PROJECT_DELETE",
  "PROJECT_MEMBER_VISIBILITY_CHANGE",
  "PROJECT_MEMBER_ROLE_CHANGE",
  "ENVIRONMENT_CREATE",
  "ENVIRONMENT_UPDATE",
  "ENVIRONMENT_DELETE",
  "ORG_CREATE",
  "ORG_UPDATE",
  "ORG_DELETE",
  "ORG_SECRET_CREATE",
  "ORG_SECRET_UPDATE",
  "ORG_SECRET_DELETE",
  "ORG_SECRET_REVEAL",
  "SERVICE_CREATE",
  "SERVICE_UPDATE",
  "SERVICE_DELETE",
  "SERVICE_REVEAL",
  "ACCOUNT_CREATE",
  "ACCOUNT_UPDATE",
  "ACCOUNT_DELETE",
  "ACCOUNT_REVEAL",
  "REDEPLOY_TRIGGERED",
  "COMPOSE_FETCHED",
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "TWO_FACTOR_ENABLED",
  "TWO_FACTOR_DISABLED",
  "TWO_FACTOR_SUCCESS",
  "TWO_FACTOR_FAILURE",
  "BACKUP_CODE_USED",
  "SERVER_CREATE",
  "SERVER_UPDATE",
  "SERVER_DELETE",
  "POLICY_CREATE",
  "POLICY_UPDATE",
  "POLICY_DELETE",
  "DEPLOY_AUTHORIZED",
  "DEPLOY_DENIED",
  "PLUGIN_AUTH_SUCCESS",
  "PLUGIN_AUTH_FAILURE",
  "PLUGIN_CREDENTIALS_FETCH",
  "PLUGIN_TOKEN_REVOKED",
  "VAULT_ENTRY_CREATE",
  "VAULT_ENTRY_UPDATE",
  "VAULT_ENTRY_DELETE",
  "VAULT_ENTRY_REVEAL",
  "VAULT_ENTRY_MOVE",
  "VAULT_COLLECTION_CREATE",
  "VAULT_COLLECTION_DELETE",
  "VAULT_MEMBER_ADD",
  "VAULT_MEMBER_REMOVE",
  "VAULT_MEMBER_ROLE_CHANGE",
  "SHARE_CREATE",
  "SHARE_CONSUME",
  "SHARE_REVOKE",
  "SHARE_SEND_EMAIL",
  "SHARE_PASSWORD_FAILURE",
];

function filterMatchesAction(filterId: FilterId, action: AccessAction): boolean {
  switch (filterId) {
    case "all":
      return true;
    case "secrets":
      return action.startsWith("SECRET_") || action.startsWith("ORG_SECRET_");
    case "deploy":
      return (
        action.startsWith("DEPLOY_") ||
        action === "REDEPLOY_TRIGGERED" ||
        action === "COMPOSE_FETCHED"
      );
    case "project":
      return action.startsWith("PROJECT_");
    case "env":
      return action.startsWith("ENVIRONMENT_");
    case "member":
      return action.startsWith("MEMBER_");
    case "token":
      return action.startsWith("TOKEN_");
    case "org":
      return action.startsWith("ORG_") && !action.startsWith("ORG_SECRET_");
    case "service":
      return action.startsWith("SERVICE_");
    case "account":
      return action.startsWith("ACCOUNT_");
    case "server":
      return action.startsWith("SERVER_");
    case "policy":
      return action.startsWith("POLICY_");
    case "login":
      return action.startsWith("LOGIN_");
    case "2fa":
      return action.startsWith("TWO_FACTOR_") || action === "BACKUP_CODE_USED";
    case "plugin":
      return action.startsWith("PLUGIN_");
  }
}

function actionsForFilter(filterId: FilterId): AccessAction[] {
  return ALL_ACCESS_ACTIONS.filter((a) => filterMatchesAction(filterId, a));
}

function buildActivityHref(filter: FilterId, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("activity_filter", filter);
  if (page > 1) params.set("activity_page", String(page));
  const qs = params.toString();
  // Ancrage #activity pour eviter de scroller en haut de page apres clic.
  return `/dashboard${qs ? `?${qs}` : ""}#activity`;
}

function RecentActivity({
  items,
  filter,
  page,
  totalPages,
  total,
}: {
  items: RecentActivityRow[];
  filter: FilterId;
  page: number;
  totalPages: number;
  total: number;
}) {
  const startIdx = total === 0 ? 0 : (page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const endIdx = Math.min(total, page * ACTIVITY_PAGE_SIZE);

  return (
    <section className="section" id="activity">
      <div className="section-header">
        <h2 className="section-title">Activité récente</h2>
        {total > 0 && (
          <span className="help" style={{ fontSize: 12 }}>
            {startIdx}–{endIdx} sur {total}
          </span>
        )}
      </div>

      <div
        className="flex flex-wrap gap-2"
        style={{ marginBottom: 12 }}
        role="tablist"
        aria-label="Filtrer l'activité"
      >
        {FILTER_DEFS.map((def) => {
          const active = def.id === filter;
          const { Icon } = def;
          return (
            <Link
              key={def.id}
              href={buildActivityHref(def.id, 1)}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
              role="tab"
              aria-selected={active}
              title={def.label}
              style={{ scrollMargin: 8 }}
            >
              <Icon size={14} aria-hidden />
              {def.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            {filter === "all"
              ? "Aucune activité récente"
              : "Aucune activité avec ce filtre"}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((item, idx) => (
              <li
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span
                  aria-hidden
                  style={{ fontSize: 18, textAlign: "center" }}
                >
                  {actionIcon(item.action)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {actionLabel(item.action)}
                  </div>
                  <div
                    className="help"
                    style={{
                      fontSize: 12,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatContext(item)}
                    {formatActor(item) && (
                      <>
                        {" · "}
                        {formatActor(item)}
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="help"
                  style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  title={item.createdAt.toISOString()}
                >
                  {relativeTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalPages > 1 && (
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 12, justifyContent: "flex-end" }}
        >
          {page > 1 ? (
            <Link
              href={buildActivityHref(filter, page - 1)}
              className="btn btn-ghost btn-sm"
            >
              ← Précédent
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="btn btn-ghost btn-sm"
              style={{ opacity: 0.4 }}
            >
              ← Précédent
            </button>
          )}
          <span className="help" style={{ fontSize: 12 }}>
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildActivityHref(filter, page + 1)}
              className="btn btn-ghost btn-sm"
            >
              Suivant →
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="btn btn-ghost btn-sm"
              style={{ opacity: 0.4 }}
            >
              Suivant →
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function actionIcon(action: AccessAction): string {
  if (action.startsWith("SECRET_") || action.startsWith("ORG_SECRET_"))
    return "🔑";
  if (action.startsWith("DEPLOY_") || action === "REDEPLOY_TRIGGERED")
    return "🚀";
  if (action.endsWith("_CREATE")) return "➕";
  if (action.endsWith("_DELETE")) return "🗑";
  if (action.endsWith("_UPDATE")) return "✏️";
  if (action.startsWith("MEMBER_")) return "👤";
  if (action.startsWith("TOKEN_")) return "🔐";
  if (action.startsWith("PROJECT_")) return "📁";
  if (action.startsWith("ENVIRONMENT_")) return "🌿";
  if (action.startsWith("ORG_")) return "🏢";
  if (action.startsWith("SERVICE_")) return "🧰";
  if (action.startsWith("ACCOUNT_")) return "🪪";
  if (action.startsWith("SERVER_")) return "🖥";
  if (action.startsWith("POLICY_")) return "📜";
  if (action.startsWith("LOGIN_")) return "🚪";
  if (action.startsWith("TWO_FACTOR_") || action === "BACKUP_CODE_USED")
    return "🛡";
  if (action.startsWith("PLUGIN_")) return "🧩";
  if (action === "COMPOSE_FETCHED") return "📄";
  return "•";
}

const ACTION_LABELS: Partial<Record<AccessAction, string>> = {
  SECRET_CREATE: "Création d'un secret",
  SECRET_UPDATE: "Mise à jour d'un secret",
  SECRET_DELETE: "Suppression d'un secret",
  SECRET_REVEAL: "Révélation d'un secret",
  SECRET_FETCH_BULK: "Récupération de secrets",
  TOKEN_CREATE: "Création d'un token",
  TOKEN_REVOKE: "Révocation d'un token",
  TOKEN_USE_FAILED: "Échec d'utilisation d'un token",
  MEMBER_INVITE: "Invitation envoyée",
  MEMBER_INVITE_ACCEPT: "Invitation acceptée",
  MEMBER_INVITE_DECLINE: "Invitation refusée",
  MEMBER_ROLE_CHANGE: "Changement de rôle",
  MEMBER_REMOVE: "Membre retiré",
  PROJECT_CREATE: "Création d'un projet",
  PROJECT_UPDATE: "Mise à jour du projet",
  PROJECT_DELETE: "Suppression du projet",
  PROJECT_MEMBER_VISIBILITY_CHANGE: "Visibilité projet modifiée",
  PROJECT_MEMBER_ROLE_CHANGE: "Rôle projet modifié",
  ENVIRONMENT_CREATE: "Création d'un environnement",
  ENVIRONMENT_UPDATE: "Mise à jour d'un environnement",
  ENVIRONMENT_DELETE: "Suppression d'un environnement",
  ORG_CREATE: "Création de l'organisation",
  ORG_UPDATE: "Mise à jour de l'organisation",
  ORG_DELETE: "Suppression de l'organisation",
  ORG_SECRET_CREATE: "Création d'un secret org",
  ORG_SECRET_UPDATE: "Mise à jour d'un secret org",
  ORG_SECRET_DELETE: "Suppression d'un secret org",
  ORG_SECRET_REVEAL: "Révélation d'un secret org",
  SERVICE_CREATE: "Ajout d'un service",
  SERVICE_UPDATE: "Mise à jour d'un service",
  SERVICE_DELETE: "Suppression d'un service",
  SERVICE_REVEAL: "Révélation d'un service",
  ACCOUNT_CREATE: "Ajout d'un compte",
  ACCOUNT_UPDATE: "Mise à jour d'un compte",
  ACCOUNT_DELETE: "Suppression d'un compte",
  ACCOUNT_REVEAL: "Révélation d'un compte",
  REDEPLOY_TRIGGERED: "Re-déploiement déclenché",
  COMPOSE_FETCHED: "Compose récupéré",
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILURE: "Échec de connexion",
  TWO_FACTOR_ENABLED: "2FA activée",
  TWO_FACTOR_DISABLED: "2FA désactivée",
  TWO_FACTOR_SUCCESS: "2FA validée",
  TWO_FACTOR_FAILURE: "Échec 2FA",
  BACKUP_CODE_USED: "Code de secours utilisé",
  SERVER_CREATE: "Ajout d'un serveur",
  SERVER_UPDATE: "Mise à jour d'un serveur",
  SERVER_DELETE: "Suppression d'un serveur",
  POLICY_CREATE: "Ajout d'une policy",
  POLICY_UPDATE: "Mise à jour d'une policy",
  POLICY_DELETE: "Suppression d'une policy",
  DEPLOY_AUTHORIZED: "Déploiement autorisé",
  DEPLOY_DENIED: "Déploiement refusé",
  PLUGIN_AUTH_SUCCESS: "Connexion extension",
  PLUGIN_AUTH_FAILURE: "Échec extension",
};

function actionLabel(action: AccessAction): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

function formatContext(item: RecentActivityRow): string {
  const parts: string[] = [];
  if (item.project) parts.push(item.project.name);
  if (item.secretKey) parts.push(item.secretKey);
  else if (
    item.metadata &&
    typeof item.metadata === "object" &&
    !Array.isArray(item.metadata)
  ) {
    const meta = item.metadata as Record<string, unknown>;
    const env = typeof meta.environment === "string" ? meta.environment : null;
    const key = typeof meta.key === "string" ? meta.key : null;
    if (env) parts.push(env);
    if (key) parts.push(key);
  }
  return parts.length > 0 ? parts.join(" / ") : "—";
}

function formatActor(item: RecentActivityRow): string | null {
  if (item.actorUserEmail) return truncateEmail(item.actorUserEmail);
  if (item.actorTokenName) return `token: ${item.actorTokenName}`;
  return null;
}

function truncateEmail(email: string, max = 22): string {
  if (email.length <= max) return email;
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, max - 1) + "…";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  // Garde le local intact si possible, tronque le domain.
  const remaining = max - local.length - 1;
  if (remaining < 4) {
    // local trop long → tronque le local aussi
    return local.slice(0, Math.max(1, max - 5)) + "…@" + domain.slice(0, 3) + "…";
  }
  return local + "@" + domain.slice(0, remaining - 1) + "…";
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `il y a ${day} j`;
  const month = Math.floor(day / 30);
  if (month < 12) return `il y a ${month} mois`;
  return `il y a ${Math.floor(day / 365)} an${day >= 730 ? "s" : ""}`;
}
