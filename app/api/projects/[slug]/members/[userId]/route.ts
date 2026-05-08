// PATCH /api/projects/[slug]/members/[userId]
//
// Modifie l'etat d'un OrgMember sur le projet :
//   - hidden : boolean (le projet est masque pour cet user)
//   - role : "VIEWER" | "EDITOR" | "OWNER"
//
// Comportement :
//   - Cible un OrgMember de l'org du projet. 404 sinon (anti-leak).
//   - Refuse de modifier un OrgADMIN/OWNER (toujours OWNER implicite, son
//     hidden serait ignore — on bloque pour eviter la confusion).
//   - Cree la ligne ProjectMember si absente, sinon update.
//   - Audit `PROJECT_MEMBER_VISIBILITY_CHANGE` ou `PROJECT_MEMBER_ROLE_CHANGE`.

import { NextResponse } from "next/server";
import type { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readJson, requireProjectMember } from "@/lib/api";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string; userId: string }> };

type Body = {
  hidden?: boolean;
  role?: ProjectRole;
};

const ROLES: ProjectRole[] = ["VIEWER", "EDITOR", "OWNER"];

export async function PATCH(req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const access = await requireProjectMember(slug, "OWNER");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    typeof body.hidden !== "boolean" &&
    (typeof body.role !== "string" || !ROLES.includes(body.role))
  ) {
    return NextResponse.json(
      { error: "hidden (boolean) or role (VIEWER|EDITOR|OWNER) required" },
      { status: 400 },
    );
  }

  // Verifie que l'user cible est bien OrgMember de l'org du projet.
  const orgMember = await prisma.orgMember.findFirst({
    where: { userId, organizationId: access.project.organizationId },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!orgMember) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (orgMember.role === "OWNER" || orgMember.role === "ADMIN") {
    return NextResponse.json(
      {
        error:
          "Cannot modify OrgADMIN/OWNER on project — they always have implicit OWNER access",
      },
      { status: 400 },
    );
  }

  // Lit l'etat existant.
  const existing = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: { userId, projectId: access.project.id },
    },
  });

  const nextHidden =
    typeof body.hidden === "boolean" ? body.hidden : existing?.hidden ?? false;
  const nextRole: ProjectRole =
    typeof body.role === "string" ? body.role : existing?.role ?? "VIEWER";

  // Optimisation : si l'etat cible est le default (hidden=false, role=VIEWER)
  // ET aucune ligne n'existe, on ne cree pas de ligne pour rien — l'access
  // est deja VIEWER implicite par defaut.
  // Mais si une ligne existe deja, on update plutot que delete (pour ne pas
  // perdre l'historique d'audit qui reference targetId potentiellement).
  let updated;
  if (existing) {
    updated = await prisma.projectMember.update({
      where: { id: existing.id },
      data: { hidden: nextHidden, role: nextRole },
    });
  } else if (nextHidden || nextRole !== "VIEWER") {
    updated = await prisma.projectMember.create({
      data: {
        projectId: access.project.id,
        userId,
        hidden: nextHidden,
        role: nextRole,
      },
    });
  } else {
    // Defaut, pas de changement effectif — on ne cree rien. 200 idempotent.
    return NextResponse.json({ ok: true, noop: true });
  }

  // Audit : on log soit visibility soit role selon ce qui a change.
  const visibilityChanged =
    typeof body.hidden === "boolean" &&
    (existing?.hidden ?? false) !== body.hidden;
  const roleChanged =
    typeof body.role === "string" && (existing?.role ?? "VIEWER") !== body.role;

  if (visibilityChanged) {
    logAction({
      action: "PROJECT_MEMBER_VISIBILITY_CHANGE",
      actor: { kind: "user", userId: access.user.id, email: access.user.email },
      organizationId: access.project.organizationId,
      projectId: access.project.id,
      targetType: "ProjectMember",
      targetId: updated.id,
      metadata: {
        targetUserId: userId,
        targetEmail: orgMember.user.email,
        hidden: nextHidden,
      },
      req,
    });
  }
  if (roleChanged) {
    logAction({
      action: "PROJECT_MEMBER_ROLE_CHANGE",
      actor: { kind: "user", userId: access.user.id, email: access.user.email },
      organizationId: access.project.organizationId,
      projectId: access.project.id,
      targetType: "ProjectMember",
      targetId: updated.id,
      metadata: {
        targetUserId: userId,
        targetEmail: orgMember.user.email,
        from: existing?.role ?? "VIEWER",
        to: nextRole,
      },
      req,
    });
  }

  return NextResponse.json({ ok: true });
}
