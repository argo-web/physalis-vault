import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrgSlug, requireUser } from "@/lib/api";

// Lightweight endpoint for the org switcher: returns the user's orgs and the
// currently-selected slug. Used by the header UI.
export async function GET() {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const currentSlug = await getCurrentOrgSlug(user.id);

  return NextResponse.json({
    organizations: memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
    currentSlug,
  });
}
