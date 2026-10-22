import { describe, it, expect } from "vitest";
import { asClientList } from "./use-report-controls";

describe("asClientList", () => {
  it("returns the array when /api/clients succeeds", () => {
    expect(asClientList([{ clientIdCode: "POO_SC_US", clientName: "Poochie Butter", clientStatus: "Active" }])).toHaveLength(1);
  });

  it("returns [] for a 401 error object so print Chrome cannot crash on .find", () => {
    expect(asClientList({ error: "Unauthorized" })).toEqual([]);
  });
});
