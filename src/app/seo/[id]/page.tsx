import SeoProjectFlow from "@/components/seo/seo-project-flow";

export const metadata = { title: "SEO Project | 1o8 Hub" };

// One page for the whole SEO Manager: the six phases are stacked cards
// (see SeoProjectFlow). The project shell (layout.tsx) supplies the header,
// project state and the per-phase sub-step registry.
export default function ProjectPage() {
  return <SeoProjectFlow />;
}
