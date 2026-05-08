// /docs — page d'accueil de la doc, liste les catégories disponibles.

import Link from "next/link";
import { RiArrowRightLine, RiBookOpenLine } from "@remixicon/react";
import { listDocPages } from "@/lib/docs";
import { DocIcon } from "@/lib/docs-icons";

export default async function DocsIndexPage() {
  const pages = await listDocPages();
  return (
    <>
      <div className="docs-hero">
        <div className="docs-hero-icon">
          <RiBookOpenLine size={28} aria-hidden />
        </div>
        <div>
          <h1 className="docs-hero-title">Documentation</h1>
          <p className="docs-hero-subtitle">
            Guides d&apos;utilisation de Physalis. Choisissez une section
            ci-dessous ou via la barre latérale.
          </p>
        </div>
      </div>

      <div className="docs-grid">
        {pages.map((p, idx) => (
          <Link key={p.slug} href={`/docs/${p.slug}`} className="docs-card">
            <div className="docs-card-icon">
              <DocIcon name={p.icon} size={22} />
            </div>
            <div className="docs-card-body">
              <div className="docs-card-eyebrow">
                Section {String(idx + 1).padStart(2, "0")}
              </div>
              <div className="docs-card-title">{p.title}</div>
              <div className="docs-card-summary">{p.summary}</div>
            </div>
            <div className="docs-card-arrow" aria-hidden>
              <RiArrowRightLine size={16} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
