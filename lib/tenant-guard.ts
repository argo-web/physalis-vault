// Stub self-host : pas de tenant context. requireTenantContext renvoie
// la session sans slug (slug vide pour cohérence du type).

import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function requireTenantContext(): Promise<{
  slug: string;
  userId: string;
  email: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return {
    slug: "",
    userId: session.user.id,
    email: session.user.email ?? "",
  };
}

export function withTenantRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
): (...args: TArgs) => Promise<Response> | Response {
  return handler;
}

export function withTenantAction<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<TResult> | TResult {
  return handler;
}
