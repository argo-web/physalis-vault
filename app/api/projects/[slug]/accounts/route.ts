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

  const accounts = await prisma.appAccount.findMany({
    where: { projectId: access.project.id },
    select: { id: true, name: true, updatedAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ accounts });
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "EDITOR");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | { name?: string; user?: string; password?: string }
    | null;
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  const user = String(body?.user ?? "");
  const password = String(body?.password ?? "");

  const payload = encrypt(JSON.stringify({ user, password }));

  const account = await prisma.appAccount.create({
    data: {
      name,
      encryptedData: payload.encryptedValue,
      iv: payload.iv,
      tag: payload.tag,
      projectId: access.project.id,
    },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  logAction({
    action: "ACCOUNT_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    targetType: "AppAccount",
    targetId: account.id,
    metadata: { name },
    req,
  });

  return NextResponse.json({ account }, { status: 201 });
}
