"use client";

// Wrapper de l'aside de la doc. Cache l'aside sur la home `/docs` (la
// page d'accueil affiche la grille des sections en pleine largeur). Sur
// les pages /docs/[slug] on rend l'aside complete.

import { usePathname } from "next/navigation";
import DocsSidebarNav from "./docs-sidebar-nav";
import type { DocPage } from "@/lib/docs";

export default function DocsSidebar({ pages }: { pages: DocPage[] }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/docs") return null;
  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-eyebrow">Documentation</div>
      <div className="docs-sidebar-count">{pages.length} sections</div>
      <DocsSidebarNav pages={pages} />
    </aside>
  );
}
