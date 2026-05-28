import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || !isSuperadmin(session.user.role)) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="app-header">
        <div className="flex items-center gap-6">
          <Link href={`/${locale}/admin`} className="brand">
            Physalis <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>admin</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href={`/${locale}/admin/users`} className="btn btn-ghost btn-sm">Utilisateurs</Link>
            <Link href={`/${locale}/admin/orgs`} className="btn btn-ghost btn-sm">Organisations</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/dashboard`} className="btn btn-ghost btn-sm">← Dashboard</Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: `/${locale}/login` });
            }}
          >
            <button type="submit" className="btn btn-ghost btn-sm">Déconnexion</button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
