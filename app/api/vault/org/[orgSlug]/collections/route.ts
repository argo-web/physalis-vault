// /api/vault/org/[orgSlug]/collections — liste/creation des coffres d'equipe
// au niveau organisation. Cf. coffres.md §Coffres d'équipe.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, slugify } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { requireOrgScope } from "@/lib/vault-access";

const NAME_MAX = 80;

type Params = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { orgSlug } = await params;
  const scope = await requireOrgScope(orgSlug, "MEMBER");
  if ("error" in scope) return scope.error;

  // Liste : un user voit toutes les collections de l'org s'il est org
  // ADMIN/OWNER, sinon uniquement celles ou il est explicitement membre.
  const isAdmin = scope.orgRole === "ADMIN" || scope.orgRole === "OWNER";
  const collections = await prisma.teamVaultCollection.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(isAdmin
        ? {}
        : { members: { some: { userId: scope.user.id } } }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { entries: true, members: true } },
      members: {
        where: { userId: scope.user.id },
        select: { role: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      entryCount: c._count.entries,
      memberCount: c._count.members,
      // role effectif vu par le user pour l'UI (badge OWNER/EDITOR/VIEWER)
      role: isAdmin ? "OWNER" : (c.members[0]?.role ?? "VIEWER"),
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { orgSlug } = await params;
  const scope = await requireOrgScope(orgSlug, "ADMIN");
  if ("error" in scope) return scope.error;

  const body = (await readJson(req)) as { name?: string } | null;
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `name required (1-${NAME_MAX} chars)` },
      { status: 400 },
    );
  }

  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json(
      { error: "name produces an empty slug" },
      { status: 400 },
    );
  }

  const conflict = await prisma.teamVaultCollection.findUnique({
    where: {
      organizationId_slug: { organizationId: scope.organizationId, slug },
    },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: "A collection with this slug already exists" },
      { status: 409 },
    );
  }

  const created = await prisma.teamVaultCollection.create({
    data: {
      organizationId: scope.organizationId,
      name,
      slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logAction({
    action: "VAULT_COLLECTION_CREATE",
    actor: { kind: "user", userId: scope.user.id, email: scope.user.email },
    organizationId: scope.organizationId,
    targetType: "TeamVaultCollection",
    targetId: created.id,
    metadata: { scope: "org", name, slug },
    req,
  });

  return NextResponse.json(
    { collection: { ...created, role: "OWNER", entryCount: 0, memberCount: 0 } },
    { status: 201 },
  );
}
