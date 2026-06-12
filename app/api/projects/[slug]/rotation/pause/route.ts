import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireProjectMember } from "@/lib/api";

type Params = { params: Promise<{ slug: string }> };

// PATCH { paused: boolean }
export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "OWNER");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as { paused?: boolean } | null;
  if (!body || typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused (boolean) requis" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: access.project.id },
    data: { rotationPaused: body.paused },
  });

  return NextResponse.json({ rotationPaused: body.paused });
}
