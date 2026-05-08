import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/api";
import { rowsToCsv } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

const MAX_LIMIT = 200;
const CSV_MAX_ROWS = 5000;

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  // Audit log : ADMIN+ voient tout l'org. DEV voit ses propres actions
  // project-scoped sur les projets auxquels il a accès.
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const action = url.searchParams.get("action") ?? undefined;
  const projectSlug = url.searchParams.get("project") ?? undefined;

  let projectId: string | undefined;
  if (projectSlug) {
    const p = await prisma.project.findFirst({
      where: { slug: projectSlug, organizationId: access.organization.id },
      select: { id: true },
    });
    if (!p) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    projectId = p.id;
  }

  // Pour un DEV (ou MEMBER, théorique — le gate ci-dessus le bloque déjà
  // mais belt & suspenders), restreindre aux actions :
  //   - actorUserId = lui-même
  //   - projectId IN (projets accessibles : tous les projets de l'org sauf
  //     ceux marqués hidden=true pour ce user)
  // Pour ADMIN/OWNER : pas de restriction.
  const isAdminOrOwner = access.role === "ADMIN" || access.role === "OWNER";

  let projectScopeFilter: { projectId: { in: string[] } } | null = null;
  if (!isAdminOrOwner) {
    const accessibleProjects = await prisma.project.findMany({
      where: {
        organizationId: access.organization.id,
        members: {
          none: { userId: access.user.id, hidden: true },
        },
      },
      select: { id: true },
    });
    projectScopeFilter = {
      projectId: { in: accessibleProjects.map((p) => p.id) },
    };
  }

  const where = {
    organizationId: access.organization.id,
    ...(projectId ? { projectId } : {}),
    ...(action ? { action: action as never } : {}),
    ...(isAdminOrOwner
      ? {}
      : {
          actorUserId: access.user.id,
          ...projectScopeFilter,
        }),
  };

  if (format === "csv") {
    const rows = await prisma.accessLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CSV_MAX_ROWS,
      select: {
        createdAt: true,
        action: true,
        actorUserEmail: true,
        actorTokenName: true,
        ipAddress: true,
        organizationId: true,
        projectId: true,
        environmentId: true,
        secretKey: true,
        targetType: true,
        targetId: true,
        metadata: true,
      },
    });
    const csv = rowsToCsv(rows);
    const filename = `audit-${slug}-${new Date().toISOString().split("T")[0]}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );
  const cursor = url.searchParams.get("cursor");

  const logs = await prisma.accessLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorUserEmail: true,
      actorTokenName: true,
      ipAddress: true,
      projectId: true,
      environmentId: true,
      secretKey: true,
      targetType: true,
      targetId: true,
      metadata: true,
    },
  });

  const hasMore = logs.length > limit;
  const slice = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? slice[slice.length - 1]!.id : null;

  return NextResponse.json({ logs: slice, nextCursor });
}
