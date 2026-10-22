import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: null as unknown, enabled: true, product: [{ id: "M1", asin: "A1" }] as unknown[], driveId: "d0" as string | null, thumbs: [] as string[],
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async () => ({ revision: { id: "R1", content: { A1: { Title: "t" } } }, project: { id: "P1", clientIdCode: "TRS_SC_US" } }),
}));
vi.mock("@/lib/seo/revision-portal", async (orig) => ({ ...(await orig<typeof import("@/lib/seo/revision-portal")>()), seoSectionEnabled: async () => h.enabled }));
vi.mock("@/lib/seo/revision-products", () => ({ listingImageDriveId: async () => h.driveId }));
vi.mock("@/lib/drive-client", () => ({ driveClient: { getThumbnail: async (id: string) => { h.thumbs.push(id); return { bytes: new Uint8Array([1, 2]), contentType: "image/jpeg" }; } } }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => h.product }) }) }) } }));

import { GET } from "./route";
const get = (q: string) => GET(new Request(`http://x/api?${q}`) as never, { params: Promise.resolve({ revisionId: "R1" }) });

beforeEach(() => {
  h.session = { user: { email: "maria@client.com", role: "client", clientIdCode: "TRS_SC_US" } };
  h.enabled = true; h.product = [{ id: "M1", asin: "A1" }]; h.driveId = "d0"; h.thumbs.length = 0;
});

describe("portal revision image", () => {
  it("serves the slot's image for a product in this revision", async () => {
    const res = await get("productId=M1&slot=MAIN");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(h.thumbs).toEqual(["d0"]);
  });
  it("another client's user → 403, nothing fetched", async () => {
    h.session = { user: { email: "x@o.com", role: "client", clientIdCode: "REA_SC_US" } };
    expect((await get("productId=M1&slot=MAIN")).status).toBe(403);
    expect(h.thumbs).toHaveLength(0);
  });
  it("a product that isn't this client's / in this revision → 404", async () => {
    h.product = [];
    expect((await get("productId=OTHER&slot=MAIN")).status).toBe(404);
    h.product = [{ id: "M9", asin: "ZZ" }];
    expect((await get("productId=M9&slot=MAIN")).status).toBe(404);
    expect(h.thumbs).toHaveLength(0);
  });
  it("bad slot → 400; no upload for the slot → 404", async () => {
    expect((await get("productId=M1&slot=../etc")).status).toBe(400);
    h.driveId = null;
    expect((await get("productId=M1&slot=PT03")).status).toBe(404);
  });
});
