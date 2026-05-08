import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser } from "@/lib/api";
import { uniqueOrgSlug } from "@/lib/orgs";
import { logAction } from "@/lib/audit";
import { getCurrentTenantSlug } from "@/lib/tenant-session";
import { checkOrgQuota, findClientIdBySlug } from "@/lib/quotas";
import { logAdminAction } from "@/lib/admin-audit";

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

  // Phase 3.3 — quota d'organisations. En mode legacy (tenantSlug null),
  // checkOrgQuota retourne `{ allowed: true }` → bypass.
  const tenantSlug = await getCurrentTenantSlug();
  const quota = await checkOrgQuota(tenantSlug);
  if (!quota.allowed) {
    await logAdminAction({
      action: "org.quota_exceeded",
      clientId: await findClientIdBySlug(tenantSlug),
      actor: user.email,
      metadata: {
        tenantSlug,
        current: quota.current,
        max: quota.max,
        attemptedName: name,
      },
    });
    return NextResponse.json(
      { error: "Quota d'organisations atteint pour votre plan" },
      { status: 403 },
    );
  }

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
