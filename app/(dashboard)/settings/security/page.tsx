import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SecurityPanel from "./security-panel";
import PluginSessionsPanel from "./plugin-sessions-panel";
import UserTokensPanel from "./user-tokens-panel";

export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      twoFactorEnabled: true,
      backupCodes: true,
    },
  });
  if (!me) return null;

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">← Tableau de bord</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Sécurité</h1>
            <div className="page-subtitle">{me.email}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SecurityPanel
            initialEnabled={me.twoFactorEnabled}
            initialBackupCount={me.backupCodes.length}
          />
          <UserTokensPanel />
          <PluginSessionsPanel />
        </div>
      </div>
    </div>
  );
}
