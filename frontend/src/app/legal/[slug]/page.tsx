import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { LEGAL_DOCS, loadLegalDoc, type LegalSlug } from "@/features/legal/docs";

// Rendered once at build time from docs/legal: the repository is the single source.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_DOCS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = loadLegalDoc(slug as LegalSlug);
  return { title: doc.title, alternates: { canonical: `/legal/${slug}` } };
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LegalPage doc={loadLegalDoc(slug as LegalSlug)} current={`/legal/${slug}`} />;
}
