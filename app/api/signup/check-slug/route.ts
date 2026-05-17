import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidClientSlug } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { RESERVED_SIGNUP_SLUGS } from "@/lib/signup-reserved-slugs";

export async function GET(req: Request) {
  const limited = rateLimit(req, "signup-check-slug", { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();

  if (!slug) return NextResponse.json({ available: false, reason: "empty" });
  if (!isValidClientSlug(slug)) return NextResponse.json({ available: false, reason: "invalid_format" });
  if (RESERVED_SIGNUP_SLUGS.has(slug)) return NextResponse.json({ available: false, reason: "reserved" });

  const existing = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ available: false, reason: "taken" });

  return NextResponse.json({ available: true });
}
