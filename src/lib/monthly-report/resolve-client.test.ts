import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  aac: { clientIdCode: "c", clientName: "n", rawData: "r", clientStatus: "s" },
  users: { email: "e", role: "ro", clientIdCode: "c" },
}));
vi.mock("drizzle-orm", () => ({ ilike: vi.fn() }));

import {
  intentwiseIdFromRaw,
  accountManagerFromRaw,
  projectManagerFromRaw,
  monthlyClientsFromAacRows,
  matchMonthlyClient,
} from "./resolve-client";

const rows = [
  { clientIdCode: "POO_SC_US", clientName: "Poochie Butter", rawData: { IntentwiseID: "3415610", AccountManager_MF: "Alex Moreno", ProjectManager_MF: "Sara Khan" } },
  { clientIdCode: "REA_SC_US", clientName: "ReadyRESCUE", rawData: { IntentwiseID: "1899670" } },
  { clientIdCode: "CFX_SC_US", clientName: "Culture Fix", rawData: {} },
  { clientIdCode: "HAL_SC_US", clientName: "Halfday Iced Tea", rawData: { IntentwiseID: "4470600" } },
];

describe("accountManagerFromRaw", () => {
  it("reads AccountManager_MF from an object or JSON string", () => {
    expect(accountManagerFromRaw({ AccountManager_MF: "Alex Moreno" })).toBe("Alex Moreno");
    expect(accountManagerFromRaw('{"AccountManager_MF":"Alex Moreno"}')).toBe("Alex Moreno");
    expect(accountManagerFromRaw({})).toBeNull();
    expect(accountManagerFromRaw({ AccountManager_MF: "  " })).toBeNull();
  });
});

describe("projectManagerFromRaw", () => {
  it("reads ProjectManager_MF from an object or JSON string", () => {
    expect(projectManagerFromRaw({ ProjectManager_MF: "Sara Khan" })).toBe("Sara Khan");
    expect(projectManagerFromRaw('{"ProjectManager_MF":"Sara Khan"}')).toBe("Sara Khan");
    expect(projectManagerFromRaw({})).toBeNull();
  });
});

describe("intentwiseIdFromRaw", () => {
  it("reads IntentwiseID from an object or JSON string", () => {
    expect(intentwiseIdFromRaw({ IntentwiseID: "3415610" })).toBe("3415610");
    expect(intentwiseIdFromRaw('{"IntentwiseID":"3415610"}')).toBe("3415610");
    expect(intentwiseIdFromRaw({ "Intentwise ID": "1" })).toBe("1");
    expect(intentwiseIdFromRaw({})).toBeNull();
  });
});

describe("monthlyClientsFromAacRows", () => {
  it("includes every AAC row, using Intentwise id as code when present", () => {
    const clients = monthlyClientsFromAacRows(rows);
    expect(clients.map((c) => c.name)).toEqual([
      "Culture Fix",
      "Halfday Iced Tea",
      "Poochie Butter",
      "ReadyRESCUE",
    ]);
    expect(clients.find((c) => c.name === "Poochie Butter")).toEqual({
      code: "3415610",
      name: "Poochie Butter",
      accountId: "3415610",
      clientIdCode: "POO_SC_US",
      projectManager: "Sara Khan",
      accountManager: "Alex Moreno",
    });
    expect(clients.find((c) => c.name === "Culture Fix")).toEqual({
      code: "CFX_SC_US",
      name: "Culture Fix",
      accountId: null,
      clientIdCode: "CFX_SC_US",
      projectManager: null,
      accountManager: null,
    });
  });
});

describe("matchMonthlyClient", () => {
  it("resolves by Intentwise id or AAC code", () => {
    expect(matchMonthlyClient(rows, "3415610")).toEqual({
      status: "ok",
      client: { name: "Poochie Butter", accountId: "3415610", clientIdCode: "POO_SC_US", projectManager: "Sara Khan", accountManager: "Alex Moreno" },
    });
    expect(matchMonthlyClient(rows, "REA_SC_US")).toEqual({
      status: "ok",
      client: { name: "ReadyRESCUE", accountId: "1899670", clientIdCode: "REA_SC_US", projectManager: null, accountManager: null },
    });
  });

  it("returns no_intentwise when the AAC row has no account id", () => {
    expect(matchMonthlyClient(rows, "CFX_SC_US")).toEqual({
      status: "no_intentwise",
      name: "Culture Fix",
    });
  });

  it("returns not_found for unknown codes", () => {
    expect(matchMonthlyClient(rows, "NOSUCH")).toEqual({ status: "not_found" });
  });
});
