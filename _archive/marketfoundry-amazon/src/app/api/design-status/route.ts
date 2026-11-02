import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  designStatus,
  aac,
  aplus2Sets,
  aplus2Versions,
  aplus2Modules,
  aplus2Assets,
  driveFiles,
  brandStoryVersions,
  storefrontVersions,
  listingImageSlotVersions,
} from "@/lib/db/schema";
import { eq, ilike, sql } from "drizzle-orm";
import { CLIENT_NAMES } from "@/lib/constants";

const CATEGORIES = ["brand_story", "aplus", "listing_images", "storefront"] as const;

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get active clients
  const activeClients = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"))
    .orderBy(aac.clientIdCode);

  // Get all design statuses
  const statuses = await db.select().from(designStatus);

  // Build a lookup: clientIdCode -> category -> row
  const statusMap = new Map<string, Map<string, typeof statuses[number]>>();
  for (const s of statuses) {
    if (!statusMap.has(s.clientIdCode)) {
      statusMap.set(s.clientIdCode, new Map());
    }
    statusMap.get(s.clientIdCode)!.set(s.category, s);
  }

  // Get A+2 set counts per client for derived status. A set's state is its
  // latest version's status; total = sets, approved/live = sets in that state.
  const aplusCounts = await db.execute<{
    clientIdCode: string;
    totalModules: number;
    approvedModules: number;
    approvedOnlyModules: number;
    liveModules: number;
    inReviewModules: number;
    inProgressModules: number;
    notStartedModules: number;
    derivedStatus: string;
  }>(sql`
    SELECT
      s.client_id_code AS "clientIdCode",
      COUNT(*)::int AS "totalModules",
      COUNT(*) FILTER (WHERE lv.status IN ('approved', 'live'))::int AS "approvedModules",
      COUNT(*) FILTER (WHERE lv.status = 'approved')::int AS "approvedOnlyModules",
      COUNT(*) FILTER (WHERE lv.status = 'live')::int AS "liveModules",
      COUNT(*) FILTER (WHERE lv.status = 'in_review')::int AS "inReviewModules",
      COUNT(*) FILTER (WHERE lv.status = 'in_progress')::int AS "inProgressModules",
      COUNT(*) FILTER (WHERE COALESCE(lv.status, 'not_started') = 'not_started')::int AS "notStartedModules",
      CASE
        WHEN BOOL_AND(lv.status = 'live')                        THEN 'live'
        WHEN BOOL_AND(lv.status IN ('approved', 'live'))         THEN 'approved'
        WHEN COUNT(*) FILTER (WHERE lv.status = 'in_review')  > 0 THEN 'in_review'
        WHEN COUNT(*) FILTER (WHERE lv.status = 'in_progress') > 0 THEN 'in_progress'
        ELSE 'not_started'
      END AS "derivedStatus"
    FROM ${aplus2Sets} s
    LEFT JOIN LATERAL (
      SELECT status FROM ${aplus2Versions}
      WHERE set_id = s.id ORDER BY version_number DESC LIMIT 1
    ) lv ON true
    GROUP BY s.client_id_code
  `);

  const aplusMap = new Map(
    aplusCounts.map((r) => [r.clientIdCode, r])
  );

  // Listing Images: latest version per (product, slot), live-first — same
  // selection as GET /api/design/listing-images. Counts by status so the
  // overview card can show Live vs everything else instead of one badge.
  const listingImageCounts = await db.execute<{
    clientIdCode: string;
    total: number;
    live: number;
    approved: number;
    inReview: number;
    inProgress: number;
    notStarted: number;
    discontinued: number;
    derivedStatus: string;
  }>(sql`
    SELECT
      s.client_id_code AS "clientIdCode",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s.status = 'live')::int AS live,
      COUNT(*) FILTER (WHERE s.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE s.status = 'in_review')::int AS "inReview",
      COUNT(*) FILTER (WHERE s.status = 'in_progress')::int AS "inProgress",
      COUNT(*) FILTER (WHERE s.status = 'not_started')::int AS "notStarted",
      COUNT(*) FILTER (WHERE s.status = 'discontinued')::int AS discontinued,
      CASE
        WHEN BOOL_AND(s.status = 'live')                         THEN 'live'
        WHEN BOOL_AND(s.status IN ('approved', 'live'))          THEN 'approved'
        WHEN COUNT(*) FILTER (WHERE s.status = 'in_review')  > 0 THEN 'in_review'
        WHEN COUNT(*) FILTER (WHERE s.status = 'in_progress') > 0 THEN 'in_progress'
        ELSE 'not_started'
      END AS "derivedStatus"
    FROM (
      SELECT DISTINCT ON (v.product_id, v.slot)
        v.client_id_code, v.status
      FROM ${listingImageSlotVersions} v
      ORDER BY v.product_id, v.slot, v.version_number DESC
    ) s
    GROUP BY s.client_id_code
  `);

  const listingImageMap = new Map(
    listingImageCounts.map((r) => [r.clientIdCode, r])
  );

  // Brand Story: version count per client
  const bsVersionCounts = await db
    .select({
      clientIdCode: brandStoryVersions.clientIdCode,
      count: sql<number>`count(*)::int`,
    })
    .from(brandStoryVersions)
    .groupBy(brandStoryVersions.clientIdCode);

  const bsVersionCountMap = new Map(
    bsVersionCounts.map((r) => [r.clientIdCode, r.count])
  );

  // Brand Story: pick the "winning" version per client (by status priority,
  // then highest versionNumber). Grab its screenview Drive GID (the text id
  // the /brand-story-image proxy understands, not the internal UUID FK) AND
  // its status/updated_at so the landing card mirrors the detail page.
  const bsWinnerRows = await db.execute(sql`
    SELECT DISTINCT ON (v.client_id_code)
      v.client_id_code,
      v.id            AS version_id,
      v.status        AS version_status,
      v.updated_at    AS version_updated_at,
      df.drive_file_id AS drive_gid
    FROM brand_story_versions v
    LEFT JOIN brand_story_assets a
      ON a.version_id = v.id AND a.kind = 'screenview'
    LEFT JOIN drive_files df
      ON df.id = a.drive_file_id
    ORDER BY
      v.client_id_code,
      CASE v.status
        WHEN 'live' THEN 4
        WHEN 'approved' THEN 3
        WHEN 'in_review' THEN 2
        WHEN 'in_progress' THEN 1
        ELSE 0
      END DESC,
      v.version_number DESC
  `);

  type BsWinner = {
    versionId: string;
    status: string;
    updatedAt: Date | string | null;
    driveGid: string | null;
  };
  const bsWinnerMap = new Map<string, BsWinner>();
  for (const row of bsWinnerRows) {
    const r = row as {
      client_id_code: string;
      version_id: string;
      version_status: string;
      version_updated_at: Date | string | null;
      drive_gid: string | null;
    };
    bsWinnerMap.set(r.client_id_code, {
      versionId: r.version_id,
      status: r.version_status,
      updatedAt: r.version_updated_at,
      driveGid: r.drive_gid,
    });
  }

  // Storefront: winning version per client (same priority as brand_story).
  const sfWinnerRows = await db.execute(sql`
    SELECT DISTINCT ON (v.client_id_code)
      v.client_id_code, v.status AS version_status, v.updated_at AS version_updated_at
    FROM storefront_versions v
    ORDER BY
      v.client_id_code,
      CASE v.status
        WHEN 'live' THEN 4 WHEN 'approved' THEN 3 WHEN 'in_review' THEN 2 WHEN 'in_progress' THEN 1 ELSE 0
      END DESC,
      v.version_number DESC
  `);
  const sfWinnerMap = new Map<string, { status: string; updatedAt: Date | string | null }>();
  for (const row of sfWinnerRows) {
    const r = row as { client_id_code: string; version_status: string; version_updated_at: Date | string | null };
    sfWinnerMap.set(r.client_id_code, { status: r.version_status, updatedAt: r.version_updated_at });
  }

  // A+2: latest PA+ version per client, first desktop image of modules 1 and 2
  // for the /design/aplus2 landing tiles. Keep a single-image fallback for
  // BA+-only clients (or versions with no module assets yet).
  const aplusThumbRows = await db.execute<{ client_id_code: string; gid: string | null }>(sql`
    SELECT DISTINCT ON (s.client_id_code)
      s.client_id_code, df.drive_file_id AS gid
    FROM ${aplus2Sets} s
    JOIN ${aplus2Versions} v ON v.set_id = s.id
    JOIN ${aplus2Assets} a ON a.version_id = v.id AND a.kind = 'image'
    JOIN ${driveFiles} df ON df.id = a.drive_file_id
    ORDER BY s.client_id_code, v.version_number DESC, a.created_at ASC
  `);
  const aplusThumbMap = new Map<string, string>();
  for (const r of aplusThumbRows) {
    if (r.gid) aplusThumbMap.set(r.client_id_code, r.gid);
  }

  const aplusModuleThumbRows = await db.execute<{
    client_id_code: string;
    position: number;
    gid: string | null;
  }>(sql`
    WITH latest_pa AS (
      SELECT DISTINCT ON (s.client_id_code)
        s.client_id_code,
        v.id AS version_id
      FROM ${aplus2Sets} s
      JOIN ${aplus2Versions} v ON v.set_id = s.id
      WHERE COALESCE(v.content_type, s.content_type) = 'PA+'
      ORDER BY s.client_id_code, v.version_number DESC
    )
    SELECT DISTINCT ON (l.client_id_code, m.position)
      l.client_id_code,
      m.position,
      df.drive_file_id AS gid
    FROM latest_pa l
    JOIN ${aplus2Modules} m ON m.version_id = l.version_id AND m.position IN (1, 2)
    JOIN ${aplus2Assets} a
      ON a.module_id = m.id
      AND a.kind = 'image'
    JOIN ${driveFiles} df ON df.id = a.drive_file_id
    ORDER BY l.client_id_code, m.position,
      CASE WHEN a.variant = 'desktop' THEN 0 ELSE 1 END,
      a.created_at ASC
  `);
  const aplusModuleThumbMap = new Map<string, string[]>();
  for (const r of aplusModuleThumbRows) {
    if (!r.gid) continue;
    const url = `/api/aplus2/image?driveFileId=${encodeURIComponent(r.gid)}`;
    const list = aplusModuleThumbMap.get(r.client_id_code) ?? [];
    list.push(url);
    aplusModuleThumbMap.set(r.client_id_code, list);
  }

  // Build response
  const clients = activeClients.map((c) => {
    const clientStatuses = statusMap.get(c.clientIdCode);
    const aplus = aplusMap.get(c.clientIdCode);
    const listingImages = listingImageMap.get(c.clientIdCode);
    const bsWinner = bsWinnerMap.get(c.clientIdCode);

    const categories = CATEGORIES.map((cat) => {
      const row = clientStatuses?.get(cat);
      // For brand_story, when the client has any versions, the winning
      // version is the source of truth — override status + updatedAt.
      // updatedBy is dropped (brand_story_versions has no updated_by column).
      const isBrandStoryDerived = cat === "brand_story" && bsWinner;
      const isAplusDerived = cat === "aplus" && aplus;
      const isListingDerived = cat === "listing_images" && listingImages;
      const sfWinner = sfWinnerMap.get(c.clientIdCode);
      const isStorefrontDerived = cat === "storefront" && sfWinner;
      const status = isBrandStoryDerived
        ? bsWinner.status
        : isAplusDerived
        ? aplus.derivedStatus
        : isListingDerived
        ? listingImages.derivedStatus
        : isStorefrontDerived
        ? sfWinner.status
        : (row?.status ?? "not_started");
      const updatedAt = isBrandStoryDerived
        ? (bsWinner.updatedAt instanceof Date
            ? bsWinner.updatedAt.toISOString()
            : (bsWinner.updatedAt as string | null))
        : isStorefrontDerived
        ? (sfWinner.updatedAt instanceof Date ? sfWinner.updatedAt.toISOString() : (sfWinner.updatedAt as string | null))
        : (row?.updatedAt ?? null);
      const updatedBy = isBrandStoryDerived || isStorefrontDerived ? null : (row?.updatedBy ?? null);
      return {
        category: cat,
        status,
        notes: row?.notes ?? null,
        updatedAt,
        updatedBy,
        // Extra A+ data for the aplus category
        ...(cat === "aplus" && aplus
          ? {
              aplusTotal: aplus.totalModules,
              aplusApproved: aplus.approvedModules,
              aplusLive: aplus.liveModules,
              statusCounts: {
                not_started: aplus.notStartedModules,
                in_progress: aplus.inProgressModules,
                in_review: aplus.inReviewModules,
                approved: aplus.approvedOnlyModules,
                live: aplus.liveModules,
              },
            }
          : {}),
        ...(cat === "listing_images" && listingImages
          ? {
              statusCounts: {
                not_started: listingImages.notStarted,
                in_progress: listingImages.inProgress,
                in_review: listingImages.inReview,
                approved: listingImages.approved,
                live: listingImages.live,
                discontinued: listingImages.discontinued,
              },
            }
          : {}),
      };
    });

    return {
      clientIdCode: c.clientIdCode,
      clientName: c.clientName || CLIENT_NAMES[c.clientIdCode] || c.clientIdCode,
      brandStoryVersionCount: bsVersionCountMap.get(c.clientIdCode) ?? 0,
      brandStoryThumbnailUrl: bsWinner?.driveGid
        ? `/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(bsWinner.driveGid)}`
        : null,
      aplusThumbnailUrl: aplusThumbMap.has(c.clientIdCode)
        ? `/api/aplus2/image?driveFileId=${encodeURIComponent(aplusThumbMap.get(c.clientIdCode)!)}`
        : null,
      aplusModuleThumbs: aplusModuleThumbMap.get(c.clientIdCode) ?? [],
      categories,
    };
  });

  return NextResponse.json(clients);
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode, category, status, notes } = body;

  if (!clientIdCode || !category || !status) {
    return NextResponse.json(
      { error: "clientIdCode, category, and status are required" },
      { status: 400 }
    );
  }

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const validStatuses = ["not_started", "in_progress", "in_review", "approved", "live"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // For brand_story: if the client has any versions, the "winning" version
  // is the source of truth (same priority as the landing card derives). The
  // dropdown's job is to flip that version's status. Falls back to upserting
  // design_status only when no versions exist.
  if (category === "brand_story") {
    const winnerRows = await db.execute(sql`
      SELECT v.id
      FROM brand_story_versions v
      WHERE v.client_id_code = ${clientIdCode}
      ORDER BY
        CASE v.status
          WHEN 'live' THEN 4
          WHEN 'approved' THEN 3
          WHEN 'in_review' THEN 2
          WHEN 'in_progress' THEN 1
          ELSE 0
        END DESC,
        v.version_number DESC
      LIMIT 1
    `);
    const winner = winnerRows[0] as { id: string } | undefined;

    if (winner) {
      await db
        .update(brandStoryVersions)
        .set({ status, updatedAt: new Date() })
        .where(eq(brandStoryVersions.id, winner.id));
      return NextResponse.json({ ok: true });
    }
    // No versions yet → fall through to design_status upsert below.
  }

  if (category === "storefront") {
    const winnerRows = await db.execute(sql`
      SELECT v.id FROM storefront_versions v
      WHERE v.client_id_code = ${clientIdCode}
      ORDER BY
        CASE v.status
          WHEN 'live' THEN 4 WHEN 'approved' THEN 3 WHEN 'in_review' THEN 2 WHEN 'in_progress' THEN 1 ELSE 0
        END DESC,
        v.version_number DESC
      LIMIT 1
    `);
    const winner = winnerRows[0] as { id: string } | undefined;
    if (winner) {
      await db
        .update(storefrontVersions)
        .set({ status, updatedAt: new Date() })
        .where(eq(storefrontVersions.id, winner.id));
      return NextResponse.json({ ok: true });
    }
    // No versions yet → fall through to design_status upsert.
  }

  // Upsert
  await db
    .insert(designStatus)
    .values({
      clientIdCode,
      category,
      status,
      notes: notes ?? null,
      updatedBy: session.user.email ?? session.user.name ?? "unknown",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [designStatus.clientIdCode, designStatus.category],
      set: {
        status,
        notes: notes ?? null,
        updatedBy: session.user.email ?? session.user.name ?? "unknown",
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
