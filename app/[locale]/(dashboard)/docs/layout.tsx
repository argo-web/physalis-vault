import type { ReactNode } from "react";
import { listDocPages } from "@/lib/docs";
import DocsSidebar from "./docs-sidebar";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function DocsLayout({ children, params }: Props) {
  const { locale } = await params;
  const pages = await listDocPages(locale);
  return (
    <div className="page">
      <div className="page-content docs-shell">
        <DocsSidebar pages={pages} />
        <div className="docs-main">{children}</div>
      </div>
    </div>
  );
}
