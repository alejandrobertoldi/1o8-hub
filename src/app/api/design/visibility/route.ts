import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

/**
 * Unified design-section visibility config.
 *
 * One `seo_settings` key (`design_visibility`) holds the hidden-client lists for
 * all four design sections. A clientIdCode in `hidden[section]` means that
 * section is NOT shown for that client on its landing page. Empty = all shown.
 *
 * GET → any authenticated user (read)
 * PUT → admin or editor only (write)
 */

const KEY = "design_visibility";

const SECTIONS = ["brand_story", "aplus", "listing_images", "storefront"] as const;
type Section = (typeof SECTIONS)[number];

export type DesignVisibility = { hidden: Record<Section, string[]> };

const EMPTY: DesignVisibility = {
  hidden: { brand_story: [], aplus: [], listing_images: [], storefront: [] },
};

function sanitize(obj: unknown): DesignVisibility {
  const o = obj as { hidden?: Record<string, unknown> } | null | undefined;
  const src = o?.hidden ?? {};
  const hidden = {} as Record<Section, string[]>;
  for (const section of SECTIONS) {
    const arr = (src as Record<string, unknown>)[section];
    hidden[section] = Array.isArray(arr)
      ? arr.filter((x: unknown) => typeof x === "string")
      : [];
  }
  return { hidden };
}

function parse(value: string | undefined | null): DesignVisibility {
  if (!value) return EMPTY;
  try {
    return sanitize(JSON.parse(value));
  } catch {
    return EMPTY;
  }
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(seoSettings).where(eq(seoSettings.key, KEY)).limit(1);
  return NextResponse.json(parse(rows[0]?.value));
}

export async function PUT(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Admin or editor only" }, { status: 403 });
  }
  const visibility = sanitize(await req.json().catch(() => null));
  const value = JSON.stringify(visibility);
  await db
    .insert(seoSettings)
    .values({ key: KEY, value, updatedBy: session.user.email! })
    .onConflictDoUpdate({
      target: seoSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: session.user.email! },
    });
  return NextResponse.json(visibility);
}
