// GET /api/projects/[slug]/members
//
// Liste tous les OrgMembers de l'org du projet avec leur etat effectif :
//   - role : "OWNER" | "EDITOR" | "VIEWER"
//   - hidden : boolean (le projet est masque pour cet user)
//   - source : "org_admin" (OWNER implicite via OrgADMIN+) | "explicit"
//     (ligne ProjectMember non-hidden) | "default" (pas de ligne, VIEWER
//     implicite par defaut)
//
// OWNER+ projet uniquement (geree par requireProjectMember). Les
// OrgADMIN/OWNER apparaissent en "source: org_admin" et ne peuvent etre
// modifies (l'UI desactive les controles ; le PATCH refuse aussi).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "OWNER");
  if ("error" in access) return access.error;

  // Tous les OrgMembers de l'org parente.
  const orgMembers = await prisma.orgMember.findMany({
    where: { organizationId: access.project.organizationId },
    select: {
      role: true,
      user: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Project members existants (lignes explicites).
  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: access.project.id },
    select: { userId: true, role: true, hidden: true },
  });
  const pmByUserId = new Map(
    projectMembers.map((pm) => [pm.userId, pm]),
  );

  const items = orgMembers.map((m) => {
    const isOrgAdmin = m.role === "OWNER" || m.role === "ADMIN";
    const pm = pmByUserId.get(m.user.id);
    if (isOrgAdmin) {
      return {
        userId: m.user.id,
        email: m.user.email,
        orgRole: m.role,
        role: "OWNER" as const,
        hidden: false,
        source: "org_admin" as const,
        editable: false,
      };
    }
    if (pm) {
      return {
        userId: m.user.id,
        email: m.user.email,
        orgRole: m.role,
        role: pm.role,
        hidden: pm.hidden,
        source: "explicit" as const,
        editable: true,
      };
    }
    return {
      userId: m.user.id,
      email: m.user.email,
      orgRole: m.role,
      role: "VIEWER" as const,
      hidden: false,
      source: "default" as const,
      editable: true,
    };
  });

  return NextResponse.json({ members: items });
}
