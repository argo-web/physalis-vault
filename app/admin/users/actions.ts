"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

async function guardSuperadmin() {
  const session = await auth();
  if (!session?.user || !isSuperadmin(session.user.role)) redirect("/dashboard");
  return session.user.id;
}

export async function changeUserRole(userId: string, role: Role) {
  const actorId = await guardSuperadmin();
  if (userId === actorId) return; // ne peut pas changer son propre rôle
  await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true },
  });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const actorId = await guardSuperadmin();
  if (userId === actorId) return; // ne peut pas se supprimer soi-même
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}
