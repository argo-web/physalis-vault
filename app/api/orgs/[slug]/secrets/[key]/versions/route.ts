// GET /api/orgs/[slug]/secrets/[key]/versions
//
// Liste les versions historiques d'un OrgSecret. RBAC : DEV+ (mêmes
// droits que `GET /...secrets/[key]` qui révèle la valeur courante
// — cf. la lecture OrgSecret est ouverte aux DEV+).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/api";

type Params = { params: Promise<{ slug: string; key: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug, key } = await params;
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const secret = await prisma.orgSecret.findUnique({
    where: {
      organizationId_key: { organizationId: access.organization.id, key },
    },
    select: { id: true },
  });
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await prisma.orgSecretVersion.findMany({
    where: { orgSecretId: secret.id },
    orderBy: { version: "desc" },
    select: {
      version: true,
      createdAt: true,
      createdBy: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json({
    versions: versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      actor: v.createdBy
        ? { id: v.createdBy.id, email: v.createdBy.email }
        : null,
    })),
  });
}
