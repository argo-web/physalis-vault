"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiBookOpenLine,
  RiFolderOpenLine,
  RiSafe2Line,
  RiShareForward2Line,
  type RemixiconComponentType,
} from "@remixicon/react";

type NavItem = { href: string; label: string; Icon?: RemixiconComponentType };

export default function HeaderNav() {
  const pathname = usePathname() ?? "";

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
    <nav className="app-nav">
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
  );
}
