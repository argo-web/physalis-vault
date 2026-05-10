// PATCH/DELETE d'une collection perso. Réservé au propriétaire.
//
// DELETE : SetNull sur VaultEntry.collectionId via FK → les entrées
// retournent dans "Sans catégorie" (pas de cascade destructive).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser, slugify } from "@/lib/api";
import { logAction } from "@/lib/audit";

const NAME_MAX = 80;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const existing = await prisma.vaultCollection.findFirst({
    where: { id, userId: user.id },
    select: { id: true, slug: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await readJson(req)) as { name?: string } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `name required (1-${NAME_MAX} chars)` },
      { status: 400 },
    );
  }

  const newSlug = slugify(name);
  if (!newSlug) {
    return NextResponse.json(
      { error: "name produces an empty slug" },
      { status: 400 },
    );
  }

  if (newSlug !== existing.slug) {
    const conflict = await prisma.vaultCollection.findUnique({
      where: { userId_slug: { userId: user.id, slug: newSlug } },
      select: { id: true },
    });
    if (conflict && conflict.id !== existing.id) {
      return NextResponse.json(
        { error: "A collection with this name already exists" },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.vaultCollection.update({
    where: { id: existing.id },
    data: { name, slug: newSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ collection: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const existing = await prisma.vaultCollection.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.vaultCollection.delete({ where: { id: existing.id } });

  logAction({
    action: "VAULT_PERSONAL_COLLECTION_DELETE",
    actor: { kind: "user", userId: user.id, email: user.email },
    targetType: "VaultCollection",
    targetId: existing.id,
    metadata: { name: existing.name, slug: existing.slug },
    req,
  });

  return NextResponse.json({ ok: true });
}
