import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/auth-token";
import { readJson, requireEnvironment, requireProjectMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("project");
  const env = url.searchParams.get("env");
  if (!slug) {
    return NextResponse.json(
      { error: "project query param is required" },
      { status: 400 },
    );
  }

  if (env) {
    const access = await requireEnvironment(slug, env, "EDITOR");
    if ("error" in access) return access.error;
    const tokens = await prisma.machineToken.findMany({
      where: { environmentId: access.environment.id },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
        environment: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tokens });
  }

  const access = await requireProjectMember(slug, "EDITOR");
  if ("error" in access) return access.error;
  const tokens = await prisma.machineToken.findMany({
    where: { projectId: access.project.id },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
      environment: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  const body = (await readJson(req)) as
    | { project?: string; environment?: string; name?: string }
    | null;
  if (
    !body ||
    typeof body.project !== "string" ||
    typeof body.environment !== "string" ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "project, environment and name are required" },
      { status: 400 },
    );
  }

  const access = await requireEnvironment(
    body.project,
    body.environment,
    "EDITOR",
  );
  if ("error" in access) return access.error;

  const token = generateToken();
  const tokenHash = hashToken(token);

  const created = await prisma.machineToken.create({
    data: {
      name: body.name.trim(),
      tokenHash,
      projectId: access.project.id,
      environmentId: access.environment.id,
      createdById: access.user.id,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      environment: { select: { name: true } },
      project: { select: { slug: true } },
    },
  });

  logAction({
    action: "TOKEN_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "MachineToken",
    targetId: created.id,
    metadata: { name: created.name },
    req,
  });

  // The plaintext token is returned ONCE here. Never stored, never shown again.
  return NextResponse.json({ token, machineToken: created }, { status: 201 });
}
