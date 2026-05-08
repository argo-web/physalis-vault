import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CURRENT_ORG_COOKIE, readJson, requireUser } from "@/lib/api";

export async function POST(req: Request) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;

  const body = (await readJson(req)) as { slug?: string } | null;
  const slug = body?.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organization: { slug } },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  const res = NextResponse.json({ ok: true, slug });
  res.cookies.set(CURRENT_ORG_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
