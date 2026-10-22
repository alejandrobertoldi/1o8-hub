import { notFound } from "next/navigation";
import { getGuide, HELP_GUIDES } from "@/lib/help/registry";
import { loadGuideHtml } from "@/lib/help/load-guide";
import { HelpDocHeader } from "@/components/help/help-doc-header";

export function generateStaticParams() {
  return HELP_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  return { title: guide ? `${guide.title} · Help · 1o8 Hub` : "Help · 1o8 Hub" };
}

export default async function HelpGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const html = await loadGuideHtml(slug);
  if (!html) notFound();

  return (
    <div className="help-doc">
      <HelpDocHeader
        title={guide.title}
        subtitle={guide.subtitle}
        version={guide.version}
        metaNote={guide.metaNote}
        videoUrl={guide.videoUrl}
      />
      <div className="container" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
