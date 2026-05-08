import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;

  const token = await prisma.machineToken.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await requireProjectMember(token.project.slug, "EDITOR");
  if ("error" in access) return access.error;

  if (token.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.machineToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  logAction({
    action: "TOKEN_REVOKE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: token.project.organizationId,
    projectId: token.projectId,
    environmentId: token.environmentId,
    targetType: "MachineToken",
    targetId: token.id,
    metadata: { name: token.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
