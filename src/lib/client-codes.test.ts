import { describe, expect, it } from "vitest";
import {
  parseClientIdCodes,
  selectVisibleClients,
  sessionHasClient,
  toggleVisibleClient,
  formatPortalClientBadge,
  resolveActivePortalClient,
} from "./client-codes";

describe("parseClientIdCodes", () => {
  it("splits, trims, and dedupes", () => {
    expect(parseClientIdCodes("TRT_SC_US, BNU_SC_US,TRT_SC_US")).toEqual([
      "TRT_SC_US",
      "BNU_SC_US",
    ]);
  });

  it("returns empty for blank values", () => {
    expect(parseClientIdCodes(null)).toEqual([]);
    expect(parseClientIdCodes(" , , ")).toEqual([]);
  });
});

describe("sessionHasClient", () => {
  it("matches one code in a comma-separated assignment", () => {
    expect(sessionHasClient("TRT_SC_US,BNU_SC_US", "BNU_SC_US")).toBe(true);
    expect(sessionHasClient("TRT_SC_US,BNU_SC_US", "HAL_SC_US")).toBe(false);
  });
});

describe("selectVisibleClients", () => {
  const assigned = ["TRT_SC_US", "BNU_SC_US", "HAL_SC_US"];

  it("returns every assigned client when nothing is stored", () => {
    expect(selectVisibleClients(assigned, undefined)).toEqual(assigned);
  });

  it("drops codes the user is no longer assigned", () => {
    expect(selectVisibleClients(assigned, ["BNU_SC_US", "GONE"])).toEqual(["BNU_SC_US"]);
  });

  it("falls back to all assigned when the stored list is empty of valid codes", () => {
    expect(selectVisibleClients(assigned, ["GONE"])).toEqual(assigned);
  });
});

describe("formatPortalClientBadge", () => {
  const names = { TRT_SC_US: "Trutek", BNU_SC_US: "Benu" };

  it("shows the name for a single client", () => {
    expect(formatPortalClientBadge(["TRT_SC_US"], names)).toBe("Trutek");
  });

  it("summarizes three or more clients", () => {
    expect(formatPortalClientBadge(["TRT_SC_US", "BNU_SC_US", "HAL_SC_US"], names)).toBe(
      "Trutek + 2 more",
    );
  });
});

describe("resolveActivePortalClient", () => {
  const visible = ["HAL_SC_US"];

  it("uses the enabled client for portal users, not the first assigned code", () => {
    expect(resolveActivePortalClient(visible, null, false)).toBe("HAL_SC_US");
  });

  it("ignores a URL client that the dropdown has turned off", () => {
    expect(resolveActivePortalClient(visible, "TRT_SC_US", false)).toBe("HAL_SC_US");
  });

  it("honors ?client= when that client is enabled", () => {
    expect(resolveActivePortalClient(["TRT_SC_US", "HAL_SC_US"], "HAL_SC_US", false)).toBe(
      "HAL_SC_US",
    );
  });

  it("uses the URL for admin preview", () => {
    expect(resolveActivePortalClient(["HAL_SC_US"], "TRT_SC_US", true)).toBe("TRT_SC_US");
    expect(resolveActivePortalClient(["HAL_SC_US"], null, true)).toBeNull();
  });
});

describe("toggleVisibleClient", () => {
  const assigned = ["TRT_SC_US", "BNU_SC_US"];

  it("enables a currently hidden assigned client", () => {
    expect(toggleVisibleClient(assigned, ["TRT_SC_US"], "BNU_SC_US", true)).toEqual([
      "TRT_SC_US",
      "BNU_SC_US",
    ]);
  });

  it("disables a client while others remain", () => {
    expect(toggleVisibleClient(assigned, assigned, "TRT_SC_US", false)).toEqual(["BNU_SC_US"]);
  });

  it("refuses to disable the last remaining client", () => {
    expect(toggleVisibleClient(assigned, ["TRT_SC_US"], "TRT_SC_US", false)).toEqual([
      "TRT_SC_US",
    ]);
  });
});
