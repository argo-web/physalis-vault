// Layout commun aux pages /docs/* : sidebar gauche avec la liste des
// catégories (lue depuis docs/documentation/*.md), contenu à droite.
//
// La layout est un Server Component (lecture filesystem) ; la nav active
// est gérée par un sous-composant client (DocsSidebarNav).

import type { ReactNode } from "react";
import { listDocPages } from "@/lib/docs";
import DocsSidebar from "./docs-sidebar";

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pages = await listDocPages();
  return (
    <div className="page">
      <div className="page-content docs-shell">
        <DocsSidebar pages={pages} />
        <div className="docs-main">{children}</div>
      </div>
    </div>
  );
}
