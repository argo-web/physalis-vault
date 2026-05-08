import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireProjectMember, slugify } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug);
  if ("error" in access) return access.error;

  const project = await prisma.project.findUnique({
    where: { id: access.project.id },
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      createdAt: true,
      githubRepo: true,
      githubWorkflow: true,
      environments: {
        select: {
          id: true,
          name: true,
          url: true,
          _count: { select: { secrets: true } },
        },
        orderBy: { name: "asc" },
      },
      _count: { select: { tokens: { where: { revokedAt: null } } } },
    },
  });

  return NextResponse.json({
    project,
    role: access.role,
  });
}

const GITHUB_REPO_RE = /^[a-z0-9._-]+\/[a-z0-9._-]+$/i;

export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "OWNER");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | {
        name?: string;
        slug?: string;
        githubRepo?: string | null;
        githubWorkflow?: string | null;
      }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: {
    name?: string;
    slug?: string;
    githubRepo?: string | null;
    githubWorkflow?: string | null;
  } = {};
  const changed: string[] = [];
  let oldSlug: string | undefined;

  if (typeof body.name === "string") {
    const newName = body.name.trim();
    if (!newName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (newName !== access.project.name) {
      data.name = newName;
      changed.push("name");
    }
  }

  if (typeof body.slug === "string") {
    const newSlug = slugify(body.slug);
    if (!newSlug) {
      return NextResponse.json({ error: "Slug invalide" }, { status: 400 });
    }
    if (newSlug !== access.project.slug) {
      const conflict = await prisma.project.findUnique({
        where: { slug: newSlug },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "Ce slug est déjà utilisé par un autre projet" },
          { status: 409 },
        );
      }
      data.slug = newSlug;
      oldSlug = access.project.slug;
      changed.push("slug");
    }
  }

  if ("githubRepo" in body) {
    if (body.githubRepo === null || body.githubRepo === "") {
      data.githubRepo = null;
      changed.push("githubRepo");
    } else if (typeof body.githubRepo === "string") {
      const repo = body.githubRepo.trim();
      if (!GITHUB_REPO_RE.test(repo)) {
        return NextResponse.json(
          { error: "githubRepo doit etre au format owner/repo" },
          { status: 400 },
        );
      }
      data.githubRepo = repo;
      changed.push("githubRepo");
    }
  }

  if ("githubWorkflow" in body) {
    if (body.githubWorkflow === null || body.githubWorkflow === "") {
      data.githubWorkflow = null;
      changed.push("githubWorkflow");
    } else if (typeof body.githubWorkflow === "string") {
      data.githubWorkflow = body.githubWorkflow.trim();
      changed.push("githubWorkflow");
    }
  }

  if (changed.length === 0) {
    return NextResponse.json({ ok: true, project: access.project });
  }

  const updated = await prisma.project.update({
    where: { id: access.project.id },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      githubRepo: true,
      githubWorkflow: true,
    },
  });

  logAction({
    action: "PROJECT_UPDATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    targetType: "Project",
    targetId: access.project.id,
    metadata: {
      changedFields: changed,
      ...(oldSlug ? { fromSlug: oldSlug, toSlug: data.slug } : {}),
    },
    req,
  });

  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "OWNER");
  if ("error" in access) return access.error;

  await prisma.project.delete({ where: { id: access.project.id } });

  logAction({
    action: "PROJECT_DELETE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    targetType: "Project",
    targetId: access.project.id,
    metadata: { name: access.project.name, slug: access.project.slug },
    req,
  });

  return NextResponse.json({ ok: true });
}
