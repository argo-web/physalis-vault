import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SecurityPanel from "./security-panel";
import PluginSessionsPanel from "./plugin-sessions-panel";
import UserTokensPanel from "./user-tokens-panel";
import pkg from "@/package.json";

export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const t = await getTranslations("settings.security");

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
          <Link href="/dashboard">← {t("pageTitle")}</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("pageTitle")}</h1>
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
          <div className="settings-section" style={{ padding: "12px 16px" }}>
            <span className="row-meta code-mono">{t("versionInfo", { version: pkg.version })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
