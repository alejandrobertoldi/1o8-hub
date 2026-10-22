// Route entry for /design/storefront/[clientIdCode].
//
// The full editor implementation lives in ./page.client.tsx (a client
// component). This thin server wrapper mirrors the brand-story route split so
// the client editor is the canonical implementation.
import StorefrontEditorPage from "./page.client";

export default function Page() {
  return <StorefrontEditorPage />;
}
