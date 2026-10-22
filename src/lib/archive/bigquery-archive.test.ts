import { describe, it, expect, afterAll } from "vitest";
import { BigQueryDate } from "@google-cloud/bigquery";
import {
  archiveTableId,
  findColumnBqType,
  buildTableSchema,
  partitioningFor,
  buildTransactionSql,
  buildSourceSelectSql,
  assertWindowPresent,
  buildWriteQueryParams,
  toBqJsonValue,
  ndjsonLines,
  type ArchiveColumn,
} from "@/lib/archive/bigquery-archive";

describe("ndjsonLines", () => {
  it("yields one JSON object per line, newline-terminated", () => {
    expect([...ndjsonLines([{ a: 1 }, { a: 2 }])]).toEqual(['{"a":1}\n', '{"a":2}\n']);
  });

  it("yields nothing for an empty batch", () => {
    // loadWorkUnit already skips the staging load when there are no rows, so
    // this only has to not emit a stray newline if that guard ever moves.
    expect([...ndjsonLines([])]).toEqual([]);
  });

  it("terminates the LAST line too, unlike the join it replaces", () => {
    // The previous build was `.join("\n")`, which left the final row
    // unterminated. A trailing newline is valid NEWLINE_DELIMITED_JSON and was
    // verified live against BigQuery: a 231,328-row load landed exactly
    // 231,328 rows. Asserted here so nobody "tidies" it back to a join.
    const out = [...ndjsonLines([{ a: 1 }])];
    expect(out).toHaveLength(1);
    expect(out[0].endsWith("\n")).toBe(true);
  });

  it("is lazy — it does not materialise the batch before the first line", () => {
    // The whole point: the old code built a 231k-element string array AND a
    // 126 MB joined string before the upload started, ~259 MB of pure
    // overhead. A generator hands BigQuery one line at a time (measured:
    // +14 MB, and 27% faster because the upload overlaps serialisation).
    let serialised = 0;
    const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const gen = ndjsonLines(
      rows.map((r) => new Proxy(r, { ownKeys: (t) => { serialised++; return Reflect.ownKeys(t); } }))
    );
    expect(serialised).toBe(0);
    gen.next();
    expect(serialised).toBe(1);
  });

  it("preserves an explicit null rather than dropping the key", () => {
    // BigQuery needs the column present to write NULL into it; a dropped key
    // is not the same thing on a WRITE_TRUNCATE load.
    expect([...ndjsonLines([{ a: null, b: 1 }])]).toEqual(['{"a":null,"b":1}\n']);
  });
});

describe("archiveTableId", () => {
  it("joins schema and table with a double underscore", () => {
    expect(archiveTableId("intentwise_ecommerce_graph", "account_summary")).toBe(
      "intentwise_ecommerce_graph__account_summary"
    );
  });
});

describe("findColumnBqType", () => {
  const columns: ArchiveColumn[] = [
    { name: "account_id", bqType: "INT64" },
    { name: "report_date", bqType: "DATE" },
  ];

  it("finds a column's BigQuery type case-insensitively", () => {
    expect(findColumnBqType(columns, "REPORT_DATE")).toBe("DATE");
  });

  it("returns null when the column is not present", () => {
    expect(findColumnBqType(columns, "sku")).toBeNull();
  });
});

describe("buildTableSchema", () => {
  it("always appends _archived_at as TIMESTAMP", () => {
    const columns: ArchiveColumn[] = [{ name: "account_id", bqType: "INT64" }];
    expect(buildTableSchema(columns)).toEqual([
      { name: "account_id", type: "INT64" },
      { name: "_archived_at", type: "TIMESTAMP" },
    ]);
  });
});

describe("partitioningFor", () => {
  it("partitions timeseries/period tables on their own date column", () => {
    expect(partitioningFor("timeseries", "report_date")).toEqual({ field: "report_date", type: "DAY" });
    expect(partitioningFor("period", "report_month")).toEqual({ field: "report_month", type: "DAY" });
  });

  it("partitions snapshot tables on _archived_at instead (spec section 6)", () => {
    expect(partitioningFor("snapshot", null)).toEqual({ field: "_archived_at", type: "DAY" });
  });

  it("throws if a non-snapshot table has no date column — a real data problem, not a default to paper over", () => {
    expect(() => partitioningFor("timeseries", null)).toThrow(/no date column/i);
  });
});

describe("buildTransactionSql", () => {
  const base = { targetTable: "proj.ds.t", stagingTable: "proj.ds._stg_t" };
  const columnNames = ["account_id", "report_date", "_archived_at"];

  it("builds a delete-then-insert transaction for a DATE date column", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "timeseries",
      dateColumnBqName: "report_date",
      dateColumnBqType: "DATE",
      columnNames,
    });
    expect(sql).toContain("DELETE FROM `proj.ds.t`");
    expect(sql).toContain("CAST(account_id AS STRING) = @accountId");
    expect(sql).toContain("`report_date` BETWEEN @windowFrom AND @windowTo");
    expect(sql).toContain(
      "INSERT INTO `proj.ds.t` (`account_id`, `report_date`, `_archived_at`) SELECT `account_id`, `report_date`, `_archived_at` FROM `proj.ds._stg_t`"
    );
    expect(sql.indexOf("DELETE")).toBeLessThan(sql.indexOf("INSERT"));
  });

  it("wraps a TIMESTAMP date column in DATE() for the range comparison", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "period",
      dateColumnBqName: "snapshot_ts",
      dateColumnBqType: "TIMESTAMP",
      columnNames: ["account_id", "snapshot_ts", "_archived_at"],
    });
    expect(sql).toContain("DATE(`snapshot_ts`) BETWEEN @windowFrom AND @windowTo");
  });

  // MODIFIED (fix wave 1, I1). This test previously asserted the snapshot SQL
  // contained NO DELETE at all — an assertion that encoded the bug: any death
  // between the BigQuery COMMIT and the Postgres status='done' update replayed
  // the whole snapshot for that account on the same day (the reclaim path
  // added in F3 makes that replay automatic). The snapshot branch is now
  // symmetric with the timeseries branch: a same-day DELETE scoped to this
  // account, then the INSERT, in one transaction. Per-DAY snapshot history is
  // still preserved — only a same-day retry became idempotent.
  it("builds a same-day delete-then-insert transaction for snapshot tables, so a retry cannot duplicate the snapshot", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "snapshot",
      dateColumnBqName: null,
      dateColumnBqType: null,
      columnNames: ["account_id", "sku", "_archived_at"],
    });
    expect(sql).toContain("DELETE FROM `proj.ds.t`");
    expect(sql).toContain("CAST(account_id AS STRING) = @accountId");
    expect(sql).toContain("DATE(`_archived_at`) = @archivedDate");
    expect(sql).toContain(
      "INSERT INTO `proj.ds.t` (`account_id`, `sku`, `_archived_at`) SELECT `account_id`, `sku`, `_archived_at` FROM `proj.ds._stg_t`"
    );
    expect(sql.indexOf("DELETE")).toBeLessThan(sql.indexOf("INSERT"));
    // Scoped to one day, never the whole account's snapshot history.
    expect(sql).not.toContain("BETWEEN");
  });

  it("emits a DELETE-only transaction for a zero-row timeseries unit, never referencing staging", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "timeseries",
      dateColumnBqName: "report_date",
      dateColumnBqType: "DATE",
      columnNames,
      includeInsert: false,
    });
    expect(sql).toContain("DELETE FROM `proj.ds.t`");
    expect(sql).toContain("`report_date` BETWEEN @windowFrom AND @windowTo");
    expect(sql).not.toContain("INSERT");
    expect(sql).not.toContain("_stg_t");
  });

  it("emits a DELETE-only transaction for a zero-row snapshot unit", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "snapshot",
      dateColumnBqName: null,
      dateColumnBqType: null,
      columnNames: ["account_id", "sku", "_archived_at"],
      includeInsert: false,
    });
    expect(sql).toContain("DATE(`_archived_at`) = @archivedDate");
    expect(sql).not.toContain("INSERT");
    expect(sql).not.toContain("_stg_t");
  });

  it("names the INSERT columns explicitly rather than using SELECT *, so a dropped source column can never break the transaction positionally", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "timeseries",
      dateColumnBqName: "report_date",
      dateColumnBqType: "DATE",
      columnNames,
    });
    expect(sql).not.toContain("SELECT *");
    expect(sql).toContain("INSERT INTO `proj.ds.t` (`account_id`, `report_date`, `_archived_at`)");
  });

  it("throws for a non-snapshot table missing its date column info", () => {
    expect(() =>
      buildTransactionSql({
        ...base,
        tableKind: "timeseries",
        dateColumnBqName: null,
        dateColumnBqType: null,
        columnNames,
      })
    ).toThrow(/date column/i);
  });

  // Found live in Task 7's first real drain: a bare BEGIN/COMMIT is NOT
  // BigQuery transaction syntax. BigQuery parses bare BEGIN as opening a block
  // statement (needs a matching END;), so the script dies with "Unexpected
  // end of script" right after COMMIT; — every prior test here only checked
  // for DELETE/INSERT fragments, so this was unconditionally broken (every
  // table, every account) without a single test failing.
  it("uses BEGIN TRANSACTION / COMMIT TRANSACTION, not a bare BEGIN/COMMIT block statement", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "timeseries",
      dateColumnBqName: "report_date",
      dateColumnBqType: "DATE",
      columnNames,
    });
    expect(sql).toMatch(/^BEGIN TRANSACTION;/);
    expect(sql).toContain("COMMIT TRANSACTION;");
    expect(sql).not.toMatch(/^BEGIN\n/);
    expect(sql).not.toContain("\nCOMMIT;");
  });

  it("uses BEGIN TRANSACTION / COMMIT TRANSACTION on the DELETE-only branch too", () => {
    const sql = buildTransactionSql({
      ...base,
      tableKind: "timeseries",
      dateColumnBqName: "report_date",
      dateColumnBqType: "DATE",
      columnNames,
      includeInsert: false,
    });
    expect(sql).toMatch(/^BEGIN TRANSACTION;/);
    expect(sql).toContain("COMMIT TRANSACTION;");
  });
});

describe("assertWindowPresent", () => {
  it("allows a snapshot table with no window at all", () => {
    expect(() => assertWindowPresent("snapshot", null, null)).not.toThrow();
  });

  it("allows a non-snapshot table when both window bounds are present", () => {
    expect(() => assertWindowPresent("timeseries", "2026-01-01", "2026-01-14")).not.toThrow();
  });

  it("throws when a non-snapshot table has both window bounds null", () => {
    expect(() => assertWindowPresent("timeseries", null, null)).toThrow(/windowFrom and windowTo/i);
  });

  it("throws when a non-snapshot table is missing only one window bound", () => {
    expect(() => assertWindowPresent("period", "2026-01-01", null)).toThrow(/windowFrom and windowTo/i);
  });
});

describe("buildWriteQueryParams", () => {
  const snapshotInput = {
    tableKind: "snapshot" as const,
    accountId: "272970",
    archivedDate: "2026-08-05",
    windowFrom: null,
    windowTo: null,
  };
  const timeseriesInput = {
    tableKind: "timeseries" as const,
    accountId: "2604690",
    archivedDate: "2026-08-05",
    windowFrom: "2026-07-23",
    windowTo: "2026-08-05",
  };

  it("binds a snapshot's archivedDate as a real DATE, not a plain string — an unwrapped string serialises to NULL and the DELETE matches nothing", () => {
    const { params, types } = buildWriteQueryParams(snapshotInput);
    expect(params.archivedDate).toBeInstanceOf(BigQueryDate);
    expect(typeof params.archivedDate).not.toBe("string");
    expect((params.archivedDate as BigQueryDate).value).toBe("2026-08-05");
    expect(params.accountId).toBe("272970");
    expect(types).toEqual({ accountId: "STRING", archivedDate: "DATE" });
    expect(params).not.toHaveProperty("windowFrom");
    expect(params).not.toHaveProperty("windowTo");
  });

  it("binds both of a non-snapshot's window bounds as real DATEs, not plain strings", () => {
    const { params, types } = buildWriteQueryParams(timeseriesInput);
    expect(params.windowFrom).toBeInstanceOf(BigQueryDate);
    expect(params.windowTo).toBeInstanceOf(BigQueryDate);
    expect(typeof params.windowFrom).not.toBe("string");
    expect(typeof params.windowTo).not.toBe("string");
    expect((params.windowFrom as BigQueryDate).value).toBe("2026-07-23");
    expect((params.windowTo as BigQueryDate).value).toBe("2026-08-05");
    expect(params.accountId).toBe("2604690");
    expect(types).toEqual({ accountId: "STRING", windowFrom: "DATE", windowTo: "DATE" });
    expect(params).not.toHaveProperty("archivedDate");
  });

  it("binds a period table's window the same way as a timeseries table's", () => {
    const { params, types } = buildWriteQueryParams({ ...timeseriesInput, tableKind: "period" });
    expect(params.windowFrom).toBeInstanceOf(BigQueryDate);
    expect(params.windowTo).toBeInstanceOf(BigQueryDate);
    expect(types).toEqual({ accountId: "STRING", windowFrom: "DATE", windowTo: "DATE" });
  });

  it("never leaves a param declared DATE in the types map bound as anything but a BigQueryDate — the invariant a fourth DATE param must also satisfy", () => {
    for (const input of [snapshotInput, timeseriesInput]) {
      const { params, types } = buildWriteQueryParams(input);
      const dateKeys = Object.keys(types).filter((k) => types[k] === "DATE");
      expect(dateKeys.length).toBeGreaterThan(0);
      for (const key of dateKeys) {
        expect(params[key]).toBeInstanceOf(BigQueryDate);
      }
      // And every declared param is actually bound — no key typed but unbound.
      expect(Object.keys(params).sort()).toEqual(Object.keys(types).sort());
    }
  });

  it("throws when a non-snapshot table has both window bounds null, rather than binding BigQueryDate{value: undefined}", () => {
    expect(() => buildWriteQueryParams({ ...timeseriesInput, windowFrom: null, windowTo: null })).toThrow(
      /requires both windowFrom and windowTo/i
    );
  });

  it("throws when a non-snapshot table is missing only one window bound", () => {
    expect(() => buildWriteQueryParams({ ...timeseriesInput, windowFrom: null })).toThrow(
      /requires both windowFrom and windowTo/i
    );
    expect(() => buildWriteQueryParams({ ...timeseriesInput, windowTo: null })).toThrow(
      /requires both windowFrom and windowTo/i
    );
  });

  it("ignores the window bounds entirely for a snapshot table, which has no window", () => {
    const { params, types } = buildWriteQueryParams({
      ...snapshotInput,
      windowFrom: "2026-07-23",
      windowTo: "2026-08-05",
    });
    expect(Object.keys(params).sort()).toEqual(["accountId", "archivedDate"]);
    expect(types).toEqual({ accountId: "STRING", archivedDate: "DATE" });
  });
});

describe("buildSourceSelectSql", () => {
  const base = { schema: "intentwise_ecommerce_graph", table: "account_summary" };

  it("names the catalog's columns explicitly rather than using SELECT *, so a source column added since the last discovery run cannot fail the load", () => {
    const sql = buildSourceSelectSql({
      ...base,
      tableKind: "timeseries",
      dateColumn: "report_date",
      dateColumnIsTimestamp: false,
      columnNames: ["account_id", "report_date", "spend"],
    });
    expect(sql).not.toContain("SELECT *");
    expect(sql).toBe(
      "SELECT account_id, report_date, spend FROM intentwise_ecommerce_graph.account_summary " +
        "WHERE account_id = $1 AND report_date BETWEEN $2 AND $3"
    );
  });

  it("never names _archived_at — a BigQuery-only column that does not exist in Redshift", () => {
    const sql = buildSourceSelectSql({
      ...base,
      tableKind: "snapshot",
      dateColumn: null,
      dateColumnIsTimestamp: false,
      columnNames: ["account_id", "sku"],
    });
    expect(sql).not.toContain("_archived_at");
    expect(sql).toBe(
      "SELECT account_id, sku FROM intentwise_ecommerce_graph.account_summary WHERE account_id = $1"
    );
  });

  it("throws for a non-snapshot table with no date column rather than reading the whole table", () => {
    expect(() =>
      buildSourceSelectSql({ ...base, tableKind: "timeseries", dateColumn: null, dateColumnIsTimestamp: false, columnNames: ["account_id"] })
    ).toThrow(/date column/i);
  });

  it("throws when the catalog knows no columns for the table, rather than emitting malformed SQL at a Redshift we are a guest on", () => {
    expect(() =>
      buildSourceSelectSql({ ...base, tableKind: "snapshot", dateColumn: null, columnNames: [], dateColumnIsTimestamp: false })
    ).toThrow(/no columns/i);
  });

  it("wraps a TIMESTAMP date column in DATE() so the read matches the BigQuery DELETE's calendar-day window", () => {
    const sql = buildSourceSelectSql({
      schema: "intentwise_ecommerce_graph",
      table: "account_summary",
      tableKind: "timeseries",
      dateColumn: "report_date",
      dateColumnIsTimestamp: true,
      columnNames: ["account_id", "report_date", "spend"],
    });
    expect(sql).toBe(
      "SELECT account_id, report_date, spend FROM intentwise_ecommerce_graph.account_summary " +
        "WHERE account_id = $1 AND DATE(report_date) BETWEEN $2 AND $3"
    );
  });

  it("does NOT wrap a DATE date column in DATE() — it's already symmetric with the BigQuery side", () => {
    const sql = buildSourceSelectSql({
      schema: "intentwise_ecommerce_graph",
      table: "account_summary",
      tableKind: "timeseries",
      dateColumn: "report_date",
      dateColumnIsTimestamp: false,
      columnNames: ["account_id", "report_date", "spend"],
    });
    expect(sql).toBe(
      "SELECT account_id, report_date, spend FROM intentwise_ecommerce_graph.account_summary " +
        "WHERE account_id = $1 AND report_date BETWEEN $2 AND $3"
    );
  });
});

describe("toBqJsonValue", () => {
  // Every Date below is built from LOCAL components and asserted against those
  // same local digits, so these assertions hold on any host without pinning a
  // timezone. The two TZ-pinned tests further down prove the fix is actually
  // doing work rather than agreeing with toISOString by coincidence.

  it("formats a DATE from local components — the same rule as toDateOnlyString in scripts/profile-redshift-catalog.ts", () => {
    // pg hands back DATE columns as a Date at LOCAL midnight.
    expect(toBqJsonValue(new Date(2026, 7, 3, 0, 0, 0, 0), "DATE", "date")).toBe("2026-08-03");
  });

  it("preserves a naive timestamp's source digits and labels them UTC", () => {
    // Locked semantic: '2026-08-03 12:34:56.789' at source lands as those
    // exact digits in BigQuery, regardless of where the job ran.
    expect(toBqJsonValue(new Date(2026, 7, 3, 12, 34, 56, 789), "TIMESTAMP", "timestamp")).toBe(
      "2026-08-03 12:34:56.789"
    );
    expect(
      toBqJsonValue(new Date(2026, 7, 3, 1, 2, 3, 4), "TIMESTAMP", "timestamp without time zone")
    ).toBe("2026-08-03 01:02:03.004");
  });

  it("passes a tz-aware timestamp through toISOString untouched — it is already a correct absolute instant", () => {
    const instant = new Date("2026-08-03T12:34:56.000Z");
    expect(toBqJsonValue(instant, "TIMESTAMP", "timestamptz")).toBe("2026-08-03T12:34:56.000Z");
    expect(toBqJsonValue(instant, "TIMESTAMP", "timestamp with time zone")).toBe(
      "2026-08-03T12:34:56.000Z"
    );
  });

  it("throws for a Date on a TIMESTAMP column whose raw type is unrecognised, rather than guessing a default", () => {
    // Both possible defaults are wrong by exactly the host's UTC offset for
    // the other case, so a silent choice would reintroduce the bug.
    expect(() => toBqJsonValue(new Date(), "TIMESTAMP", null)).toThrow(/timestamp/i);
    expect(() => toBqJsonValue(new Date(), "TIMESTAMP", "super")).toThrow(/"super"/);
  });

  it("passes every non-Date value through untouched, so numeric/int8 strings, nulls and JSON keep their exact source form", () => {
    expect(toBqJsonValue(null, "TIMESTAMP", "timestamp")).toBeNull();
    expect(toBqJsonValue(undefined, "DATE", "date")).toBeUndefined();
    expect(toBqJsonValue("12.34", "NUMERIC", "numeric(18,2)")).toBe("12.34");
    expect(toBqJsonValue("9007199254740993", "INT64", "int8")).toBe("9007199254740993");
    expect(toBqJsonValue(0, "INT64", "int4")).toBe(0);
    expect(toBqJsonValue(false, "BOOL", "bool")).toBe(false);
    // A pre-formatted date string must not be re-parsed or re-formatted.
    expect(toBqJsonValue("2026-08-03", "DATE", "date")).toBe("2026-08-03");
  });

  it("formats a DATETIME from local components with no zone suffix", () => {
    expect(toBqJsonValue(new Date(2026, 7, 3, 12, 34, 56, 789), "DATETIME", "timestamp")).toBe(
      "2026-08-03 12:34:56.789"
    );
  });

  it("falls back to toISOString for a Date on any other bqType", () => {
    const instant = new Date("2026-08-03T12:34:56.000Z");
    expect(toBqJsonValue(instant, "STRING", "varchar")).toBe("2026-08-03T12:34:56.000Z");
    expect(toBqJsonValue(instant, null, null)).toBe("2026-08-03T12:34:56.000Z");
  });
});

describe("toBqJsonValue under a pinned process timezone", () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("does not ship a DATE a calendar day early on a UTC+ host", () => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    const localMidnight = new Date(2026, 7, 3, 0, 0, 0, 0);
    // Proof the fix is load-bearing: the old JSON.stringify path would have
    // shipped the PREVIOUS calendar day here.
    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-08-02");
    expect(toBqJsonValue(localMidnight, "DATE", "date")).toBe("2026-08-03");
  });

  it("preserves naive timestamp digits on hosts either side of UTC", () => {
    for (const [tz, shiftedIso] of [
      ["Pacific/Kiritimati", "2026-08-03T09:45:01.007Z"], // UTC+14
      ["Pacific/Pago_Pago", "2026-08-04T10:45:01.007Z"], // UTC-11
    ] as const) {
      process.env.TZ = tz;
      const naive = new Date(2026, 7, 3, 23, 45, 1, 7);
      expect(naive.toISOString()).toBe(shiftedIso); // what the bug shipped
      expect(toBqJsonValue(naive, "TIMESTAMP", "timestamp")).toBe("2026-08-03 23:45:01.007");
    }
  });
});
