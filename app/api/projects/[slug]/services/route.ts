import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { readJson, requireProjectMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug);
  if ("error" in access) return access.error;

  const services = await prisma.service.findMany({
    where: { projectId: access.project.id },
    select: { id: true, name: true, url: true, updatedAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ services });
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "EDITOR");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | { name?: string; url?: string; user?: string; password?: string }
    | null;
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  const user = String(body?.user ?? "");
  const password = String(body?.password ?? "");
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  const payload = encrypt(JSON.stringify({ user, password }));

  const service = await prisma.service.create({
    data: {
      name,
      url: url || null,
      encryptedData: payload.encryptedValue,
      iv: payload.iv,
      tag: payload.tag,
      projectId: access.project.id,
    },
    select: { id: true, name: true, url: true, createdAt: true, updatedAt: true },
  });

  logAction({
    action: "SERVICE_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    targetType: "Service",
    targetId: service.id,
    metadata: { name, hasUrl: Boolean(url) },
    req,
  });

  return NextResponse.json({ service }, { status: 201 });
}
