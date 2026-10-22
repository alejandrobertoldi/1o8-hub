// Which client codes have a logo in Drive (1o8 Hub_Backend/Client Logos).
//
// Every client logo shown in the Hub comes from that folder, via
// /client-logos/{CODE}.png. Surfaces that can't recover from a missing image
// (the email, the rank chart's SVG layout) ask this index first so they only
// emit a logo URL for clients that actually have one.

import { unstable_cache } from "next/cache";
import { listClientLogoCodes } from "./drive-logos";

const getCodes = unstable_cache(
  async (): Promise<string[]> => [...(await listClientLogoCodes())],
  ["client-logo-index-v1"],
  { revalidate: 3600, tags: ["client-logos"] }
);

/** Codes with a Drive logo. Empty set (no logos) if Drive is unreachable. */
export async function getClientLogoCodes(): Promise<Set<string>> {
  try {
    return new Set(await getCodes());
  } catch (err) {
    console.error("[client-logos] index lookup failed:", err);
    return new Set();
  }
}

/** The Hub logo URL for a client, or null when Drive has none for it. */
export function driveLogoSrc(
  clientIdCode: string | null | undefined,
  codes: Set<string>
): string | null {
  if (!clientIdCode) return null;
  const code = clientIdCode.toUpperCase();
  return codes.has(code) ? `/client-logos/${code}.png` : null;
}
