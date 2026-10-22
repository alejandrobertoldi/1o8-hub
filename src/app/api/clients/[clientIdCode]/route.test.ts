import { describe, expect, it, vi } from "vitest";

// Mock load-time deps so importing the route module doesn't open DB/Drive/BQ
// clients. We only exercise the pure `buildAacFieldSync` helper here.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/drive-client", () => ({ driveClient: {} }));
vi.mock("@/lib/bigquery", () => ({ updateAacFieldInBigQuery: vi.fn() }));

import { buildAacFieldSync, inactiveRequiresOffboardingDate, INACTIVE_OFFBOARDING_ERROR } from "./route";

describe("buildAacFieldSync", () => {
  it("mirrors ClientStatus into both the JSONB mirror and the typed column", () => {
    const { rawData, columns, bqFields } = buildAacFieldSync(
      { ClientStatus: "Active", Tier: "1" },
      [{ rawKey: "ClientStatus", value: "Prospect" }]
    );

    // JSONB mirror updated (this is what the AAC Table reads first)
    expect(rawData.ClientStatus).toBe("Prospect");
    // typed column override derived — the onboarding view reads this
    expect(columns.clientStatus).toBe("Prospect");
    // BigQuery gets the same value, keyed by the BQ/raw column name
    expect(bqFields).toEqual([{ field: "ClientStatus", value: "Prospect" }]);
  });

  it("keeps the column and mirror in agreement for ClientName too", () => {
    const { rawData, columns } = buildAacFieldSync({}, [
      { rawKey: "ClientName", value: "Soluz de Portugal" },
    ]);
    expect(rawData.ClientName).toBe("Soluz de Portugal");
    expect(columns.clientName).toBe("Soluz de Portugal");
  });

  it("applies multiple edits at once (PATCH/dialog case)", () => {
    const { rawData, columns, bqFields } = buildAacFieldSync({ ClientStatus: "Active" }, [
      { rawKey: "ClientName", value: "Acme" },
      { rawKey: "ClientStatus", value: "Inactive" },
    ]);
    expect(rawData).toMatchObject({ ClientName: "Acme", ClientStatus: "Inactive" });
    expect(columns).toEqual({ clientName: "Acme", clientStatus: "Inactive" });
    expect(bqFields).toHaveLength(2);
  });

  it("converts OnboardingDate to a Date column while mirroring the string", () => {
    const { rawData, columns } = buildAacFieldSync({}, [
      { rawKey: "OnboardingDate", value: "2026-06-17" },
    ]);
    expect(rawData.OnboardingDate).toBe("2026-06-17");
    expect(columns.onboardingDate).toBeInstanceOf(Date);
    expect((columns.onboardingDate as Date).toISOString()).toBe("2026-06-17T00:00:00.000Z");
  });

  it("blank OnboardingDate clears the column to null", () => {
    const { columns } = buildAacFieldSync({}, [{ rawKey: "OnboardingDate", value: "" }]);
    expect(columns.onboardingDate).toBeNull();
  });

  it("updates the JSONB mirror + BQ for raw-only fields with no typed column", () => {
    const { rawData, columns, bqFields } = buildAacFieldSync({}, [
      { rawKey: "Tier", value: "2" },
    ]);
    expect(rawData.Tier).toBe("2");
    expect(columns).toEqual({}); // no typed column for Tier
    expect(bqFields).toEqual([{ field: "Tier", value: "2" }]);
  });

  it("does not mutate the input rawData object", () => {
    const input = { ClientStatus: "Active" };
    buildAacFieldSync(input, [{ rawKey: "ClientStatus", value: "Prospect" }]);
    expect(input.ClientStatus).toBe("Active");
  });

  it("converts OffboardingDate to a Date column while mirroring the string", () => {
    const { rawData, columns } = buildAacFieldSync({}, [
      { rawKey: "OffboardingDate", value: "2026-09-08" },
    ]);
    expect(rawData.OffboardingDate).toBe("2026-09-08");
    expect(columns.offboardingDate).toBeInstanceOf(Date);
    expect((columns.offboardingDate as Date).toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("blank OffboardingDate clears the column to null", () => {
    const { columns } = buildAacFieldSync({}, [{ rawKey: "OffboardingDate", value: "" }]);
    expect(columns.offboardingDate).toBeNull();
  });
});

describe("inactiveRequiresOffboardingDate", () => {
  it("blocks marking Inactive when no offboarding date is present", () => {
    expect(
      inactiveRequiresOffboardingDate({
        nextStatus: "Inactive",
        existingStatus: "Active",
        existingOffboardingDate: null,
      })
    ).toBe(INACTIVE_OFFBOARDING_ERROR);
  });

  it("allows Inactive when the request supplies an offboarding date", () => {
    expect(
      inactiveRequiresOffboardingDate({
        nextStatus: "Inactive",
        nextOffboardingDate: "2026-09-08",
        existingStatus: "Active",
        existingOffboardingDate: null,
      })
    ).toBeNull();
  });

  it("allows Inactive when the client already has an offboarding date", () => {
    expect(
      inactiveRequiresOffboardingDate({
        nextStatus: "Inactive",
        existingStatus: "Active",
        existingOffboardingDate: new Date("2026-09-01T00:00:00Z"),
      })
    ).toBeNull();
  });

  it("blocks clearing OffboardingDate while the client is Inactive", () => {
    expect(
      inactiveRequiresOffboardingDate({
        nextOffboardingDate: "",
        existingStatus: "Inactive",
        existingOffboardingDate: "2026-09-01",
      })
    ).toBe(INACTIVE_OFFBOARDING_ERROR);
  });

  it("allows Active and Prospect without an offboarding date", () => {
    expect(
      inactiveRequiresOffboardingDate({
        nextStatus: "Active",
        existingOffboardingDate: null,
      })
    ).toBeNull();
    expect(
      inactiveRequiresOffboardingDate({
        nextStatus: "Prospect",
        existingOffboardingDate: null,
      })
    ).toBeNull();
  });
});
