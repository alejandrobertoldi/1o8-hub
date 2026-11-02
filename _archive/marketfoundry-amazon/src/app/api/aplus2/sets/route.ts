import { hasAdminPowers } from "@/lib/roles";
/**
 * GET  /api/aplus2/sets?clientIdCode=XYZ
 *   Lists every A+2 set for the client with the latest-version status and
 *   version count per set.
 *
 * POST /api/aplus2/sets
 *   Body: { clientIdCode, productId, scopeType: "ASIN"|"PARENT"|"GROUP",
 *           coveredAsins?: string[], groupName?: string, marketplace,
 *           contentType?: "PA+"|"BA+" }
 *   One set per scope (client + marketplace + scope). NTA: V01 is BA+;
 *   later POST with PA+ adds V02 on the same set. Drive folders use
 *   _ABasic_V## / _APlus_V## from the version's content type.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sessionHasClient } from "@/lib/client-codes";
import {
  aac,
  aplus2Sets,
  aplus2Versions,
  driveFolders,
  master,
  variations,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  APLUS2_MASTER_FOLDER_TYPE,
  aplus2MasterSubfolderName,
  aplus2VersionSlugFromSet,
} from "@/lib/aplus2/drive-naming";
import { isValidMarketplaceCode } from "@/lib/aplus2/marketplace";
import {
  aplusGroupSelectionError,
  isAplus2ParentProduct,
  nextAplusGroupIdentifier,
  pickStoredCoveredProducts,
  sameAsinSet,
  uniqueCoveredProducts,
} from "@/lib/aplus2/variation-scope";
import {
  loadCoveredProductsByAsins,
  loadVariationFamiliesByVariationId,
  loadVariationFamilyAsins,
  lookupAplus2VariationId,
} from "@/lib/aplus2/variation-scope.server";

function drizzleErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message : undefined;
  return causeMsg ? `${err.message} (${causeMsg})` : err.message;
}

// ─── GET ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const role = session.user.role;
  if (
    (role === "client" || role === "prospect") &&
    !sessionHasClient(session.user.clientIdCode, clientIdCode)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const rows = await db.execute<{
    set_id: string;
    scope_type: string;
    scope_identifier: string;
    marketplace: string;
    parent_asin: string | null;
    covered_asins: string[] | null;
    product_id: string;
    content_type: string;
    asin: string | null;
    sku: string | null;
    item_name: string | null;
    summarized_title: string | null;
    variation_id: string | null;
    variation_name: string | null;
    parentage_level: string | null;
    version_count: number;
    latest_status: string | null;
    latest_version_number: number | null;
    latest_content_type: string | null;
  }>(sql`
    SELECT
      s.id AS set_id, s.scope_type, s.scope_identifier, s.marketplace,
      s.parent_asin, s.covered_asins, s.product_id,
      s.content_type, m.asin, m.sku, m.item_name, m.summarized_title, m.parentage_level,
      NULLIF(COALESCE(v.code, m.variations->>'VariationID', m.other_attributes->>'VariationID', m.raw_column_values->>'VariationID', v.amazon_variation_id), '') AS variation_id,
      v.name AS variation_name,
      COALESCE(vc.cnt, 0)::int AS version_count,
      lv.status AS latest_status,
      lv.version_number AS latest_version_number,
      COALESCE(lv.content_type, s.content_type) AS latest_content_type
    FROM ${aplus2Sets} s
    JOIN ${master} m ON m.id = s.product_id
    LEFT JOIN ${variations} v ON v.id = m.variation_ref
    LEFT JOIN (
      SELECT set_id, COUNT(*)::int AS cnt
      FROM ${aplus2Versions} GROUP BY set_id
    ) vc ON vc.set_id = s.id
    LEFT JOIN LATERAL (
      SELECT status, version_number, content_type FROM ${aplus2Versions}
      WHERE set_id = s.id ORDER BY version_number DESC LIMIT 1
    ) lv ON true
    WHERE s.client_id_code = ${clientIdCode}
    ORDER BY s.marketplace ASC, s.scope_identifier ASC
  `);

  const families = await loadVariationFamiliesByVariationId({
    clientIdCode,
    variationIds: rows.filter((r) => r.variation_id).map((r) => r.variation_id as string),
  });
  const storedGroupProducts = await loadCoveredProductsByAsins({
    clientIdCode,
    asins: rows
      .filter((r) => r.scope_type === "GROUP")
      .flatMap((r) => r.covered_asins ?? []),
  });
  const storedGroupByAsin = new Map(
    storedGroupProducts.map((product) => [product.asin, product]),
  );

  return NextResponse.json({
    clientName: client.clientName,
    sets: rows.map((r) => {
      const family = r.variation_id
        ? uniqueCoveredProducts(
            families.get(r.variation_id) ?? [],
            r.parent_asin ?? r.scope_identifier,
          )
        : [];
      const selfProduct =
        r.asin && r.product_id
          ? {
              id: r.product_id,
              asin: r.asin,
              parentageLevel: r.parentage_level,
              summarizedTitle: r.summarized_title,
              itemName: r.item_name,
            }
          : null;
      const liveMembers =
        r.scope_type === "PARENT"
          ? (family.length > 0 ? family : selfProduct ? [selfProduct] : [])
          : r.scope_type === "GROUP"
            ? pickStoredCoveredProducts(
                r.covered_asins ?? [],
                [...storedGroupByAsin.values()],
              )
            : selfProduct
              ? [selfProduct]
              : [];
      const parentProduct =
        family.find((p) => isAplus2ParentProduct(p.parentageLevel))
        ?? family.find((p) => p.asin === r.parent_asin)
        ?? null;
      const coveredAsins =
        liveMembers.length > 0 ? liveMembers.map((m) => m.asin) : r.covered_asins;
      return {
      id: r.set_id,
      scopeType: r.scope_type,
      scopeIdentifier: r.scope_identifier,
      marketplace: r.marketplace,
      parentAsin: r.parent_asin,
      coveredAsins,
      coveredProducts: liveMembers,
      parentProduct,
      parentageLevel: r.parentage_level,
      productId: r.product_id,
      asin: r.asin,
      sku: r.sku,
      contentType: r.content_type,
      itemName: r.item_name,
      summarizedTitle: r.summarized_title,
      variationId: r.variation_id,
      variationName: r.variation_name,
      versionCount: r.version_count,
      latestStatus: r.latest_status,
      latestVersionNumber: r.latest_version_number,
      latestContentType: r.latest_content_type,
    };
    }),
  });
}

// ─── POST ────────────────────────────────────────────────────────────

const createSchema = z.strictObject({
  clientIdCode: z.string().min(1).max(100),
  productId: z.uuid().optional(),
  scopeType: z.enum(["ASIN", "PARENT", "GROUP"]),
  marketplace: z.string().min(2).max(5),
  contentType: z.enum(["PA+", "BA+"]).default("PA+"),
  coveredAsins: z.array(z.string().min(1).max(20)).optional(),
  groupName: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const marketplace = body.marketplace.toUpperCase();
  if (!isValidMarketplaceCode(marketplace)) {
    return NextResponse.json({ error: "marketplace must be a 2-letter ISO code" }, { status: 400 });
  }

  const requestedGroupAsins =
    body.scopeType === "GROUP" ? [...new Set(body.coveredAsins ?? [])] : [];
  const selectedGroupProducts =
    body.scopeType === "GROUP"
      ? await loadCoveredProductsByAsins({
          clientIdCode: body.clientIdCode,
          asins: requestedGroupAsins,
        })
      : [];
  const anchorProductId = body.productId ?? selectedGroupProducts[0]?.id;
  if (!anchorProductId) {
    return NextResponse.json(
      { error: body.scopeType === "GROUP" ? "Select at least two ASINs" : "productId is required" },
      { status: 400 },
    );
  }

  const [product] = await db
    .select({
      id: master.id, asin: master.asin, parentAsin: master.parentAsin,
      clientIdCode: master.clientIdCode,
      parentageLevel: master.parentageLevel,
      variationRef: master.variationRef,
    })
    .from(master)
    .where(eq(master.id, anchorProductId))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.clientIdCode !== body.clientIdCode) {
    return NextResponse.json({ error: "Product does not belong to clientIdCode" }, { status: 400 });
  }

  let scopeIdentifier: string;
  let parentAsin: string | null = null;
  let coveredAsins: string[] | null = null;
  let variationId: string | null = null;
  let existingSetId: string | null = null;
  if (body.scopeType === "ASIN") {
    if (!product.asin) return NextResponse.json({ error: "Product has no ASIN" }, { status: 400 });
    scopeIdentifier = product.asin;
  } else if (body.scopeType === "PARENT") {
    if (!isAplus2ParentProduct(product.parentageLevel) || !product.asin) {
      return NextResponse.json({ error: "Variation scope requires a parent ASIN" }, { status: 400 });
    }
    variationId = await lookupAplus2VariationId(product.id);
    if (!variationId) {
      return NextResponse.json({ error: "Selected parent has no Variation ID" }, { status: 400 });
    }
    parentAsin = product.asin;
    scopeIdentifier = product.asin;
    coveredAsins = await loadVariationFamilyAsins({
      clientIdCode: body.clientIdCode,
      parentAsin: product.asin,
      variationRef: product.variationRef,
      variationId,
    });
    if (coveredAsins.length === 0) coveredAsins = [product.asin];
  } else {
    const selectionError = aplusGroupSelectionError(
      requestedGroupAsins,
      selectedGroupProducts.map((member) => member.asin),
    );
    if (selectionError) {
      return NextResponse.json({ error: selectionError }, { status: 400 });
    }
    coveredAsins = requestedGroupAsins;
    variationId = await lookupAplus2VariationId(product.id);
    parentAsin = isAplus2ParentProduct(product.parentageLevel)
      ? product.asin
      : product.parentAsin;

    const groupSets = await db
      .select({
        id: aplus2Sets.id,
        marketplace: aplus2Sets.marketplace,
        scopeIdentifier: aplus2Sets.scopeIdentifier,
        coveredAsins: aplus2Sets.coveredAsins,
      })
      .from(aplus2Sets)
      .where(and(
        eq(aplus2Sets.clientIdCode, body.clientIdCode),
        eq(aplus2Sets.scopeType, "GROUP"),
      ));
    const matchingGroup = groupSets.find((set) =>
      set.marketplace === marketplace
      && sameAsinSet(set.coveredAsins ?? [], requestedGroupAsins),
    );
    if (matchingGroup) {
      existingSetId = matchingGroup.id;
      scopeIdentifier = matchingGroup.scopeIdentifier;
    } else {
      scopeIdentifier = nextAplusGroupIdentifier(
        body.groupName ?? "Selected ASINs",
        groupSets.map((set) => set.scopeIdentifier),
      );
    }
  }

  // One set per ASIN. If it exists, add the next version with this content
  // type (NTA: V01 BA+, later V02 PA+). Editor + Drive name follow the version.
  const existingSet = existingSetId
    ? { id: existingSetId }
    : (await db
        .select({ id: aplus2Sets.id })
        .from(aplus2Sets)
        .where(and(
          eq(aplus2Sets.clientIdCode, body.clientIdCode),
          eq(aplus2Sets.marketplace, marketplace),
          eq(aplus2Sets.scopeIdentifier, scopeIdentifier),
        ))
        .limit(1))[0];

  // Drive parent folder: 'aplus' only.
  const parentFolders = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      folderType: driveFolders.folderType,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(eq(driveFolders.clientIdCode, body.clientIdCode));
  const parent = parentFolders.find((f) => f.folderType === "aplus");
  if (!parent) {
    return NextResponse.json(
      { error: `No 'aplus' Drive folder registered for ${body.clientIdCode}` },
      { status: 404 }
    );
  }

  // Determine the next version number.
  let nextVersionNumber = 1;
  if (existingSet) {
    const [latestV] = await db
      .select({ maxV: sql<number>`max(${aplus2Versions.versionNumber})` })
      .from(aplus2Versions)
      .where(eq(aplus2Versions.setId, existingSet.id));
    nextVersionNumber = (latestV?.maxV ?? 0) + 1;
  }

  const slug = aplus2VersionSlugFromSet({
    clientIdCode: body.clientIdCode,
    scopeType: body.scopeType,
    scopeIdentifier,
    variationId,
    contentType: body.contentType,
    versionNumber: nextVersionNumber,
  });

  const masterSubfolderName = aplus2MasterSubfolderName(slug);
  let createdDriveFolderId: string | null = null;
  let createdMasterFolderId: string | null = null;
  try {
    const f = await driveClient.createFolder(slug, parent.driveFolderId);
    createdDriveFolderId = f.id;
    const masterFolder = await driveClient.createFolder(masterSubfolderName, f.id);
    createdMasterFolderId = masterFolder.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /sets] folder cleanup after Drive fail:", cleanupErr); }
    }
    return NextResponse.json({ error: `Drive folder create failed: ${msg}` }, { status: 502 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const setId = existingSet
        ? existingSet.id
        : (await tx
            .insert(aplus2Sets)
            .values({
              clientIdCode: body.clientIdCode,
              productId: product.id,
              scopeType: body.scopeType,
              scopeIdentifier,
              marketplace,
              parentAsin,
              coveredAsins,
              contentType: body.contentType,
            })
            .returning({ id: aplus2Sets.id })
          )[0].id;

      const [folderRow] = await tx
        .insert(driveFolders)
        .values({
          clientIdCode: body.clientIdCode,
          driveFolderId: createdDriveFolderId!,
          folderType: "aplus2_version",
          path: `${parent.path}/${slug}`,
          parentFolderId: parent.id,
          name: slug,
        })
        .returning({ id: driveFolders.id });

      await tx.insert(driveFolders).values({
        clientIdCode: body.clientIdCode,
        driveFolderId: createdMasterFolderId!,
        folderType: APLUS2_MASTER_FOLDER_TYPE,
        path: `${parent.path}/${slug}/${masterSubfolderName}`,
        parentFolderId: folderRow.id,
        name: masterSubfolderName,
      });

      if (existingSet) {
        await tx
          .update(aplus2Sets)
          .set({
            contentType: body.contentType,
            updatedAt: new Date(),
            ...(coveredAsins
              ? { scopeType: body.scopeType, coveredAsins, parentAsin }
              : {}),
          })
          .where(eq(aplus2Sets.id, setId));
      }

      const [versionRow] = await tx
        .insert(aplus2Versions)
        .values({
          setId,
          versionNumber: nextVersionNumber,
          driveFolderId: folderRow.id,
          status: "not_started",
          contentType: body.contentType,
        })
        .returning({ id: aplus2Versions.id, versionNumber: aplus2Versions.versionNumber });

      return { setId, versionId: versionRow.id, versionNumber: versionRow.versionNumber };
    });

    return NextResponse.json({
      ok: true,
      ...result,
      scopeIdentifier,
      marketplace,
      contentType: body.contentType,
      slug,
    });
  } catch (err) {
    const msg = drizzleErrorMessage(err);
    if (createdMasterFolderId) {
      try { await driveClient.deleteFile(createdMasterFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /sets] master folder cleanup failed:", cleanupErr); }
    }
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /sets] folder cleanup failed:", cleanupErr); }
    }
    return NextResponse.json({ error: `Failed to create set: ${msg}` }, { status: 500 });
  }
}
