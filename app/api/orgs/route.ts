import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser } from "@/lib/api";
import { uniqueOrgSlug } from "@/lib/orgs";
import { logAction } from "@/lib/audit";

export async function GET() {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const orgs = await prisma.orgMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          _count: { select: { projects: true, members: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    organizations: orgs.map((m) => ({ ...m.organization, role: m.role })),
  });
}

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const body = (await readJson(req)) as { name?: string } | null;
  if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const name = body.name.trim();
  const slug = await uniqueOrgSlug(name);

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
    },
  });

  logAction({
    action: "ORG_CREATE",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: org.id,
    targetType: "Organization",
    targetId: org.id,
    metadata: { name: org.name, slug: org.slug },
    req,
  });

  return NextResponse.json({ organization: org }, { status: 201 });
}
