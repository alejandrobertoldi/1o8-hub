// Route entry for /design/brand-story/[clientIdCode].
//
// The full page implementation lives in ./page.client.tsx (a client component).
// page.tsx previously carried a near-identical *duplicate* implementation that was
// never imported — so the screenview-replace feature built in page.client.tsx
// (commit 801a7f6d) was dead code and never rendered. This wrapper makes
// page.client.tsx the canonical implementation, mirroring the listing-images route.
import BrandStoryDetailPage from "./page.client";

export default function Page() {
  return <BrandStoryDetailPage />;
}
