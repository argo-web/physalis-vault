// GET /api/orgs/[slug]/projects — liste les projets d'une organisation.
//
// Réservé aux membres de l'org (lecture seule). Utilisé par le panel
// OrgTokensPanel pour le selector de projets autorisés.
//
// RBAC :
//   - OrgADMIN+ : voit tous les projets de l'org (même ceux où il n'est
//                 pas membre — un OrgADMIN a accès implicite)
//   - OrgDEV / MEMBER : voit uniquement ses ProjectMember (cohérent avec
//                       les contraintes de validateDevTokenCreation)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/api";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireOrgMember(slug);
  if ("error" in access) return access.error;

  const isAdmin = access.role === "OWNER" || access.role === "ADMIN";

  const projects = isAdmin
    ? await prisma.project.findMany({
        where: { organizationId: access.organization.id },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      })
    : await prisma.project.findMany({
        where: {
          organizationId: access.organization.id,
          members: { some: { userId: access.user.id } },
        },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      });

  return NextResponse.json({ projects });
}
