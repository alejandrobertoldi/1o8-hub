import { redirect } from "next/navigation";

// The SEO Manager is one page now: every phase is a card on /seo/[id].
// Old per-phase URLs keep working by jumping to their card.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/seo/${id}#s5`);
}
