"use client";

import { use } from "react";
import { RevisionReviewPanel } from "@/components/seo/revision/revision-review-panel";

// Standalone review page (links, emails). S6.9 renders the same panel inline.
export default function SeoRevisionReviewPage({ params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = use(params);
  return <RevisionReviewPanel projectId={id} revisionId={revisionId} />;
}
