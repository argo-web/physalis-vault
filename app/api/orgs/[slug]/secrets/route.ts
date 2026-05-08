import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  isValidSecretKey,
  readJson,
  requireOrgMember,
} from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  // DEV+ peut lister les OrgSecret (lecture seule). Le reveal de la valeur
  // est dans l'autre route (cf. [key]/route.ts) avec la même règle DEV+.
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const secrets = await prisma.orgSecret.findMany({
    where: { organizationId: access.organization.id },
    select: { key: true, updatedAt: true, createdAt: true },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ secrets });
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireOrgMember(slug, "ADMIN");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | { key?: string; value?: string }
    | null;
  if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
    return NextResponse.json(
      { error: "key and value are required strings" },
      { status: 400 },
    );
  }
  const key = body.key.trim();
  if (!isValidSecretKey(key)) {
    return NextResponse.json(
      { error: "Cle invalide (format ^[A-Z][A-Z0-9_]*$)" },
      { status: 400 },
    );
  }

  const existing = await prisma.orgSecret.findUnique({
    where: {
      organizationId_key: { organizationId: access.organization.id, key },
    },
    select: { id: true },
  });

  const payload = encrypt(body.value);
  const secret = await prisma.orgSecret.upsert({
    where: {
      organizationId_key: { organizationId: access.organization.id, key },
    },
    create: {
      key,
      organizationId: access.organization.id,
      ...payload,
    },
    update: payload,
    select: { id: true, key: true, updatedAt: true, createdAt: true },
  });

  logAction({
    action: existing ? "ORG_SECRET_UPDATE" : "ORG_SECRET_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "OrgSecret",
    targetId: secret.id,
    secretKey: key,
    req,
  });

  return NextResponse.json({
    secret: { key: secret.key, createdAt: secret.createdAt, updatedAt: secret.updatedAt },
  });
}
