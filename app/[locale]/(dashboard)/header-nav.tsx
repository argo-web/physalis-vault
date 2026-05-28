"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiBookOpenLine,
  RiFolderOpenLine,
  RiMenuLine,
  RiCloseLine,
  RiSafe2Line,
  RiShareForward2Line,
  type RemixiconComponentType,
} from "@remixicon/react";

type NavItem = { href: string; label: string; Icon?: RemixiconComponentType };

export default function HeaderNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Ferme le menu au changement de route (clic sur un lien) ET au clic
  // hors du wrapper + a la touche Escape (UX dropdown standard).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: NavItem[] = [
    { href: "/projects", label: "Projets", Icon: RiFolderOpenLine },
    { href: "/vault", label: "Coffre personnel", Icon: RiSafe2Line },
    { href: "/shares", label: "Partages", Icon: RiShareForward2Line },
    { href: "/docs", label: "Documentation", Icon: RiBookOpenLine },
  ];

  function isActive(href: string): boolean {
    if (href === "/projects") return pathname.startsWith("/projects");
    if (href === "/vault") return pathname === "/vault";
    if (href === "/shares") return pathname === "/shares";
    if (href === "/docs") return pathname.startsWith("/docs");
    return pathname === href;
  }

  return (
    <div className="app-nav-wrap" ref={wrapRef}>
      <button
        type="button"
        className="app-nav-toggle"
        aria-expanded={open}
        aria-controls="app-nav-menu"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <RiCloseLine size={20} aria-hidden /> : <RiMenuLine size={20} aria-hidden />}
      </button>
      <nav
        id="app-nav-menu"
        className={`app-nav${open ? " is-open" : ""}`}
        aria-label="Navigation principale"
      >
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "active" : ""}
          >
            {Icon && <Icon size={15} aria-hidden />}
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
