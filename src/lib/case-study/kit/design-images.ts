import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { resolveAplusScreenviews } from "../aplus-screenviews";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";
import { EMPTY_DESIGN_IMAGES, type DesignImages } from "./slides";

const RANK: Record<string, number> = { live: 3, approved: 2, in_review: 1 };
export function pickVersion<T extends { status: string; versionNumber: number }>(rows: T[]): T | undefined {
  return rows.filter((r) => r.status !== "discontinued")
    .sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0) || b.versionNumber - a.versionNumber)[0];
}
const rowsOf = <T,>(r: unknown) => r as unknown as T[];
const safe = async <T,>(p: Promise<T>, fallback: T, label: string): Promise<T> => {
  try { return await p; } catch (e) { console.error(`[case-study design] ${label} failed:`, e); return fallback; }
};
const HERO_SLOTS = IMAGE_SLOTS.slice(0, 9); // MAIN, PT01…PT08 (PT09 is the swatch)

async function heroListing(clientIdCode: string, asin: string | null): Promise<string[]> {
  if (!asin) return [];
  const rows = rowsOf<{ slot: string; version_number: number; status: string; gid: string }>(await db.execute(sql`
    SELECT v.slot, v.version_number, v.status, df.drive_file_id AS gid
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    JOIN master m ON m.id::text = v.product_id
    WHERE v.client_id_code = ${clientIdCode} AND m.asin = ${asin}`));
  return HERO_SLOTS.flatMap((slot) => {
    const best = pickVersion(rows.filter((r) => r.slot === slot).map((r) => ({ ...r, versionNumber: r.version_number })));
    return best ? [`/api/design/listing-images/image?driveFileId=${encodeURIComponent(best.gid)}`] : [];
  });
}

async function brandStory(clientIdCode: string): Promise<string[]> {
  const rows = rowsOf<{ version_id: string; version_number: number; status: string; gid: string }>(await db.execute(sql`
    SELECT v.id AS version_id, v.version_number, v.status, df.drive_file_id AS gid
    FROM brand_story_versions v
    JOIN brand_story_assets a ON a.version_id = v.id AND a.kind = 'screenview'
    JOIN drive_files df ON df.id = a.drive_file_id
    WHERE v.client_id_code = ${clientIdCode}
    ORDER BY a.created_at DESC`));
  const best = pickVersion(rows.map((r) => ({ ...r, versionNumber: r.version_number })));
  return best ? [`/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(best.gid)}`] : [];
}

async function storefront(clientIdCode: string): Promise<string[][]> {
  const rows = rowsOf<{ version_id: string; version_number: number; status: string; page_id: string; is_homepage: boolean;
    page_pos: number; mod_pos: number; tile_pos: number | null; gid: string; mime: string | null }>(await db.execute(sql`
    SELECT v.id AS version_id, v.version_number, v.status, p.id AS page_id, p.is_homepage, p.position AS page_pos,
      m.position AS mod_pos, NULL::int AS tile_pos, m.drive_file_id AS gid, m.asset_mime_type AS mime
    FROM storefront_versions v JOIN storefront_pages p ON p.version_id = v.id JOIN storefront_modules m ON m.page_id = p.id
    WHERE v.client_id_code = ${clientIdCode} AND m.drive_file_id IS NOT NULL
    UNION ALL
    SELECT v.id, v.version_number, v.status, p.id, p.is_homepage, p.position, m.position, t.position, t.drive_file_id, t.asset_mime_type
    FROM storefront_versions v JOIN storefront_pages p ON p.version_id = v.id JOIN storefront_modules m ON m.page_id = p.id
    JOIN storefront_module_tiles t ON t.module_id = m.id
    WHERE v.client_id_code = ${clientIdCode} AND t.drive_file_id IS NOT NULL`));
  const versions = [...new Map(rows.map((r) => [r.version_id, { id: r.version_id, status: r.status, versionNumber: r.version_number }])).values()];
  const best = pickVersion(versions);
  if (!best) return [];
  const mine = rows.filter((r) => r.version_id === best.id && (r.mime ?? "image/").startsWith("image/"));
  const pages = [...new Map(mine.map((r) => [r.page_id, r])).values()]
    .sort((a, b) => Number(b.is_homepage) - Number(a.is_homepage) || a.page_pos - b.page_pos).slice(0, 3);
  return pages.map((p) => mine.filter((r) => r.page_id === p.page_id)
    .sort((a, b) => a.mod_pos - b.mod_pos || (a.tile_pos ?? -1) - (b.tile_pos ?? -1))
    .map((r) => `/api/storefront/image?driveFileId=${encodeURIComponent(r.gid)}`));
}

async function aplusCounts(clientIdCode: string): Promise<{ premium_modules: number | null; asins_live: number | null }> {
  const rows = rowsOf<{ premium_modules: number | null; asins_live: number | null }>(await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM aplus2_modules mo JOIN aplus2_versions ve ON ve.id = mo.version_id
         JOIN aplus2_sets se ON se.id = ve.set_id
        WHERE se.client_id_code = ${clientIdCode} AND se.content_type = 'PA+' AND ve.status IN ('live','approved')) AS premium_modules,
      (SELECT COUNT(DISTINCT se.scope_identifier)::int FROM aplus2_sets se JOIN aplus2_versions ve ON ve.set_id = se.id
        WHERE se.client_id_code = ${clientIdCode} AND ve.status = 'live') AS asins_live`));
  return rows[0] ?? { premium_modules: null, asins_live: null };
}

export async function resolveDesignImages(clientIdCode: string, heroAsin: string | null): Promise<DesignImages> {
  const [listing, bs, sf, aplus, logoRows, counts] = await Promise.all([
    safe(heroListing(clientIdCode, heroAsin), [], "listing"),
    safe(brandStory(clientIdCode), [], "brand story"),
    safe(storefront(clientIdCode), [], "storefront"),
    safe(resolveAplusScreenviews(clientIdCode), { screenviews: [], hasBasic: false, hasPremium: false }, "a+"),
    safe(db.execute(sql`SELECT client_logo_url AS url FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)
      .then((r) => rowsOf<{ url: string | null }>(r)), [], "logo"),
    safe(aplusCounts(clientIdCode), { premium_modules: null, asins_live: null }, "a+ counts"),
  ]);
  return {
    ...EMPTY_DESIGN_IMAGES,
    heroListing: listing, brandStory: bs, storefrontPages: sf,
    aplusStacks: aplus.screenviews.map((s) => s.images),
    logo: logoRows[0]?.url ? [logoRows[0].url] : [],
    aplusPremiumModules: counts.premium_modules, aplusAsinsLive: counts.asins_live,
  };
}
