// GET  /api/projects/[slug]/[env]/secrets/[key]/versions/[version]
//   → Reveal de la valeur déchiffrée d'une version historique.
//   RBAC : EDITOR+ (mêmes droits que reveal courant).
//   Audit : SECRET_VERSION_REVEAL avec metadata.version.
//
// POST /api/projects/[slug]/[env]/secrets/[key]/versions/[version]/rollback
//   → Restaure cette version comme valeur courante (cf. étape 5).
//   Implémenté dans rollback/route.ts pour séparer les responsabilités.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { requireEnvironment } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = {
  params: Promise<{
    slug: string;
    env: string;
    key: string;
    version: string;
  }>;
};

export async function GET(req: Request, { params }: Params) {
  const { slug, env, key, version: versionStr } = await params;
  const versionNum = Number.parseInt(versionStr, 10);
  if (!Number.isInteger(versionNum) || versionNum < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const access = await requireEnvironment(slug, env, "EDITOR");
  if ("error" in access) return access.error;

  const secret = await prisma.secret.findUnique({
    where: {
      environmentId_key: { environmentId: access.environment.id, key },
    },
    select: { id: true },
  });
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versionRow = await prisma.secretVersion.findUnique({
    where: {
      secretId_version: { secretId: secret.id, version: versionNum },
    },
    select: { encryptedValue: true, iv: true, tag: true },
  });
  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const value = decrypt(versionRow);

  logAction({
    action: "SECRET_VERSION_REVEAL",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "Secret",
    targetId: secret.id,
    secretKey: key,
    metadata: { version: versionNum },
    req,
  });

  return NextResponse.json({ version: versionNum, value });
}
