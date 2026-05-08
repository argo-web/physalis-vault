import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const GET = handlers.GET;

// Rate-limit credential login attempts: 5 / 15 min per IP.
export async function POST(req: NextRequest) {
  const path = new URL(req.url).pathname;
  if (path.endsWith("/callback/credentials")) {
    const limited = rateLimit(req, "login", {
      max: 5,
      windowMs: 15 * 60_000,
    });
    if (limited) return limited;
  }
  return handlers.POST(req);
}
