import Link from "next/link";
import { Construction } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export const metadata = { title: "Blog Writer | 1o8 Hub" };

/** Placeholder until the 1o8 SEO blog tool (seo-writer) moves into the hub. */
export default function BlogWriterPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Blog Writer">
          <span className="font-bold text-sidebar-foreground">Blog</span>
          <span className="font-normal text-brand">Writer</span>
        </h1>
      </PageMetaSlot>
      <div className="rounded-2xl border bg-card p-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Construction className="size-7" />
        </span>
        <h2 className="mt-5 text-2xl font-bold">Under construction</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The 1o8 blog writer (keywords, content ideas and blog posts per client) is moving into the hub. Each
          client&apos;s brand voice already lives here.
        </p>
        <Link
          href="/clients"
          className="mt-6 inline-flex rounded-full border border-brand/40 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
        >
          Go to clients → Client Settings → Brand Voice
        </Link>
      </div>
    </div>
  );
}
