import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/lib/auth";
import { adminPrisma, prisma } from "@/lib/prisma";
import { getCurrentOrgSlug } from "@/lib/api";
import { requireTenantContext } from "@/lib/tenant-guard";
import { getTenantLoginUrl } from "@/lib/plans";
import OrgSwitcher from "./org-switcher";
import HeaderNav from "./header-nav";

const TENANT_DOMAIN = process.env.PHYSALIS_TENANT_DOMAIN ?? "physalis.cloud";
const SHARED_PORTAL =
  process.env.PHYSALIS_SHARED_PORTAL ?? "vault.physalis.cloud";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Phase 5.1 — entrée du contexte tenant pour TOUTES les pages /(dashboard)/*.
  // Les `prisma.X.Y(...)` en aval (dans cette layout, dans les pages, et dans
  // les server components imbriqués qui s'exécutent dans la même requête)
  // résolvent automatiquement vers `client_<slug>.X` via search_path.
  // Si pas de session ou pas de tenant slug → redirect (cf. requireTenantContext).
  const { slug, userId, email } = await requireTenantContext();

  // URL de logout : on renvoie l'user vers SA page de login tenant
  // (sous-domaine pour SHARED/DEDICATED, ?tenant= pour FREE) sinon NextAuth
  // utilise NEXTAUTH_URL=vault.physalis.cloud/login et l'user retombe sur le
  // portail SUPERADMIN où ses creds tenant sont rejetés.
  const tenantClient = await adminPrisma.client.findUnique({
    where: { slug },
    select: { plan: true },
  });
  const logoutRedirect = tenantClient
    ? getTenantLoginUrl(tenantClient.plan, slug, {
        tenantDomain: TENANT_DOMAIN,
        sharedPortal: SHARED_PORTAL,
      })
    : "/login";

  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const currentSlug = await getCurrentOrgSlug(userId);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="app-header">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="brand">
            <Image
              src="/icon-32.png"
              alt=""
              width={26}
              height={26}
              priority
              style={{ flexShrink: 0 }}
            />
            Physalis
          </Link>
          <OrgSwitcher
            organizations={memberships.map((m) => ({
              ...m.organization,
              role: m.role,
            }))}
            currentSlug={currentSlug}
          />
          <HeaderNav />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/security"
            className="user-link"
            title="Paramètres de sécurité (2FA, sessions plugin)"
          >
            {email}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: logoutRedirect });
            }}
          >
            <button type="submit" className="btn btn-ghost btn-sm">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
