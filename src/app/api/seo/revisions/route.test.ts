import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: null as unknown, approvers: { pm: null, am: null } as unknown }));
const row = { revisionId: "R1", projectId: "P1", projectName: "TRS_v01", clientIdCode: "TRS_SC_US", revisionNumber: 1, status: "pm_review", submittedByEmail: "sam@x.com" };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [row] }) }) }) } }));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => h.approvers }));

import { GET } from "./route";
const call = () => GET({ nextUrl: new URL("http://x/api/seo/revisions?awaiting=me") } as never);
beforeEach(() => { h.approvers = { pm: null, am: null }; });

describe("GET awaiting=me", () => {
  it("an owner who authored an unassigned revision does not see it", async () => {
    h.session = { user: { email: "sam@x.com", role: "owner" } };
    expect((await (await call()).json()).items).toEqual([]);
  });
  it("a different owner sees the unassigned revision", async () => {
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    const { items } = await (await call()).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ revisionId: "R1", unassigned: true });
  });
  it("the assigned PM sees it", async () => {
    h.approvers = { pm: { name: "Pat", email: "pat@x.com" }, am: null };
    h.session = { user: { email: "pat@x.com", role: "editor" } };
    const { items } = await (await call()).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ revisionId: "R1", unassigned: false });
  });
  it("a viewer → 403", async () => {
    h.session = { user: { email: "pat@x.com", role: "viewer" } };
    expect((await call()).status).toBe(403);
  });
});
