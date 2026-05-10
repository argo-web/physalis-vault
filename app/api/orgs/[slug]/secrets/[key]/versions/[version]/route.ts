// GET /api/orgs/[slug]/secrets/[key]/versions/[version]
//
// Reveal de la valeur déchiffrée d'une version historique d'un
// OrgSecret. Audit : ORG_SECRET_VERSION_REVEAL.
//
// Le rollback (POST .../rollback) est dans rollback/route.ts (étape 5).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { requireOrgMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = {
  params: Promise<{ slug: string; key: string; version: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { slug, key, version: versionStr } = await params;
  const versionNum = Number.parseInt(versionStr, 10);
  if (!Number.isInteger(versionNum) || versionNum < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

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

  const versionRow = await prisma.orgSecretVersion.findUnique({
    where: {
      orgSecretId_version: { orgSecretId: secret.id, version: versionNum },
    },
    select: { encryptedValue: true, iv: true, tag: true },
  });
  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const value = decrypt(versionRow);

  logAction({
    action: "ORG_SECRET_VERSION_REVEAL",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "OrgSecret",
    targetId: secret.id,
    secretKey: key,
    metadata: { version: versionNum },
    req,
  });

  return NextResponse.json({ version: versionNum, value });
}
