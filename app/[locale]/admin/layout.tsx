import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("admin.layout");

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="app-header">
        <div className="flex items-center gap-6">
          <Link href={`/${locale}/admin`} className="brand">
            Physalis <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>{t("brandSuffix")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href={`/${locale}/admin/users`} className="btn btn-ghost btn-sm">{t("navUsers")}</Link>
            <Link href={`/${locale}/admin/orgs`} className="btn btn-ghost btn-sm">{t("navOrgs")}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/dashboard`} className="btn btn-ghost btn-sm">{t("backToDashboard")}</Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: `/${locale}/login` });
            }}
          >
            <button type="submit" className="btn btn-ghost btn-sm">{t("signOut")}</button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
