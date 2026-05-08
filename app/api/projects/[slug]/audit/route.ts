import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/api";
import { rowsToCsv } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

const MAX_LIMIT = 200;
const CSV_MAX_ROWS = 5000;

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  // Project-level audit: requires EDITOR (or org ADMIN+ via the implicit
  // promotion in requireProjectMember).
  const access = await requireProjectMember(slug, "EDITOR");
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const action = url.searchParams.get("action") ?? undefined;

  const where = {
    projectId: access.project.id,
    ...(action ? { action: action as never } : {}),
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
