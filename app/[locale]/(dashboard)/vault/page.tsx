import { Link } from "@/i18n/navigation";
import { RiSafe2Line } from "@remixicon/react";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import VaultPanel from "./vault-panel";

export default async function VaultPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const t = await getTranslations("vault");

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">← Tableau de bord</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <RiSafe2Line size={22} aria-hidden /> {t("pageTitle")}
            </h1>
            <div className="page-subtitle">
              {t("pageSubtitle")}
            </div>
          </div>
        </div>

        <VaultPanel />
      </div>
    </div>
  );
}
