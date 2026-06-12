"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import DocsSidebarNav from "./docs-sidebar-nav";
import type { DocPage } from "@/lib/docs";

export default function DocsSidebar({ pages }: { pages: DocPage[] }) {
  const t = useTranslations("docs");
  const pathname = usePathname() ?? "";
  // Hide sidebar on docs index (usePathname from next-intl is locale-stripped)
  if (/^\/docs\/?$/.test(pathname)) return null;
  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-eyebrow">{t("title")}</div>
      <div className="docs-sidebar-count">
        {pages.length} {t("section").toLowerCase()}s
      </div>
      <DocsSidebarNav pages={pages} />
    </aside>
  );
}
