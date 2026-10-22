import { describe, expect, it } from "vitest";
import { resolvePortalClient } from "./api-utils";

describe("resolvePortalClient", () => {
  it("uses the first assigned code when a client user omits ?client=", () => {
    const result = resolvePortalClient(
      { user: { role: "client", clientIdCode: "TRT_SC_US,BNU_SC_US" } },
      new URLSearchParams(),
    );
    expect(result).toEqual({ clientIdCode: "TRT_SC_US" });
  });

  it("honors ?client= when it is in the assignment", () => {
    const result = resolvePortalClient(
      { user: { role: "client", clientIdCode: "TRT_SC_US,BNU_SC_US" } },
      new URLSearchParams("client=BNU_SC_US"),
    );
    expect(result).toEqual({ clientIdCode: "BNU_SC_US" });
  });

  it("rejects ?client= that is not assigned", () => {
    const result = resolvePortalClient(
      { user: { role: "client", clientIdCode: "TRT_SC_US,BNU_SC_US" } },
      new URLSearchParams("client=HAL_SC_US"),
    );
    expect(result).toHaveProperty("response");
  });

  it("never treats the raw comma-separated string as a client id", () => {
    const result = resolvePortalClient(
      { user: { role: "client", clientIdCode: "TRT_SC_US,BNU_SC_US" } },
      new URLSearchParams(),
    );
    expect("clientIdCode" in result && result.clientIdCode).toBe("TRT_SC_US");
    expect("clientIdCode" in result && result.clientIdCode?.includes(",")).toBe(false);
  });
});
