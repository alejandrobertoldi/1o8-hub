import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { db } from "@/lib/db";
import { resolveAplusScreenviews } from "./aplus-screenviews";

const mockSelect = vi.mocked(db.select);

// Each db.select() returns a thenable chain (Drizzle builders are PromiseLike).
// Awaiting the builder resolves `rows` regardless of which terminal method ran.
function queryResult<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: T[]) => unknown) => resolve(rows);
  return chain as unknown as ReturnType<typeof db.select>;
}

// Order the resolver issues queries: sets, versions, [modules, assets].
function program(opts: {
  sets: { id: string; scopeIdentifier: string; contentType: string }[];
  versions: { id: string; setId: string; versionNumber: number; status: string; contentType?: string }[];
  modules: { id: string; versionId: string; position: number }[];
  assets: { moduleId: string | null; slotKey: string; variant: string; moduleItemId: string | null; driveFileGid: string }[];
}) {
  mockSelect
    .mockReturnValueOnce(queryResult(opts.sets))
    .mockReturnValueOnce(queryResult(opts.versions))
    .mockReturnValueOnce(queryResult(opts.modules))
    .mockReturnValueOnce(queryResult(opts.assets));
}

describe("resolveAplusScreenviews", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns empty + both flags false when the client has no sets", async () => {
    program({ sets: [], versions: [], modules: [], assets: [] });
    const r = await resolveAplusScreenviews("EMPTY");
    expect(r).toEqual({ screenviews: [], hasBasic: false, hasPremium: false });
  });

  it("computes hasBasic/hasPremium from set contentType regardless of images", async () => {
    program({
      sets: [
        { id: "s1", scopeIdentifier: "B01", contentType: "PA+" },
        { id: "s2", scopeIdentifier: "B02", contentType: "BA+" },
      ],
      versions: [], // no versions → no images, but flags still reflect presence
      modules: [],
      assets: [],
    });
    const r = await resolveAplusScreenviews("C");
    expect(r.hasBasic).toBe(true);
    expect(r.hasPremium).toBe(true);
    expect(r.screenviews).toEqual([]);
  });

  it("maps desktop images to proxy URLs, ordered by module position then slotKey", async () => {
    program({
      sets: [{ id: "s1", scopeIdentifier: "B0A", contentType: "PA+" }],
      versions: [{ id: "v1", setId: "s1", versionNumber: 1, status: "live" }],
      modules: [
        { id: "m2", versionId: "v1", position: 2 },
        { id: "m1", versionId: "v1", position: 1 },
      ],
      assets: [
        { moduleId: "m1", slotKey: "image_b", variant: "desktop", moduleItemId: null, driveFileGid: "G1b" },
        { moduleId: "m1", slotKey: "image_a", variant: "desktop", moduleItemId: null, driveFileGid: "G1a" },
        { moduleId: "m2", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "G2" },
      ],
    });
    const r = await resolveAplusScreenviews("C");
    // modules sorted by position (m1 then m2); within m1 slotKey asc (image_a, image_b)
    expect(r.screenviews[0].images).toEqual([
      "/api/aplus2/image?driveFileId=G1a",
      "/api/aplus2/image?driveFileId=G1b",
      "/api/aplus2/image?driveFileId=G2",
    ]);
  });

  it("prefers the live version, then approved, then newest versionNumber", async () => {
    program({
      sets: [{ id: "s1", scopeIdentifier: "B0A", contentType: "PA+" }],
      versions: [
        { id: "vNew", setId: "s1", versionNumber: 3, status: "in_review" },
        { id: "vApproved", setId: "s1", versionNumber: 2, status: "approved" },
      ],
      modules: [{ id: "m1", versionId: "vApproved", position: 1 }],
      assets: [{ moduleId: "m1", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "GA" }],
    });
    const r = await resolveAplusScreenviews("C");
    expect(r.screenviews[0].images).toEqual(["/api/aplus2/image?driveFileId=GA"]);
  });

  it("falls back to non-desktop images when a module has no desktop variant", async () => {
    program({
      sets: [{ id: "s1", scopeIdentifier: "B0A", contentType: "PA+" }],
      versions: [{ id: "v1", setId: "s1", versionNumber: 1, status: "live" }],
      modules: [{ id: "m1", versionId: "v1", position: 1 }],
      assets: [{ moduleId: "m1", slotKey: "image", variant: "mobile", moduleItemId: null, driveFileGid: "GM" }],
    });
    const r = await resolveAplusScreenviews("C");
    expect(r.screenviews[0].images).toEqual(["/api/aplus2/image?driveFileId=GM"]);
  });

  it("ranks live/approved first, then PA+ before BA+, then ASIN asc; caps at 3; skips image-less sets", async () => {
    program({
      sets: [
        { id: "sLiveBA", scopeIdentifier: "B02", contentType: "BA+" },   // live BA+
        { id: "sLivePA", scopeIdentifier: "B01", contentType: "PA+" },   // live PA+ (should be first)
        { id: "sReviewPA", scopeIdentifier: "B00", contentType: "PA+" }, // in_review PA+
        { id: "sEmpty", scopeIdentifier: "B09", contentType: "PA+" },    // no images → skipped
        { id: "sExtra", scopeIdentifier: "B05", contentType: "BA+" },    // live BA+ — pushed out by cap
      ],
      versions: [
        { id: "vLiveBA", setId: "sLiveBA", versionNumber: 1, status: "live" },
        { id: "vLivePA", setId: "sLivePA", versionNumber: 1, status: "live" },
        { id: "vReviewPA", setId: "sReviewPA", versionNumber: 1, status: "in_review" },
        { id: "vEmpty", setId: "sEmpty", versionNumber: 1, status: "live" },
        { id: "vExtra", setId: "sExtra", versionNumber: 1, status: "live" },
      ],
      modules: [
        { id: "mLiveBA", versionId: "vLiveBA", position: 1 },
        { id: "mLivePA", versionId: "vLivePA", position: 1 },
        { id: "mReviewPA", versionId: "vReviewPA", position: 1 },
        { id: "mExtra", versionId: "vExtra", position: 1 },
        // vEmpty has no module → no images → skipped
      ],
      assets: [
        { moduleId: "mLiveBA", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gLiveBA" },
        { moduleId: "mLivePA", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gLivePA" },
        { moduleId: "mReviewPA", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gReviewPA" },
        { moduleId: "mExtra", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gExtra" },
      ],
    });
    const r = await resolveAplusScreenviews("C");
    expect(r.screenviews.map((s) => s.asin)).toEqual(["B01", "B02", "B05"]);
    // B01 live PA+ first; live BA+ ranked by ASIN (B02 < B05); in_review PA+ (B00) pushed past the cap of 3.
  });

  it("emits both BA+ and PA+ screenviews when they are versions of the same ASIN set", async () => {
    program({
      sets: [{ id: "s1", scopeIdentifier: "B0B39MGKRQ", contentType: "PA+" }],
      versions: [
        { id: "vBa", setId: "s1", versionNumber: 1, status: "live", contentType: "BA+" },
        { id: "vPa", setId: "s1", versionNumber: 2, status: "live", contentType: "PA+" },
      ],
      modules: [
        { id: "mBa", versionId: "vBa", position: 1 },
        { id: "mPa", versionId: "vPa", position: 1 },
      ],
      assets: [
        { moduleId: "mBa", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gBa" },
        { moduleId: "mPa", slotKey: "image", variant: "desktop", moduleItemId: null, driveFileGid: "gPa" },
      ],
    });
    const r = await resolveAplusScreenviews("BNU_SC_US");
    expect(r.hasBasic).toBe(true);
    expect(r.hasPremium).toBe(true);
    expect(r.screenviews.map((s) => `${s.asin}:${s.contentType}`)).toEqual([
      "B0B39MGKRQ:PA+",
      "B0B39MGKRQ:BA+",
    ]);
  });
});
