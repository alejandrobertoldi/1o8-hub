// GET /client-logos/{CODE}.png
//
// Serves the Hub's client marks from Drive
// (1o8 Hub_Backend/Client Logos/{CODE}.png). Every caller keeps the
// same URL it used when these were static files in /public.
//
// Speed: logos are tiny (<50 KB) and change rarely, so two cache layers keep
// production instant:
//   1. Vercel's CDN (s-maxage + a 30-day stale-while-revalidate): every hit
//      after the first is served from the edge, refreshed in the background.
//   2. The Next data cache (unstable_cache), which outlives deploys, so a fresh
//      deploy's first request doesn't wait on Drive either.
// The path ends in .png, so the auth proxy lets it through like any static
// asset — same as the old /public files (the PDF print page needs that).
//
// Drive is the ONLY source: there is no bundled copy. Missing → 404 and the UI
// shows the client's initial; Drive unreachable → 503 with a 30s cache so an
// outage clears fast (the CDN keeps serving the last good copy meanwhile).

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchClientLogo, parseLogoRequest } from "@/lib/client-logos/drive-logos";

const HIT_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=2592000";
const MISS_CACHE = "public, max-age=60, s-maxage=600, stale-while-revalidate=86400";
const ERROR_CACHE = "public, max-age=0, s-maxage=30";

/** Base64 payload so the entry is JSON-serialisable for the data cache. */
const getCachedLogo = unstable_cache(
  async (code: string): Promise<{ b64: string; mimeType: string } | null> => {
    const logo = await fetchClientLogo(code);
    return logo ? { b64: logo.bytes.toString("base64"), mimeType: logo.mimeType } : null;
  },
  ["client-logo-v1"],
  { revalidate: 3600, tags: ["client-logos"] }
);

function noLogo(status: 404 | 503, cacheControl: string) {
  return new NextResponse(status === 404 ? "Not found" : "Logo store unavailable", {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const code = parseLogoRequest(file);
  if (!code) return new NextResponse("Not found", { status: 404 });

  let logo: { b64: string; mimeType: string } | null;
  try {
    logo = await getCachedLogo(code);
  } catch (err) {
    console.error(`[client-logos] Drive lookup failed for ${code}:`, err);
    return noLogo(503, ERROR_CACHE);
  }
  if (!logo) return noLogo(404, MISS_CACHE);

  const bytes = Buffer.from(logo.b64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": logo.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": HIT_CACHE,
      // SVGs come from a Drive folder staff can write to; never let one run script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
