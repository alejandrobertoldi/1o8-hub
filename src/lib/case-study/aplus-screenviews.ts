import { db } from "@/lib/db";
import {
  aplus2Sets,
  aplus2Versions,
  aplus2Modules,
  aplus2Assets,
  driveFiles,
} from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

export interface AplusScreenview {
  asin:        string;                 // the set's scopeIdentifier (ASIN or parent)
  contentType: "PA+" | "BA+";
  images:      string[];               // ordered /api/aplus2/image proxy URLs, top→bottom
}

export interface AplusScreenviewResult {
  screenviews: AplusScreenview[];       // up to 3, ranked
  hasBasic:    boolean;                 // client has ≥1 BA+ set (any status)
  hasPremium:  boolean;                 // client has ≥1 PA+ set (any status)
}

const proxyUrl = (gid: string) =>
  `/api/aplus2/image?driveFileId=${encodeURIComponent(gid)}`;

// Most-finished version wins: live > approved > newest versionNumber.
function pickVersion<T extends { status: string; versionNumber: number }>(
  versions: T[],
): T | undefined {
  if (versions.length === 0) return undefined;
  const rank = (s: string) => (s === "live" ? 2 : s === "approved" ? 1 : 0);
  return [...versions].sort(
    (a, b) => rank(b.status) - rank(a.status) || b.versionNumber - a.versionNumber,
  )[0];
}

// Set ordering: live/approved first → PA+ before BA+ → scopeIdentifier asc.
function setRank(status: string, contentType: string): number {
  const finished = status === "live" || status === "approved" ? 0 : 1;
  const type = contentType === "PA+" ? 0 : 1;
  return finished * 10 + type; // status group dominates, then content type
}

interface AssetRow {
  moduleId: string | null;
  slotKey: string;
  variant: string;
  moduleItemId: string | null;
  driveFileGid: string;
}

// Build one set's stacked image URLs: per module (position order) take top-level
// image slots, desktop-preferred, ordered by slotKey.
// ponytail: top-level slot images only (moduleItemId IS NULL), slotKey-sorted —
// mirrors the in-app preview's pickModuleImage filter; carousel item images and
// the spec's exact imageSlots order are a later refinement if a stack reads wrong.
function stackImages(
  moduleIdsInOrder: string[],
  assetsByModule: Map<string, AssetRow[]>,
): string[] {
  const urls: string[] = [];
  for (const moduleId of moduleIdsInOrder) {
    const all = (assetsByModule.get(moduleId) ?? []).filter((a) => !a.moduleItemId);
    const desktop = all.filter((a) => a.variant === "desktop");
    const chosen = desktop.length > 0 ? desktop : all;
    chosen
      .sort((a, b) => a.slotKey.localeCompare(b.slotKey))
      .forEach((a) => urls.push(proxyUrl(a.driveFileGid)));
  }
  return urls;
}

export async function resolveAplusScreenviews(
  clientIdCode: string,
): Promise<AplusScreenviewResult> {
  const sets = await db
    .select({
      id: aplus2Sets.id,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      contentType: aplus2Sets.contentType,
    })
    .from(aplus2Sets)
    .where(eq(aplus2Sets.clientIdCode, clientIdCode))
    .orderBy(asc(aplus2Sets.scopeIdentifier));

  if (sets.length === 0) return { screenviews: [], hasBasic: false, hasPremium: false };

  const setIds = sets.map((s) => s.id);
  const versions = await db
    .select({
      id: aplus2Versions.id,
      setId: aplus2Versions.setId,
      versionNumber: aplus2Versions.versionNumber,
      status: aplus2Versions.status,
      contentType: aplus2Versions.contentType,
    })
    .from(aplus2Versions)
    .where(inArray(aplus2Versions.setId, setIds));

  const hasBasic =
    versions.some((v) => v.contentType === "BA+") || sets.some((s) => s.contentType === "BA+");
  const hasPremium =
    versions.some((v) => v.contentType === "PA+") || sets.some((s) => s.contentType === "PA+");

  // Best version per (set, content type) so BA+ and PA+ on the same ASIN both appear.
  const versionsBySet = new Map<string, typeof versions>();
  for (const v of versions) {
    const arr = versionsBySet.get(v.setId) ?? [];
    arr.push(v);
    versionsBySet.set(v.setId, arr);
  }
  const chosen: {
    set: (typeof sets)[number];
    version: (typeof versions)[number];
    contentType: "PA+" | "BA+";
  }[] = [];
  for (const s of sets) {
    const vs = versionsBySet.get(s.id) ?? [];
    const byType = new Map<string, typeof vs>();
    for (const v of vs) {
      const type = v.contentType === "BA+" || v.contentType === "PA+" ? v.contentType : s.contentType;
      const arr = byType.get(type) ?? [];
      arr.push(v);
      byType.set(type, arr);
    }
    for (const [type, group] of byType) {
      const v = pickVersion(group);
      if (v) chosen.push({ set: s, version: v, contentType: type as "PA+" | "BA+" });
    }
  }

  if (chosen.length === 0) return { screenviews: [], hasBasic, hasPremium };

  const chosenVersionIds = chosen.map((c) => c.version.id);
  const [modules, assets] = await Promise.all([
    db
      .select({
        id: aplus2Modules.id,
        versionId: aplus2Modules.versionId,
        position: aplus2Modules.position,
      })
      .from(aplus2Modules)
      .where(inArray(aplus2Modules.versionId, chosenVersionIds))
      .orderBy(asc(aplus2Modules.position)),
    db
      .select({
        moduleId: aplus2Assets.moduleId,
        slotKey: aplus2Assets.slotKey,
        variant: aplus2Assets.variant,
        moduleItemId: aplus2Assets.moduleItemId,
        driveFileGid: driveFiles.driveFileId,
      })
      .from(aplus2Assets)
      .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
      .where(
        and(
          inArray(aplus2Assets.versionId, chosenVersionIds),
          eq(aplus2Assets.kind, "image"),
        ),
      ),
  ]);

  // Index modules per version (sort by position to guarantee order regardless of DB return order) and assets per module.
  modules.sort((a, b) => a.position - b.position);
  const moduleIdsByVersion = new Map<string, string[]>();
  for (const m of modules) {
    const arr = moduleIdsByVersion.get(m.versionId) ?? [];
    arr.push(m.id);
    moduleIdsByVersion.set(m.versionId, arr);
  }
  const assetsByModule = new Map<string, AssetRow[]>();
  for (const a of assets) {
    if (!a.moduleId) continue;
    const arr = assetsByModule.get(a.moduleId) ?? [];
    arr.push(a as AssetRow);
    assetsByModule.set(a.moduleId, arr);
  }

  const screenviews: (AplusScreenview & { rank: number })[] = [];
  for (const { set, version, contentType } of chosen) {
    const images = stackImages(moduleIdsByVersion.get(version.id) ?? [], assetsByModule);
    if (images.length === 0) continue;
    screenviews.push({
      asin: set.scopeIdentifier,
      contentType,
      images,
      rank: setRank(version.status, contentType),
    });
  }

  screenviews.sort(
    (a, b) => a.rank - b.rank || a.asin.localeCompare(b.asin),
  );

  return {
    screenviews: screenviews.slice(0, 3).map(({ rank: _rank, ...rest }) => rest),
    hasBasic,
    hasPremium,
  };
}
