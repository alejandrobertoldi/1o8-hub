import { describe, it, expect } from "vitest";
import {
  buildPrintUrl,
  buildReportPdfFilename,
  parseHubPrintParams,
  parsePortalPrintParams,
} from "./print-url";

describe("buildPrintUrl", () => {
  it("builds a hub range URL with account, client, and dates", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "overview",
        accountId: "154290",
        clientName: "Acme Co",
        start: "2026-07-27",
        end: "2026-08-02",
        autoprint: true,
      }),
    ).toBe(
      "/reports/overview/print?accountId=154290&client=Acme+Co&start=2026-07-27&end=2026-08-02&autoprint=1",
    );
  });

  it("omits dates for a snapshot section", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "inventory",
        accountId: "154290",
        start: "2026-07-27",
        end: "2026-08-02",
      }),
    ).toBe("/reports/inventory/print?accountId=154290");
  });

  it("sends a year instead of dates for subscribe-save", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "subscribe-save",
        accountId: "154290",
        year: 2026,
      }),
    ).toBe("/reports/subscribe-save/print?accountId=154290&year=2026");
  });

  /* The security requirement, pinned: a portal print URL must never be able to
     name a client or an Intentwise account. Identity is resolved from the
     session inside PortalPrintPage. */
  it("never puts accountId or client in a portal URL, even when passed", () => {
    const url = buildPrintUrl({
      surface: "portal",
      sectionId: "overview",
      accountId: "154290",
      clientName: "Acme Co",
      start: "2026-07-27",
      end: "2026-08-02",
      autoprint: true,
    });
    expect(url).toBe(
      "/portal/reports/overview/print?start=2026-07-27&end=2026-08-02&autoprint=1",
    );
    expect(url).not.toContain("154290");
    expect(url).not.toContain("Acme");
  });

  it("leaves autoprint off unless asked", () => {
    expect(
      buildPrintUrl({ surface: "portal", sectionId: "inventory" }),
    ).toBe("/portal/reports/inventory/print");
  });
});

describe("parseHubPrintParams", () => {
  it("reads every hub param", () => {
    expect(
      parseHubPrintParams({
        accountId: "154290",
        client: "Acme Co",
        start: "2026-07-27",
        end: "2026-08-02",
        year: "2026",
        autoprint: "1",
      }),
    ).toEqual({
      accountId: "154290",
      clientName: "Acme Co",
      start: "2026-07-27",
      end: "2026-08-02",
      year: 2026,
      autoprint: true,
    });
  });

  it("defaults everything absent to empty, not undefined", () => {
    expect(parseHubPrintParams({})).toEqual({
      accountId: "",
      clientName: "",
      start: "",
      end: "",
      year: null,
      autoprint: false,
    });
  });

  /* The spec's error table asks for missing OR INVALID params to be refused.
     Normalising a bad date to "" routes it into the existing missing-params gate
     instead of forwarding junk to the report APIs. */
  it("normalises an unparseable date to empty so the params gate catches it", () => {
    expect(parseHubPrintParams({ start: "garbage" }).start).toBe("");
    expect(parseHubPrintParams({ start: "2026-8-2" }).start).toBe("");
    expect(parseHubPrintParams({ start: "27-07-2026" }).start).toBe("");
    expect(parseHubPrintParams({ end: "2026-13-01" }).end).toBe("");
    expect(parseHubPrintParams({ end: "2026-02-30" }).end).toBe("");
    expect(parseHubPrintParams({ start: "2026-07-27" }).start).toBe("2026-07-27");
    // Leap-year handling both ways: 2026 has no Feb 29, 2028 does.
    expect(parseHubPrintParams({ end: "2026-02-29" }).end).toBe("");
    expect(parseHubPrintParams({ end: "2028-02-29" }).end).toBe("2028-02-29");
  });

  it("takes the first value of a repeated param", () => {
    expect(parseHubPrintParams({ accountId: ["154290", "999"] }).accountId).toBe("154290");
  });

  it("rejects a non-numeric year", () => {
    expect(parseHubPrintParams({ year: "not-a-year" }).year).toBeNull();
  });

  /* Four digits is not the same as a plausible year. "0000" parses to 0, which
     is FALSY: it passes a `year !== null` gate, then renders an empty range
     label and a "0-01-01" date. "0999" gives "999-01-01" and breaks the
     YYYY-MM-DD contract. */
  it("rejects a four-digit string that is not a plausible reporting year", () => {
    expect(parseHubPrintParams({ year: "0000" }).year).toBeNull();
    expect(parseHubPrintParams({ year: "0999" }).year).toBeNull();
    expect(parseHubPrintParams({ year: "1999" }).year).toBeNull();
    expect(parseHubPrintParams({ year: "9999" }).year).toBeNull();
    expect(parseHubPrintParams({ year: "2026" }).year).toBe(2026);
  });
});

describe("parsePortalPrintParams", () => {
  /* The same requirement from the reading side: even a hand-edited URL carrying
     accountId and client yields neither. */
  it("drops accountId and client entirely", () => {
    const parsed = parsePortalPrintParams({
      accountId: "999999",
      client: "SomeOtherClient",
      start: "2026-07-27",
      end: "2026-08-02",
    });
    expect(parsed).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
      year: null,
      autoprint: false,
    });
    expect(Object.keys(parsed)).not.toContain("accountId");
    expect(Object.keys(parsed)).not.toContain("clientName");
  });

  it("rejects a malformed date the same way the hub parser does", () => {
    expect(parsePortalPrintParams({ start: "garbage", end: "2026-08-02" }).start).toBe("");
    expect(parsePortalPrintParams({ start: "2026-08-02", end: "2026-02-30" }).end).toBe("");
  });

  it("applies the same year bound as the hub parser", () => {
    expect(parsePortalPrintParams({ year: "0000" }).year).toBeNull();
    expect(parsePortalPrintParams({ year: "0999" }).year).toBeNull();
    expect(parsePortalPrintParams({ year: "2026" }).year).toBe(2026);
  });
});

describe("buildReportPdfFilename", () => {
  it("builds a filesystem-safe name from client, section, and range", () => {
    expect(
      buildReportPdfFilename({
        clientName: "Dr. Cuddles",
        sectionLabel: "Performance Overview",
        start: "2026-07-27",
        end: "2026-08-02",
      }),
    ).toBe("Dr.-Cuddles_Performance-Overview_2026-07-27_2026-08-02");
  });

  it("falls back when fields are missing", () => {
    expect(buildReportPdfFilename({})).toBe("report");
  });
});
