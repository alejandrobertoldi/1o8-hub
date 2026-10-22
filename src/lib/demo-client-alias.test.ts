import { describe, it, expect } from "vitest";
import {
  applyDemoClientAlias,
  DEMO_DATA_SOURCE,
  resolveDemoDataSource,
} from "./demo-client-alias";

describe("demo-client-alias", () => {
  it("maps ZIN_SC_US to PUR_SC_US as donor", () => {
    expect(DEMO_DATA_SOURCE.ZIN_SC_US).toBe("PUR_SC_US");
    expect(resolveDemoDataSource("ZIN_SC_US")).toBe("PUR_SC_US");
    expect(resolveDemoDataSource("HOT_SC_US")).toBe("HOT_SC_US");
  });

  it("rebrands donor metrics when filtering to the demo client", () => {
    const clients = [
      {
        clientIdCode: "PUR_SC_US",
        clientName: "Pura",
        brandName: "Pura",
        accountIds: ["iw-pur"],
        ordered_revenue: 1000,
      },
      {
        clientIdCode: "ZIN_SC_US",
        clientName: "ZIN_SC_US",
        brandName: null,
        accountIds: [] as string[],
        ordered_revenue: 0,
      },
    ];

    const out = applyDemoClientAlias(clients, "ZIN_SC_US");
    expect(out).toHaveLength(1);
    expect(out[0].clientIdCode).toBe("ZIN_SC_US");
    expect(out[0].clientName).toBe("Zingora");
    expect(out[0].brandName).toBe("Zingora");
    expect(out[0].accountIds).toEqual(["iw-pur"]);
    expect(out[0].ordered_revenue).toBe(1000);
  });

  it("overlays demo rows in a full client list", () => {
    const clients = [
      {
        clientIdCode: "PUR_SC_US",
        clientName: "Pura",
        brandName: "Pura",
        accountIds: ["iw-pur"],
      },
      {
        clientIdCode: "ZIN_SC_US",
        clientName: "ZIN_SC_US",
        brandName: null as string | null,
        accountIds: [] as string[],
      },
    ];

    const out = applyDemoClientAlias(clients);
    const zin = out.find((c) => c.clientIdCode === "ZIN_SC_US");
    expect(zin?.clientName).toBe("Zingora");
    expect(zin?.accountIds).toEqual(["iw-pur"]);
    expect(out.find((c) => c.clientIdCode === "PUR_SC_US")).toBeTruthy();
  });
});
