import { describe, it, expect } from "vitest";
import {
  toNumber,
  hasAccountIdColumn,
  detectDateColumn,
  classifyTableKind,
  mapRedshiftTypeToBigQuery,
  assertSafeIdentifier,
  sourceRefreshWindowDays,
  columnTypeDrifted,
  timestampIsTzAware,
  type SourceColumn,
} from "@/lib/archive/catalog";

describe("toNumber", () => {
  it("coerces the string counts this Redshift driver returns", () => {
    expect(toNumber("500")).toBe(500);
    expect(toNumber("0")).toBe(0);
  });

  it("passes numbers through", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
  });

  it("treats null and undefined as zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it("throws on values that are not numeric, rather than silently returning NaN", () => {
    expect(() => toNumber("not-a-number")).toThrow(/not numeric/i);
    expect(() => toNumber({})).toThrow(/not numeric/i);
  });
});

const cols = (...names: Array<[string, string]>): SourceColumn[] =>
  names.map(([name, type]) => ({ name, type }));

describe("hasAccountIdColumn", () => {
  it("finds account_id regardless of case", () => {
    expect(hasAccountIdColumn(cols(["ACCOUNT_ID", "bigint"]))).toBe(true);
    expect(hasAccountIdColumn(cols(["account_id", "bigint"]))).toBe(true);
  });

  it("rejects lookalikes that are not the filter key", () => {
    expect(hasAccountIdColumn(cols(["sub_account_id", "bigint"]))).toBe(false);
    expect(hasAccountIdColumn(cols(["account_name", "varchar"]))).toBe(false);
    expect(hasAccountIdColumn([])).toBe(false);
  });
});

describe("detectDateColumn", () => {
  it("prefers report_date, the name both live schemas actually use", () => {
    const c = cols(["report_date", "date"], ["start_date", "date"]);
    expect(detectDateColumn(c)).toBe("report_date");
  });

  it("falls back through the priority list before guessing by type", () => {
    expect(detectDateColumn(cols(["snapshot_date", "date"]))).toBe("snapshot_date");
    expect(detectDateColumn(cols(["some_other_day", "date"]))).toBe("some_other_day");
  });

  it("ignores date-typed columns that are structure attributes, not report grain", () => {
    // A campaign's own start_date is not the table's time grain.
    expect(detectDateColumn(cols(["campaign_id", "bigint"], ["start_date", "date"], ["end_date", "date"]))).toBeNull();
  });

  it("returns null when there is no date column at all", () => {
    expect(detectDateColumn(cols(["account_id", "bigint"], ["sku", "varchar"]))).toBeNull();
  });

  it("recognises 'reportdate' — the unseparated spelling the Sponsored Ads report tables use", () => {
    // ad_sponsoredproducts_campaign_report, ad_sponsoredbrand_adgroup_report,
    // dsp_creative_report and five others name their grain column with no
    // underscore. Missing it filed every one of them as a snapshot, which
    // re-reads and re-stores the WHOLE per-account table every night.
    //
    // The second date-typed column is the point of this test: it disables the
    // lone-date-typed-column fallback, so only the priority list can pass it.
    expect(
      detectDateColumn(cols(["account_id", "bigint"], ["reportdate", "date"], ["portfolio_date", "date"]))
    ).toBe("reportdate");
  });

  it("recognises 'sale_date' — the grain column of the salesandtraffic tables", () => {
    expect(
      detectDateColumn(cols(["account_id", "bigint"], ["sale_date", "date"], ["ingested_date", "date"]))
    ).toBe("sale_date");
  });

  it("still prefers report_date when a table carries more than one recognised grain name", () => {
    expect(
      detectDateColumn(cols(["sale_date", "date"], ["report_date", "date"], ["reportdate", "date"]))
    ).toBe("report_date");
    expect(detectDateColumn(cols(["date", "date"], ["reportdate", "date"]))).toBe("reportdate");
  });

  it("accepts a lone naive timestamp under its unabbreviated spelling", () => {
    // SVV_COLUMNS reports native Redshift tables as "timestamp without time
    // zone"; only SVV_EXTERNAL_COLUMNS says "timestamp". The long spelling was
    // invisible to the type fallback, so a table whose only date column was a
    // native timestamp classified as snapshot.
    expect(
      detectDateColumn(cols(["account_id", "bigint"], ["event_date", "timestamp without time zone"]))
    ).toBe("event_date");
  });

  it("never treats a row-mutation stamp as the table's grain, however it is spelled", () => {
    // A timeseries table only ever pulls WHERE col >= today - repull_window,
    // so keying one on "when this row last changed" archives recently-touched
    // rows and NEVER the historical body of the table. Amazon spells the same
    // idea four ways across the catalog, and none of them is a report grain.
    for (const name of ["systemlastupdateddate", "updated_date", "last_updated_date", "creationdate"]) {
      expect(detectDateColumn(cols(["account_id", "bigint"], [name, "timestamp without time zone"]))).toBeNull();
    }
  });

  it("still accepts created_date — a live grain for four catalog tables, not a mutation stamp", () => {
    // The near-miss in the exclusion above: created_date is when the EVENT
    // happened for the account-status and offer-change event reports, and is
    // their current date column. Excluding it by name-similarity would drop
    // all four to snapshot.
    expect(detectDateColumn(cols(["account_id", "bigint"], ["created_date", "date"]))).toBe("created_date");
  });

  it("accepts a lone tz-aware timestamp under its unabbreviated spelling", () => {
    expect(
      detectDateColumn(cols(["account_id", "bigint"], ["event_time", "timestamp with time zone"]))
    ).toBe("event_time");
  });

  it("prefers a lone DATE column over the TIMESTAMP columns beside it", () => {
    // The regression this exists to prevent: 33 live catalog rows are
    // classified timeseries today ONLY because the old narrow type set could
    // not see their timestamp columns, leaving download_date the lone
    // candidate. Recognising the long timestamp spellings makes those
    // columns visible and would tie the vote, dropping every one of those
    // tables to snapshot — a full un-chunked per-account table read nightly.
    // A DATE is a day grain; a TIMESTAMP is usually an event or mutation
    // instant, so DATE wins its own tier before timestamps are considered.
    expect(
      detectDateColumn(
        cols(
          ["download_date", "date"],
          ["purchase_date", "timestamp with time zone"],
          ["shipment_date", "timestamp with time zone"],
          ["estimated_arrival_date", "timestamp with time zone"]
        )
      )
    ).toBe("download_date");
  });

  it("still refuses to guess when two DATE columns tie in the same tier", () => {
    expect(
      detectDateColumn(cols(["download_date", "date"], ["effective_date", "date"]))
    ).toBeNull();
  });

  it("counts a disqualified mutation stamp toward ambiguity instead of handing the win to its neighbour", () => {
    // This is refdata_label's exact shape, and it is ENABLED with a live
    // BigQuery table partitioned on _archived_at. Dropping mutation stamps
    // OUT of the candidate pool rather than merely disqualifying them was
    // measured to flip it to timeseries/created_date, which would point
    // buildTransactionSql's DML at a column the live table is not partitioned
    // on — silently, since partitioningFor is read only at table creation.
    expect(
      detectDateColumn(
        cols(
          ["created_date", "timestamp without time zone"],
          ["last_updated_date", "timestamp without time zone"]
        )
      )
    ).toBeNull();
  });

  it("still refuses to guess when the long spelling leaves two candidates", () => {
    // The ambiguity guard must survive the widened type set: two plausible
    // time axes means we do not know the grain, and partitioning on the wrong
    // one is worse than treating the table as a snapshot.
    expect(
      detectDateColumn(
        cols(
          ["created_date", "timestamp without time zone"],
          ["last_updated_date", "timestamp without time zone"]
        )
      )
    ).toBeNull();
  });
});

describe("classifyTableKind", () => {
  it("treats a weekly or monthly grain as period", () => {
    expect(classifyTableKind("report_week")).toBe("period");
    expect(classifyTableKind("report_month")).toBe("period");
  });

  it("treats a daily date column as timeseries", () => {
    expect(classifyTableKind("report_date")).toBe("timeseries");
  });

  it("treats the absence of a date column as snapshot", () => {
    expect(classifyTableKind(null)).toBe("snapshot");
  });
});

describe("mapRedshiftTypeToBigQuery", () => {
  it("maps the Spectrum/Hive types the external schema reports", () => {
    expect(mapRedshiftTypeToBigQuery("string")).toEqual({ bqType: "STRING", mapped: true });
    expect(mapRedshiftTypeToBigQuery("bigint")).toEqual({ bqType: "INT64", mapped: true });
    expect(mapRedshiftTypeToBigQuery("double")).toEqual({ bqType: "FLOAT64", mapped: true });
    expect(mapRedshiftTypeToBigQuery("boolean")).toEqual({ bqType: "BOOL", mapped: true });
    expect(mapRedshiftTypeToBigQuery("date")).toEqual({ bqType: "DATE", mapped: true });
    expect(mapRedshiftTypeToBigQuery("timestamp")).toEqual({ bqType: "TIMESTAMP", mapped: true });
  });

  it("strips parameters and is case-insensitive", () => {
    expect(mapRedshiftTypeToBigQuery("VARCHAR(256)")).toEqual({ bqType: "STRING", mapped: true });
    expect(mapRedshiftTypeToBigQuery("decimal(18,2)")).toEqual({ bqType: "NUMERIC", mapped: true });
    expect(mapRedshiftTypeToBigQuery("character varying")).toEqual({ bqType: "STRING", mapped: true });
  });

  it("falls back to STRING and flags it, rather than dropping the column", () => {
    expect(mapRedshiftTypeToBigQuery("super")).toEqual({ bqType: "STRING", mapped: false });
    expect(mapRedshiftTypeToBigQuery("")).toEqual({ bqType: "STRING", mapped: false });
  });
});

describe("assertSafeIdentifier", () => {
  it("accepts ordinary schema and table names", () => {
    expect(assertSafeIdentifier("intentwise_ecommerce_graph")).toBe("intentwise_ecommerce_graph");
    expect(assertSafeIdentifier("sellercentral_fbamanageinventory_report")).toBe("sellercentral_fbamanageinventory_report");
  });

  it("rejects anything that could break out of an identifier position", () => {
    expect(() => assertSafeIdentifier('a"; DROP TABLE x; --')).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("has space")).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("has-dash")).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("")).toThrow(/unsafe identifier/i);
  });
});

describe("columnTypeDrifted", () => {
  it("flags drift when the bqType itself changed", () => {
    expect(
      columnTypeDrifted({ type: "varchar", bqType: "STRING" }, { type: "int4", bqType: "INT64" })
    ).toBe(true);
  });

  it("does not flag a VARCHAR width change — BigQuery emits a bare STRING regardless of length", () => {
    expect(
      columnTypeDrifted(
        { type: "varchar(50)", bqType: "STRING" },
        { type: "varchar(500)", bqType: "STRING" }
      )
    ).toBe(false);
  });

  it("does not flag an integer width change — every width maps to INT64", () => {
    expect(
      columnTypeDrifted({ type: "int4", bqType: "INT64" }, { type: "int8", bqType: "INT64" })
    ).toBe(false);
  });

  it("flags a NUMERIC scale change the shared NUMERIC bucket would otherwise hide", () => {
    expect(
      columnTypeDrifted(
        { type: "numeric(18,2)", bqType: "NUMERIC" },
        { type: "numeric(18,12)", bqType: "NUMERIC" }
      )
    ).toBe(true);
  });

  it("does not flag numeric vs decimal at the same precision — the same type, spelled differently", () => {
    expect(
      columnTypeDrifted(
        { type: "numeric(18,2)", bqType: "NUMERIC" },
        { type: "decimal(18,2)", bqType: "NUMERIC" }
      )
    ).toBe(false);
  });

  it("flags a naive TIMESTAMP becoming timezone-aware", () => {
    expect(
      columnTypeDrifted(
        { type: "timestamp", bqType: "TIMESTAMP" },
        { type: "timestamptz", bqType: "TIMESTAMP" }
      )
    ).toBe(true);
  });

  it("flags the same tz-awareness change via its unabbreviated spelling", () => {
    expect(
      columnTypeDrifted(
        { type: "timestamp without time zone", bqType: "TIMESTAMP" },
        { type: "timestamptz", bqType: "TIMESTAMP" }
      )
    ).toBe(true);
  });

  it("does not flag timestamptz vs 'timestamp with time zone' — the same type, spelled differently", () => {
    expect(
      columnTypeDrifted(
        { type: "timestamptz", bqType: "TIMESTAMP" },
        { type: "timestamp with time zone", bqType: "TIMESTAMP" }
      )
    ).toBe(false);
  });

  it("does not flag 'timestamp' vs 'timestamp without time zone' — the same naive type, spelled differently", () => {
    // The anti-noise direction, and the one canonicalisation behaviour that
    // had no regression guard: the two live catalog views (SVV_COLUMNS vs
    // SVV_EXTERNAL_COLUMNS) report the same naive column under both
    // spellings, so a re-profile must not read as drift and force-disable a
    // healthy table.
    expect(
      columnTypeDrifted(
        { type: "timestamp", bqType: "TIMESTAMP" },
        { type: "timestamp without time zone", bqType: "TIMESTAMP" }
      )
    ).toBe(false);
  });

  it("does not flag identical input", () => {
    const col = { type: "varchar(50)", bqType: "STRING" };
    expect(columnTypeDrifted(col, { ...col })).toBe(false);
  });
});

describe("timestampIsTzAware", () => {
  it("reports both tz-aware spellings as tz-aware", () => {
    expect(timestampIsTzAware("timestamptz")).toBe(true);
    expect(timestampIsTzAware("timestamp with time zone")).toBe(true);
    expect(timestampIsTzAware("TIMESTAMPTZ")).toBe(true);
  });

  it("reports both naive spellings as naive, ignoring precision qualifiers", () => {
    expect(timestampIsTzAware("timestamp")).toBe(false);
    expect(timestampIsTzAware("timestamp without time zone")).toBe(false);
    expect(timestampIsTzAware("Timestamp(6)")).toBe(false);
  });

  it("returns null — never a guessed default — for anything that is not a recognised TIMESTAMP spelling", () => {
    // A wrong default here would be wrong by exactly the host's UTC offset,
    // so the caller must be able to tell "unknown" from "naive".
    expect(timestampIsTzAware("date")).toBeNull();
    expect(timestampIsTzAware("varchar(256)")).toBeNull();
    expect(timestampIsTzAware("")).toBeNull();
    expect(timestampIsTzAware(null)).toBeNull();
  });
});

describe("sourceRefreshWindowDays", () => {
  it("uses the documented per-report windows from spec section 3.3", () => {
    expect(sourceRefreshWindowDays("settlement_report")).toBe(2);
    expect(sourceRefreshWindowDays("sellercentral_businessreport")).toBe(10);
    expect(sourceRefreshWindowDays("sellercentral_allorders_report")).toBe(10);
  });

  it("defaults to the 14-day Sponsored Ads window", () => {
    expect(sourceRefreshWindowDays("keyword_summary")).toBe(14);
    expect(sourceRefreshWindowDays("anything_unrecognised")).toBe(14);
  });
});
