import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RiArrowLeftLine } from "@remixicon/react";
import { getDocPage } from "@/lib/docs";
import { DocIcon } from "@/lib/docs-icons";

type Params = { params: Promise<{ locale: string; slug: string }> };

// Rendu dynamique (comme la liste et tout le dashboard) : la page vit sous le
// layout `(dashboard)` qui utilise la session → pas de pré-génération statique
// possible. Un `generateStaticParams` ici déclenchait `DYNAMIC_SERVER_USAGE`
// (getTranslations lit les headers sans setRequestLocale) → 500.

export default async function DocsPage({ params }: Params) {
  const { locale, slug } = await params;
  const t = await getTranslations("docs");
  const page = await getDocPage(slug, locale);
  if (!page) notFound();

  return (
    <>
      <Link href="/docs" className="docs-backlink">
        <RiArrowLeftLine size={14} aria-hidden />
        {t("backLink")}
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
