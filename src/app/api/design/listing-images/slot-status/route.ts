import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listingImageSlotVersions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, and, ne, desc } from "drizzle-orm";
import { getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";
import { IMAGE_SLOTS, isListingImageSlot } from "@/lib/listing-image-slots";

const VALID_STATUSES = ["not_started", "in_progress", "in_review", "approved", "live", "discontinued"];

// Enforce one-live-per-slot: when a version is set to "live", flip any *other*
// live version of the same (productId, slot) to "discontinued".
async function discontinueOtherLiveVersions(productId: string, slot: string, keepVersion: number) {
  await db
    .update(listingImageSlotVersions)
    .set({ status: "discontinued" })
    .where(
      and(
        eq(listingImageSlotVersions.productId, productId),
        eq(listingImageSlotVersions.slot, slot),
        eq(listingImageSlotVersions.status, "live"),
        ne(listingImageSlotVersions.versionNumber, keepVersion)
      )
    );
}

// Set the status of the LATEST version for one (productId, slot).
// No-op if the slot has no versions yet (empty slots carry no status).
async function updateLatestVersionStatus(productId: string, slot: string, status: string) {
  const [latest] = await db
    .select({ versionNumber: listingImageSlotVersions.versionNumber })
    .from(listingImageSlotVersions)
    .where(
      and(
        eq(listingImageSlotVersions.productId, productId),
        eq(listingImageSlotVersions.slot, slot)
      )
    )
    .orderBy(desc(listingImageSlotVersions.versionNumber))
    .limit(1);
  if (!latest) return;

  await db
    .update(listingImageSlotVersions)
    .set({ status })
    .where(
      and(
        eq(listingImageSlotVersions.productId, productId),
        eq(listingImageSlotVersions.slot, slot),
        eq(listingImageSlotVersions.versionNumber, latest.versionNumber)
      )
    );

  if (status === "live") {
    await discontinueOtherLiveVersions(productId, slot, latest.versionNumber);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "editor" && !hasAdminPowers(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as {
      clientIdCode?: string;
      productId: string;
      slot: string;
      status: string;
      versionNumber?: number;
    };

    const { productId, slot, status, versionNumber } = body;
    if (!productId || !slot || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (slot !== "_all" && !isListingImageSlot(slot)) {
      return NextResponse.json({ error: "Invalid image slot" }, { status: 400 });
    }

    // Bulk: latest version of every slot that has at least one version.
    if (slot === "_all") {
      for (const s of IMAGE_SLOTS) {
        await updateLatestVersionStatus(productId, s, status);
      }
      return NextResponse.json({ ok: true, slots: IMAGE_SLOTS });
    }

    // Explicit version (version-history Popover).
    if (typeof versionNumber === "number") {
      await db
        .update(listingImageSlotVersions)
        .set({ status })
        .where(
          and(
            eq(listingImageSlotVersions.productId, productId),
            eq(listingImageSlotVersions.slot, slot),
            eq(listingImageSlotVersions.versionNumber, versionNumber)
          )
        );
      if (status === "live") {
        await discontinueOtherLiveVersions(productId, slot, versionNumber);
      }
      return NextResponse.json({ ok: true, slot, versionNumber });
    }

    // Default: latest version of this slot (grid cell dropdown).
    await updateLatestVersionStatus(productId, slot, status);
    return NextResponse.json({ ok: true, slot });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
