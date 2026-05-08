import { NextResponse } from "next/server";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readJson, requireOrgMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; userId: string }> };

const VALID_ROLES: OrgRole[] = ["OWNER", "ADMIN", "DEV", "MEMBER"];

export async function PATCH(req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const access = await requireOrgMember(slug, "ADMIN");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as { role?: string } | null;
  const role = String(body?.role ?? "").toUpperCase() as OrgRole;
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  // Only OWNERs can promote/demote OWNERs.
  if (role === "OWNER" && access.role !== "OWNER") {
    return NextResponse.json({ error: "Only OWNERs can grant OWNER" }, { status: 403 });
  }

  const target = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: access.organization.id },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent removing the last OWNER.
  if (target.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.orgMember.count({
      where: { organizationId: access.organization.id, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last OWNER" },
        { status: 409 },
      );
    }
  }

  await prisma.orgMember.update({
    where: { id: target.id },
    data: { role },
  });

  logAction({
    action: "MEMBER_ROLE_CHANGE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "User",
    targetId: userId,
    metadata: { fromRole: target.role, toRole: role },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const access = await requireOrgMember(slug, "ADMIN");
  if ("error" in access) return access.error;

  const target = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: access.organization.id },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent removing the last OWNER.
  if (target.role === "OWNER") {
    const ownerCount = await prisma.orgMember.count({
      where: { organizationId: access.organization.id, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last OWNER" },
        { status: 409 },
      );
    }
  }

  // Cascade : remove project memberships within this org and revoke any
  // machine tokens this user had created in this org's projects.
  const orgProjects = await prisma.project.findMany({
    where: { organizationId: access.organization.id },
    select: { id: true },
  });
  const projectIds = orgProjects.map((p) => p.id);

  const [, revokedTokens] = await prisma.$transaction([
    prisma.projectMember.deleteMany({
      where: { userId, projectId: { in: projectIds } },
    }),
    prisma.machineToken.updateMany({
      where: {
        createdById: userId,
        projectId: { in: projectIds },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.orgMember.delete({ where: { id: target.id } }),
  ]);

  logAction({
    action: "MEMBER_REMOVE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "User",
    targetId: userId,
    metadata: {
      previousRole: target.role,
      cascadedRevokedTokens: revokedTokens.count,
    },
    req,
  });

  return NextResponse.json({ ok: true });
}
