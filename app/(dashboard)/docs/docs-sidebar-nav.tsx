"use client";

// Sidebar nav de la documentation. Reçoit la liste des pages depuis le
// Server Component layout (qui lit le filesystem) et gère l'état actif via
// usePathname côté client. Pas de fetch — la liste arrive en props.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RiBookOpenLine } from "@remixicon/react";
import { DocIcon } from "@/lib/docs-icons";
import type { DocPage } from "@/lib/docs";

export default function DocsSidebarNav({ pages }: { pages: DocPage[] }) {
  const pathname = usePathname() ?? "";
  const isHome = pathname === "/docs";
  const activeSlug = isHome
    ? null
    : pathname.startsWith("/docs/")
      ? pathname.slice("/docs/".length)
      : null;

  return (
    <nav className="docs-nav" aria-label="Sections de la documentation">
      <Link
        href="/docs"
        className={`docs-nav-item${isHome ? " active" : ""}`}
        aria-current={isHome ? "page" : undefined}
      >
        <span className="docs-nav-icon">
          <RiBookOpenLine size={16} aria-hidden />
        </span>
        <span className="docs-nav-label">Accueil</span>
      </Link>
      {pages.map((p, idx) => {
        const active = activeSlug === p.slug;
        return (
          <Link
            key={p.slug}
            href={`/docs/${p.slug}`}
            className={`docs-nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="docs-nav-num">{String(idx + 1).padStart(2, "0")}</span>
            <span className="docs-nav-icon">
              <DocIcon name={p.icon} size={16} />
            </span>
            <span className="docs-nav-label">{p.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
