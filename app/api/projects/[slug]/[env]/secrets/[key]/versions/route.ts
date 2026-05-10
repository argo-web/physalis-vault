// GET /api/projects/[slug]/[env]/secrets/[key]/versions
//
// Liste les versions historiques d'un Secret. RBAC : EDITOR+ (mêmes
// droits que `GET /...secrets/[key]` qui révèle la valeur courante).
//
// Réponse : tableau d'objets `{ version, createdAt, actor }` SANS la
// valeur déchiffrée. Pour récupérer une valeur historique, l'user
// doit appeler explicitement `GET .../versions/[version]` (qui
// loggue un SECRET_VERSION_REVEAL audit).
//
// Pas d'audit log côté list (pas de révélation de valeur).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEnvironment } from "@/lib/api";

type Params = { params: Promise<{ slug: string; env: string; key: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug, env, key } = await params;
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

  const versions = await prisma.secretVersion.findMany({
    where: { secretId: secret.id },
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
