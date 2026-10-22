import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ aacRows: [] as unknown[], userRows: [] as unknown[] }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: (t: { __name?: string }) => ({ where: async () => (t.__name === "aac" ? h.aacRows : h.userRows) }) }) },
}));
vi.mock("@/lib/db/schema", () => ({
  aac: { __name: "aac", clientIdCode: "aac.client_id_code", rawData: "aac.raw_data" },
  users: { __name: "users", name: "users.name", email: "users.email", image: "users.image" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), isNotNull: () => ({}) }));

import { loadClientApprovers } from "./revision-approvers";

describe("loadClientApprovers", () => {
  it("parses a JSON-string rawData and resolves PM/AM", async () => {
    h.aacRows = [{ rawData: JSON.stringify({ ProjectManager_MF: "Pat Smith", AccountManager_MF: "Nobody Here" }) }];
    h.userRows = [{ name: "Pat Smith", email: "pat@marketfoundry.agency", image: null }];
    expect(await loadClientApprovers("TRS_SC_US")).toEqual({
      pm: { name: "Pat Smith", email: "pat@marketfoundry.agency" },
      am: { name: "Nobody Here", email: null },
      es: null,
    });
  });
  it("unknown client → both null", async () => {
    h.aacRows = [];
    expect(await loadClientApprovers("NOPE")).toEqual({ pm: null, am: null });
  });
});
