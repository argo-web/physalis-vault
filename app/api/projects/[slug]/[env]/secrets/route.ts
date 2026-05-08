import { NextResponse } from "next/server";
// Route session-based (requireEnvironment → requireUser → tenant context
// entré) → utilise le strict prisma qui auto-route via search_path.
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  isValidSecretKey,
  readJson,
  requireEnvironment,
} from "@/lib/api";
import { isValidCategory } from "@/lib/categories";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; env: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug, env } = await params;
  const access = await requireEnvironment(slug, env);
  if ("error" in access) return access.error;

  const secrets = await prisma.secret.findMany({
    where: { environmentId: access.environment.id },
    select: { key: true, category: true, updatedAt: true, createdAt: true },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ secrets });
}

export async function POST(req: Request, { params }: Params) {
  const { slug, env } = await params;
  const access = await requireEnvironment(slug, env, "EDITOR");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | { key?: string; value?: string; category?: string | null }
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
      {
        error:
          "Invalid key (must match [A-Z][A-Z0-9_]{0,127}, e.g. DATABASE_URL)",
      },
      { status: 400 },
    );
  }

  // category : null/absent/"" → "sans catégorie" (DB null) ; sinon doit
  // matcher la liste hardcodée de lib/categories.ts.
  let category: string | null = null;
  if (
    body.category !== undefined &&
    body.category !== null &&
    body.category !== ""
  ) {
    if (!isValidCategory(body.category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 },
      );
    }
    category = body.category;
  }

  const existing = await prisma.secret.findUnique({
    where: {
      environmentId_key: { environmentId: access.environment.id, key },
    },
    select: { id: true },
  });

  const payload = encrypt(body.value);
  const secret = await prisma.secret.upsert({
    where: {
      environmentId_key: { environmentId: access.environment.id, key },
    },
    create: {
      key,
      environmentId: access.environment.id,
      category,
      ...payload,
    },
    update: { ...payload, category },
    select: {
      id: true,
      key: true,
      category: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  logAction({
    action: existing ? "SECRET_UPDATE" : "SECRET_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "Secret",
    targetId: secret.id,
    secretKey: key,
    metadata: { category: secret.category },
    req,
  });

  return NextResponse.json(
    {
      secret: {
        key: secret.key,
        category: secret.category,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    },
    { status: 200 },
  );
}
