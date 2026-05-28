// /docs/[slug] — rend une page markdown depuis docs/documentation/<slug>.md.
//
// Le HTML est généré server-side avec marked (source de confiance, on contrôle
// le contenu en repo) et injecté via dangerouslySetInnerHTML. Les styles sont
// appliqués par .docs-prose (cf. globals.css).

import Link from "next/link";
import { notFound } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";
import { getDocPage, listDocPages } from "@/lib/docs";
import { DocIcon } from "@/lib/docs-icons";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const pages = await listDocPages();
  return pages.map((p) => ({ slug: p.slug }));
}

export default async function DocsPage({ params }: Params) {
  const { slug } = await params;
  const page = await getDocPage(slug);
  if (!page) notFound();

  return (
    <>
      <Link href="/docs" className="docs-backlink">
        <RiArrowLeftLine size={14} aria-hidden />
        Toute la documentation
      </Link>
      <div className="docs-page-eyebrow">
        <span className="docs-page-icon">
          <DocIcon name={page.icon} size={14} />
        </span>
        <span>{page.title}</span>
      </div>
      <article
        className="docs-prose"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </>
  );
}
