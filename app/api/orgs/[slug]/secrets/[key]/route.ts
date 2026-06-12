import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { requireOrgMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; key: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug, key } = await params;
  // DEV+ peut reveal un OrgSecret (lecture). Le DELETE en revanche reste ADMIN+.
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const secret = await prisma.orgSecret.findUnique({
    where: {
      organizationId_key: { organizationId: access.organization.id, key },
    },
  });
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const value = decrypt({
    encryptedValue: secret.encryptedValue,
    iv: secret.iv,
    tag: secret.tag,
  });

  logAction({
    action: "ORG_SECRET_REVEAL",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "OrgSecret",
    targetId: secret.id,
    secretKey: secret.key,
    req,
  });

  return NextResponse.json({ key: secret.key, value });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug, key } = await params;
  const access = await requireOrgMember(slug, "ADMIN_DEV");
  if ("error" in access) return access.error;

  const existing = await prisma.orgSecret.findUnique({
    where: {
      organizationId_key: { organizationId: access.organization.id, key },
    },
    select: { id: true, key: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.orgSecret.delete({ where: { id: existing.id } });

  logAction({
    action: "ORG_SECRET_DELETE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "OrgSecret",
    targetId: existing.id,
    secretKey: existing.key,
    req,
  });

  return NextResponse.json({ ok: true });
}
