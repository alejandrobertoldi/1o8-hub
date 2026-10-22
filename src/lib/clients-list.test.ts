import { describe, it, expect } from "vitest";
import {
  buildClientListItem,
  mergeProductStatsIntoClients,
  slimRawDataForList,
  CLIENT_LIST_RAW_KEYS,
} from "./clients-list";
import { emptyClientProductStats } from "./client-product-stats";

describe("slimRawDataForList", () => {
  it("keeps IntentwiseID and team keys, drops the rest", () => {
    expect(
      slimRawDataForList({
        IntentwiseID: "3415610",
        AccountManager_MF: "Alex",
        SpreadsheetDump: "x".repeat(500),
        merchantID: "SECRET",
      }),
    ).toEqual({
      IntentwiseID: "3415610",
      AccountManager_MF: "Alex",
    });
  });

  it("drops blank values", () => {
    expect(slimRawDataForList({ IntentwiseID: "  ", AccountManager_MF: "" })).toEqual(
      {},
    );
  });

  it("can slim to IntentwiseID only", () => {
    expect(
      slimRawDataForList(
        { IntentwiseID: "1", AccountManager_MF: "Alex" },
        ["IntentwiseID"],
      ),
    ).toEqual({ IntentwiseID: "1" });
  });
});

describe("buildClientListItem", () => {
  it("does not pass the full raw blob through", () => {
    const item = buildClientListItem(
      "POO_SC_US",
      {
        clientName: "Poochie Butter",
        clientType: "AIA",
        clientStatus: "Active",
        rawData: {
          IntentwiseID: "3415610",
          AccountManager_MF: "Alex",
          noise: "nope",
        },
        allowedSections: ["sales"],
      },
      emptyClientProductStats(),
      0,
    );
    expect(item.rawData).toEqual({
      IntentwiseID: "3415610",
      AccountManager_MF: "Alex",
    });
    expect(item.team).toEqual([
      { label: "Account Manager", name: "Alex" },
    ]);
    expect(item.rawData).not.toHaveProperty("noise");
  });

  it("lite keys omit team members", () => {
    const item = buildClientListItem(
      "POO_SC_US",
      {
        clientName: "Poochie Butter",
        clientType: null,
        clientStatus: "Active",
        rawData: { IntentwiseID: "3415610", AccountManager_MF: "Alex" },
        allowedSections: [],
      },
      emptyClientProductStats(),
      0,
      ["IntentwiseID"],
    );
    expect(item.rawData).toEqual({ IntentwiseID: "3415610" });
    expect(item.team).toEqual([]);
  });
});

describe("mergeProductStatsIntoClients", () => {
  it("overlays counts onto an already-built list without touching identity fields", () => {
    const base = buildClientListItem(
      "POO_SC_US",
      {
        clientName: "Poochie Butter",
        clientType: null,
        clientStatus: "Active",
        rawData: { IntentwiseID: "3415610" },
        allowedSections: ["sales"],
      },
      emptyClientProductStats(),
      2,
    );
    const stats = new Map([
      [
        "POO_SC_US",
        {
          ...emptyClientProductStats(),
          count: 40,
          activeCount: 30,
          inactiveCount: 10,
        },
      ],
    ]);
    const [merged] = mergeProductStatsIntoClients([base], stats);
    expect(merged.count).toBe(40);
    expect(merged.activeCount).toBe(30);
    expect(merged.statusBreakdown.Active).toBe(30);
    expect(merged.statusBreakdown.Inactive).toBe(10);
    expect(merged.userCount).toBe(2);
    expect(merged.rawData.IntentwiseID).toBe("3415610");
    expect(merged.allowedSections).toEqual(["sales"]);
  });
});

describe("CLIENT_LIST_RAW_KEYS", () => {
  it("always includes IntentwiseID", () => {
    expect(CLIENT_LIST_RAW_KEYS).toContain("IntentwiseID");
  });
});
