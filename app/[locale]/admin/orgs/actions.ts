"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

async function guardSuperadmin() {
  const session = await auth();
  if (!session?.user || !isSuperadmin(session.user.role)) {
    const locale = await getLocale();
    redirect(`/${locale}/dashboard`);
  }
}

export async function deleteOrg(orgId: string) {
  await guardSuperadmin();
  // onDelete: Cascade sur Project, OrgMember, Invitation, OrgSecret
  await prisma.organization.delete({ where: { id: orgId } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/orgs`);
}
