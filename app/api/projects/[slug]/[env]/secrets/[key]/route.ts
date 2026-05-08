import { NextResponse } from "next/server";
// Route session-based (requireEnvironment → tenant context entré) →
// utilise le strict prisma qui auto-route via search_path.
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { readJson, requireEnvironment } from "@/lib/api";
import { isValidCategory } from "@/lib/categories";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string; env: string; key: string }> };

// Reveal a single secret value (web UI - one key at a time, never bulk).
export async function GET(req: Request, { params }: Params) {
  const { slug, env, key } = await params;
  const access = await requireEnvironment(slug, env);
  if ("error" in access) return access.error;

  const secret = await prisma.secret.findUnique({
    where: {
      environmentId_key: { environmentId: access.environment.id, key },
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
    action: "SECRET_REVEAL",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "Secret",
    targetId: secret.id,
    secretKey: secret.key,
    req,
  });

  return NextResponse.json({ key: secret.key, value });
}

/**
 * PATCH partiel — pour l'instant uniquement la categorie. Permet de
 * recategoriser un secret depuis la liste sans avoir a re-saisir sa
 * valeur (ce que ferait POST upsert). N'effectue pas de decrypt/re-encrypt.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug, env, key } = await params;
  const access = await requireEnvironment(slug, env, "EDITOR");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as
    | { category?: string | null }
    | null;
  if (!body || !("category" in body)) {
    return NextResponse.json(
      { error: "category is required (string from the allowed list, or null)" },
      { status: 400 },
    );
  }

  let category: string | null = null;
  if (body.category !== null && body.category !== "" && body.category !== undefined) {
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
    select: { id: true, key: true, category: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.category === category) {
    // No-op : pas de write, pas d'audit log inutile.
    return NextResponse.json({
      secret: { key: existing.key, category: existing.category },
    });
  }

  const updated = await prisma.secret.update({
    where: { id: existing.id },
    data: { category },
    select: { key: true, category: true, updatedAt: true },
  });

  logAction({
    action: "SECRET_UPDATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "Secret",
    targetId: existing.id,
    secretKey: existing.key,
    metadata: {
      changedFields: ["category"],
      from: existing.category,
      to: category,
    },
    req,
  });

  return NextResponse.json({ secret: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug, env, key } = await params;
  const access = await requireEnvironment(slug, env, "EDITOR");
  if ("error" in access) return access.error;

  const existing = await prisma.secret.findUnique({
    where: {
      environmentId_key: { environmentId: access.environment.id, key },
    },
    select: { id: true, key: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.secret.delete({ where: { id: existing.id } });

  logAction({
    action: "SECRET_DELETE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    environmentId: access.environment.id,
    targetType: "Secret",
    targetId: existing.id,
    secretKey: existing.key,
    req,
  });

  return NextResponse.json({ ok: true });
}
