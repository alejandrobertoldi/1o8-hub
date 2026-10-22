import { describe, it, expect } from "vitest";
import {
  selectEligibleAccounts,
  computeWindow,
  buildNightlyWorkUnits,
  formatUtcDate,
  hashUnitKey,
  probeCadence,
  utcDayNumber,
  isProbeNight,
  decideUnit,
  unitHistoryKey,
  MIN_OBSERVED_NIGHTS,
  type AccountLifecycleInput,
  type ClientLifecycleInput,
  type CatalogRowForUnits,
  type UnitHistory,
} from "@/lib/archive/work-units";

const NOW = new Date("2026-08-10T20:00:00Z");

describe("selectEligibleAccounts", () => {
  it("includes an active, mapped account whose client is Active with no offboarding date", () => {
    const accounts: AccountLifecycleInput[] = [
      { accountId: "1", clientIdCode: "ACME", isActive: true },
    ];
    const clients: ClientLifecycleInput[] = [
      { clientIdCode: "ACME", clientStatus: "Active", offboardingDate: null },
    ];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toEqual(accounts);
  });

  it("is case-insensitive on client_status, matching ilike convention elsewhere in the app", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "ACME", isActive: true }];
    const clients: ClientLifecycleInput[] = [{ clientIdCode: "ACME", clientStatus: "ACTIVE", offboardingDate: null }];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toHaveLength(1);
  });

  it("excludes an account whose intentwise_accounts.is_active is false, regardless of client status", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "ACME", isActive: false }];
    const clients: ClientLifecycleInput[] = [{ clientIdCode: "ACME", clientStatus: "Active", offboardingDate: null }];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toEqual([]);
  });

  it("excludes a mapped account whose client_status is not active", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "X", isActive: true }];
    const clients: ClientLifecycleInput[] = [{ clientIdCode: "X", clientStatus: "Prospect", offboardingDate: null }];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toEqual([]);
  });

  it("excludes a mapped account whose offboarding_date has passed", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "X", isActive: true }];
    const clients: ClientLifecycleInput[] = [
      { clientIdCode: "X", clientStatus: "Active", offboardingDate: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toEqual([]);
  });

  it("includes a mapped account whose offboarding_date is in the future", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "X", isActive: true }];
    const clients: ClientLifecycleInput[] = [
      { clientIdCode: "X", clientStatus: "Active", offboardingDate: new Date("2027-01-01T00:00:00Z") },
    ];
    expect(selectEligibleAccounts(accounts, clients, NOW)).toHaveLength(1);
  });

  it("fails OPEN for an unmapped account (client_id_code null) — locked decision 3/5", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "999", clientIdCode: null, isActive: true }];
    expect(selectEligibleAccounts(accounts, [], NOW)).toEqual(accounts);
  });

  it("fails CLOSED for a mapped account whose client_id_code has no matching aac row (orphaned mapping, not the same as unmapped)", () => {
    const accounts: AccountLifecycleInput[] = [{ accountId: "1", clientIdCode: "GHOST", isActive: true }];
    expect(selectEligibleAccounts(accounts, [], NOW)).toEqual([]);
  });
});

describe("computeWindow", () => {
  it("computes a repull-window range for timeseries tables", () => {
    expect(computeWindow("timeseries", 14, new Date("2026-08-10T20:00:00Z"))).toEqual({
      windowFrom: "2026-07-27",
      windowTo: "2026-08-10",
    });
  });

  it("computes a repull-window range for period tables the same way", () => {
    expect(computeWindow("period", 14, new Date("2026-08-10T20:00:00Z"))).toEqual({
      windowFrom: "2026-07-27",
      windowTo: "2026-08-10",
    });
  });

  it("returns a null window for snapshot tables — they overwrite in place, not incrementally", () => {
    expect(computeWindow("snapshot", 14, new Date("2026-08-10T20:00:00Z"))).toEqual({
      windowFrom: null,
      windowTo: null,
    });
  });
});

describe("formatUtcDate", () => {
  it("formats using UTC components, since this always formats a freshly-created run date, not a DB-returned value", () => {
    expect(formatUtcDate(new Date("2026-08-10T23:59:00Z"))).toBe("2026-08-10");
    expect(formatUtcDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("buildNightlyWorkUnits", () => {
  const catalogRows: CatalogRowForUnits[] = [
    { schemaName: "intentwise_ecommerce_graph", tableName: "account_summary", tableKind: "timeseries", repullWindowDays: 14 },
    { schemaName: "amazon_source_data", tableName: "sellercentral_alllistings_report", tableKind: "snapshot", repullWindowDays: 14 },
  ];
  const accounts: AccountLifecycleInput[] = [
    { accountId: "154290", clientIdCode: "GAF", isActive: true },
    { accountId: "4470600", clientIdCode: null, isActive: true },
  ];
  const runDate = new Date("2026-08-10T20:00:00Z");

  it("produces one work unit per (table x account), windowed by table kind", () => {
    const { units, unitsSkipped, unitsProbed } = buildNightlyWorkUnits(catalogRows, accounts, runDate);
    expect(units).toHaveLength(4);
    expect(unitsSkipped).toBe(0);
    expect(unitsProbed).toBe(0);
    const ts = units.find((u) => u.tableName === "account_summary" && u.accountId === "154290");
    expect(ts).toEqual({
      schemaName: "intentwise_ecommerce_graph",
      tableName: "account_summary",
      accountId: "154290",
      windowFrom: "2026-07-27",
      windowTo: "2026-08-10",
    });
    const snap = units.find((u) => u.tableName === "sellercentral_alllistings_report" && u.accountId === "4470600");
    expect(snap).toEqual({
      schemaName: "amazon_source_data",
      tableName: "sellercentral_alllistings_report",
      accountId: "4470600",
      windowFrom: null,
      windowTo: null,
    });
  });

  it("produces zero work units when there are no enabled catalog rows or no eligible accounts", () => {
    expect(buildNightlyWorkUnits([], accounts, runDate).units).toEqual([]);
    expect(buildNightlyWorkUnits(catalogRows, [], runDate).units).toEqual([]);
  });
});

// ─── empty-unit skip (design 2026-08-17) ─────────────────────────────

/** N consecutive UTC dates starting at `start`, as Date objects. */
function utcDates(start: string, n: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(`${start}T20:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d);
  }
  return out;
}

describe("probeCadence", () => {
  it("halves the repull window: all eight enabled tables use 14 days, giving a 7-day cadence", () => {
    expect(probeCadence(14)).toBe(7);
    expect(probeCadence(30)).toBe(15);
    expect(probeCadence(7)).toBe(3);
  });

  it("clamps to 1 for repull windows of 2 or less, which makes such a table un-skippable rather than skipped every night", () => {
    expect(probeCadence(2)).toBe(1);
    expect(probeCadence(1)).toBe(1);
    expect(probeCadence(0)).toBe(1);
  });
});

describe("isProbeNight", () => {
  it("fires exactly once for a given unit across any run of `cadence` consecutive UTC dates — this is what pins the maximum probe interval to `cadence` days", () => {
    const cadence = 7;
    const keys = [
      unitHistoryKey("amazon_source_data", "share_of_voice", "154290"),
      unitHistoryKey("amazon_source_data", "refdata_label", "4470600"),
      unitHistoryKey("intentwise_ecommerce_graph", "account_summary", "3775570"),
    ];
    // Three different 7-day runs, so the invariant is not an artefact of one
    // alignment of the UTC day number.
    for (const start of ["2026-08-18", "2026-09-01", "2027-02-25"]) {
      for (const key of keys) {
        const hits = utcDates(start, cadence).filter((d) => isProbeNight(d, key, cadence)).length;
        expect(hits).toBe(1);
      }
    }
  });

  it("is a phase, not a gap: 257 keys spread across the 7 nights of a cadence, with no night carrying more than twice the mean", () => {
    // The only assertion in this file whose outcome depends on FNV-1a's actual
    // spread rather than on arithmetic. It is deterministic, so it either
    // always passes or always fails. If it fails, the hash is broken — replace
    // the hash, do NOT widen the 2x bound.
    const cadence = 7;
    const keys: string[] = [];
    for (let i = 0; i < 257; i++) {
      keys.push(unitHistoryKey("amazon_source_data", "share_of_voice", String(100000 + i * 37)));
    }
    const perNight = utcDates("2026-08-18", cadence).map(
      (d) => keys.filter((k) => isProbeNight(d, k, cadence)).length
    );
    expect(perNight.reduce((a, b) => a + b, 0)).toBe(keys.length); // every key probes exactly once
    const mean = keys.length / cadence;
    for (const n of perNight) {
      expect(n).toBeLessThanOrEqual(2 * mean);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("hashUnitKey and utcDayNumber are deterministic and non-negative, so the modulo can never go negative", () => {
    expect(hashUnitKey("a.b:1")).toBe(hashUnitKey("a.b:1"));
    expect(hashUnitKey("a.b:1")).not.toBe(hashUnitKey("a.b:2"));
    expect(hashUnitKey("a.b:1")).toBeGreaterThanOrEqual(0);
    expect(utcDayNumber(new Date("2026-08-17T23:59:59Z"))).toBe(utcDayNumber(new Date("2026-08-17T00:00:00Z")));
    expect(utcDayNumber(new Date("2026-08-18T00:00:00Z")) - utcDayNumber(new Date("2026-08-17T00:00:00Z"))).toBe(1);
  });
});

describe("decideUnit", () => {
  const KEY = unitHistoryKey("amazon_source_data", "share_of_voice", "154290");
  const RUN_DATE = new Date("2026-08-18T20:00:00Z");

  it("fails OPEN for a unit with no history at all — a never-observed unit is always enqueued", () => {
    expect(decideUnit(undefined, RUN_DATE, KEY, 14)).toBe("enqueue-no-history");
  });

  it("never demotes a unit that has EVER produced rows, even after 100 consecutive zero nights — this is what makes the dead share_of_voice feed safe", () => {
    const proven: UnitHistory = { nightlyObservations: 100, peakRows: 3_574_335 };
    expect(decideUnit(proven, RUN_DATE, KEY, 14)).toBe("enqueue-proven");
  });

  it("fails OPEN while the evidence is thin: fewer than MIN_OBSERVED_NIGHTS nightly observations is always enqueued", () => {
    const thin: UnitHistory = { nightlyObservations: MIN_OBSERVED_NIGHTS - 1, peakRows: 0 };
    expect(decideUnit(thin, RUN_DATE, KEY, 14)).toBe("enqueue-insufficient-evidence");
    // The boundary itself is skippable, not thin.
    const atFloor: UnitHistory = { nightlyObservations: MIN_OBSERVED_NIGHTS, peakRows: 0 };
    expect(["enqueue-probe", "skip"]).toContain(decideUnit(atFloor, RUN_DATE, KEY, 14));
  });

  it("an always-zero unit with enough observations is enqueued as a probe on exactly one night per cadence", () => {
    const empty: UnitHistory = { nightlyObservations: 3, peakRows: 0 };
    const decisions = utcDates("2026-08-18", 7).map((d) => decideUnit(empty, d, KEY, 14));
    expect(decisions.filter((x) => x === "enqueue-probe")).toHaveLength(1);
  });

  it("...and is skipped on the other six nights of that cadence", () => {
    const empty: UnitHistory = { nightlyObservations: 3, peakRows: 0 };
    const decisions = utcDates("2026-08-18", 7).map((d) => decideUnit(empty, d, KEY, 14));
    expect(decisions.filter((x) => x === "skip")).toHaveLength(6);
  });

  it("takes its cadence from the table's own repull_window_days, so a 2-day window is never skipped no matter how empty", () => {
    const empty: UnitHistory = { nightlyObservations: 500, peakRows: 0 };
    for (const d of utcDates("2026-08-18", 14)) {
      expect(decideUnit(empty, d, KEY, 2)).toBe("enqueue-probe");
      expect(decideUnit(empty, d, KEY, 1)).toBe("enqueue-probe");
    }
  });

  it("a snapshot table's cadence comes from its own repull_window_days too — the predicate never inspects table kind", () => {
    const empty: UnitHistory = { nightlyObservations: 10, peakRows: 0 };
    const snapshotKey = unitHistoryKey("amazon_source_data", "refdata_label", "4470600");
    const over30 = utcDates("2026-08-18", 30).map((d) => decideUnit(empty, d, snapshotKey, 30));
    expect(over30.filter((x) => x === "enqueue-probe")).toHaveLength(2); // cadence 15, 30 days
  });
});

describe("buildNightlyWorkUnits — skip filtering", () => {
  const catalogRows: CatalogRowForUnits[] = [
    { schemaName: "intentwise_ecommerce_graph", tableName: "account_summary", tableKind: "timeseries", repullWindowDays: 14 },
  ];
  const accounts: AccountLifecycleInput[] = [
    { accountId: "PROVEN", clientIdCode: "A", isActive: true },
    { accountId: "EMPTY", clientIdCode: "B", isActive: true },
    { accountId: "UNSEEN", clientIdCode: "C", isActive: true },
  ];

  /** History is date-independent — the phase comes from the key, not the map. */
  function history() {
    const key = (acct: string) => unitHistoryKey("intentwise_ecommerce_graph", "account_summary", acct);
    return new Map<string, UnitHistory>([
      [key("PROVEN"), { nightlyObservations: 5, peakRows: 12_345 }],
      [key("EMPTY"), { nightlyObservations: 5, peakRows: 0 }],
      // UNSEEN deliberately absent
    ]);
  }

  it("drops skipped units from the returned list and counts them, keeping proven and unseen units", () => {
    // Sweep the cadence so we land on a night where EMPTY is skipped, without
    // hardcoding a hash value.
    const dates = utcDates("2026-08-18", 7);
    const plans = dates.map((d) => buildNightlyWorkUnits(catalogRows, accounts, d, history()));

    const skipNights = plans.filter((p) => p.unitsSkipped === 1);
    const probeNights = plans.filter((p) => p.unitsProbed === 1);
    expect(skipNights).toHaveLength(6);
    expect(probeNights).toHaveLength(1);

    // On a skip night: PROVEN and UNSEEN survive, EMPTY does not.
    const skipped = skipNights[0];
    expect(skipped.units.map((u) => u.accountId).sort()).toEqual(["PROVEN", "UNSEEN"]);
    expect(skipped.unitsProbed).toBe(0);

    // On the probe night: all three are enqueued.
    const probed = probeNights[0];
    expect(probed.units).toHaveLength(3);
    expect(probed.unitsSkipped).toBe(0);
  });

  it("omitting the history map yields the full Cartesian fanout — this is the fail-open path for a failed history read and for any future non-nightly caller", () => {
    for (const d of utcDates("2026-08-18", 7)) {
      const plan = buildNightlyWorkUnits(catalogRows, accounts, d);
      expect(plan.units).toHaveLength(3);
      expect(plan.unitsSkipped).toBe(0);
      expect(plan.unitsProbed).toBe(0);
    }
  });
});
