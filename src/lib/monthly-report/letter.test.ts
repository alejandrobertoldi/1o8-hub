import { describe, it, expect } from "vitest";
import type { Report } from "@/components/monthly-report/types";
import {
  GMAIL_HTML_BYTE_LIMIT,
  MONTHLY_REPORT_EMAIL_ASSET_ORIGIN,
  buildMonthlyReportEmail,
  comparisonMonthLabels,
  monthlyReportEmailSubject,
  monthlyReportPortalUrl,
  wholeDollarLabel,
  momDeltaLabel,
  formatIssuedDate,
} from "./letter";

const report: Report = {
  meta: {
    client: "ReadyRESCUE",
    month: "July 2026",
    period: "01 Jul – 31 Jul",
    lead: "Alex Moreno",
    issued: "Aug 26, 2026",
    reportId: "2026|07|1899670",
    clientIdCode: "REA_SC_US",
    clientLogoUrl: "/client-logos/REA_SC_US.png",
  },
  sections: ["execSummary", "kpis", "campaigns"],
  execSummary: {
    lede: "July cooled vs last year, with ad efficiency holding.",
    headlineStats: [
      { label: "Order items", value: "223", foot: "-12.1% YoY" },
      { label: "Units ordered", value: "248", foot: "-15.4% YoY" },
      { label: "Product sales", value: "$10.9K", foot: "-16.3% YoY" },
      { label: "ACoS", value: "18.2%", foot: "-2.1 pts" },
    ],
    movers: [],
  },
  kpis: [
    { label: "Sessions", value: "4,210", prev: "4,580", delta: "370", direction: "down", foot: "Traffic" },
    { label: "Conversion", value: "5.9%", prev: "5.5%", delta: "0.40%", direction: "up", foot: "CVR" },
  ],
  mom: {
    revenueSeries: [],
    narrative: "",
    table: [
      { metric: "Sales", prev: "$12.4K", curr: "$10.9K", delta: "$1.5K", deltaDirection: "down" },
      { metric: "CVR", prev: "5.5%", curr: "5.9%", delta: "0.40%", deltaDirection: "up" },
      { metric: "ACoS", prev: "22.34%", curr: "18.20%", delta: "4.14%", deltaDirection: "up" },
    ],
  },
  campaigns: {
    dateRange: "Jul 1 – Jul 31, 2026",
    stats: [
      { label: "Ad spend", value: "$1,842.36", prev: "$2,100.40", delta: "$258.04", direction: "up" },
      { label: "Ad sales", value: "$10,120.00", prev: "$9,400.00", delta: "$720.00", direction: "up" },
      { label: "ACoS", value: "18.20%", prev: "22.34%", delta: "4.14%", direction: "up" },
    ],
    series: { totalSales: [], adSpend: [], adRevenue: [], acos: [] },
  },
  highlights: [
    { title: "ACoS improved", body: "Spend was tighter against the same sales base.", meta: "Paid" },
  ],
};

describe("formatIssuedDate", () => {
  it("prints the generation calendar day", () => {
    expect(formatIssuedDate("2026-08-04T12:00:00.000Z")).toBe("Aug 04, 2026");
  });
});

describe("momDeltaLabel", () => {
  it("prefixes down with ▼ and up with ▲", () => {
    expect(momDeltaLabel("47", "down")).toBe("▼47");
    expect(momDeltaLabel("$5,875", "down")).toBe("▼$5,875");
    expect(momDeltaLabel("0.03", "up")).toBe("▲0.03");
    expect(momDeltaLabel("—", "flat")).toBe("—");
  });
});

describe("wholeDollarLabel", () => {
  it("rounds advertising currencies to whole dollars", () => {
    expect(wholeDollarLabel("$1,500.00")).toBe("$1,500");
    expect(wholeDollarLabel("$100.60")).toBe("$101");
    expect(wholeDollarLabel("$258.04")).toBe("$258");
  });

  it("leaves rates and compact money unchanged", () => {
    expect(wholeDollarLabel("18.20%")).toBe("18.20%");
    expect(wholeDollarLabel("$1.5K")).toBe("$1.5K");
    expect(wholeDollarLabel("—")).toBe("—");
  });
});

describe("monthlyReportEmailSubject", () => {
  it("names the client and period", () => {
    expect(monthlyReportEmailSubject({ client: "BNutty", month: "July 2026" }))
      .toBe("BNutty — July 2026 performance");
  });

  it("falls back when the month is missing", () => {
    expect(monthlyReportEmailSubject({ client: "BNutty" })).toBe("BNutty monthly report");
  });
});

describe("comparisonMonthLabels", () => {
  it("labels the current and previous calendar months", () => {
    expect(comparisonMonthLabels("2026-07", "July 2026")).toEqual({
      current: "Jul 2026",
      previous: "Jun 2026",
    });
  });
});

describe("monthlyReportPortalUrl", () => {
  it("points at the public portal HTML page, never Drive or localhost", () => {
    expect(monthlyReportPortalUrl({ clientIdCode: "REA_SC_US", period: "2026-07" }))
      .toBe(`${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/portal/reports/monthly?period=2026-07&client=REA_SC_US`);
  });

  it("keeps period when the client code is missing", () => {
    expect(monthlyReportPortalUrl({ period: "2026-07" }))
      .toBe(`${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/portal/reports/monthly?period=2026-07`);
  });
});

describe("buildMonthlyReportEmail", () => {
  const letter = buildMonthlyReportEmail({
    report,
    period: "2026-07",
  });

  it("keeps the HTML under Gmail's clip limit", () => {
    expect(Buffer.byteLength(letter.html, "utf8")).toBeLessThan(GMAIL_HTML_BYTE_LIMIT);
  });

  it("is a table letter, not the print archive", () => {
    expect(letter.html).toContain("max-width:600px");
    expect(letter.html).toContain("<table");
    expect(letter.html).not.toContain("report-doc");
    expect(letter.html).not.toContain("<svg");
    expect(letter.html).not.toMatch(/<_next\/static/i);
  });

  it("hosts images on the public hub origin, never localhost", () => {
    expect(MONTHLY_REPORT_EMAIL_ASSET_ORIGIN).toBe("https://www.marketfoundryhub.com");
    expect(letter.html).toContain(`${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/1o8_Mark_Ink.png`);
    expect(letter.html).not.toContain("MF_Logo_Orange.png");
    expect(letter.html).toContain(`${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/client-logos/REA_SC_US.png`);
    expect(letter.html).not.toContain("localhost");
    expect(letter.html).not.toContain("http://127.");
    expect(letter.html).not.toMatch(/src="\/client-logos/);
    expect(letter.html).toContain('width="56"');
    expect(letter.html).toContain('height="56"');
    expect(letter.html).toContain("width:56px");
    expect(letter.html).toContain("height:56px");
  });

  it("rewrites a relative client logo path so Gmail can fetch it", () => {
    const gaffer = buildMonthlyReportEmail({
      report: {
        ...report,
        meta: {
          ...report.meta,
          client: "Gaffer",
          clientIdCode: "GAF_SC_US",
          clientLogoUrl: "/client-logos/GAF_SC_US.png",
        },
      },
      period: "2026-07",
    });
    expect(gaffer.html).toContain(`${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/client-logos/GAF_SC_US.png`);
    expect(gaffer.html).not.toMatch(/src="\/client-logos\/GAF_SC_US\.png"/);
    expect(gaffer.html).not.toMatch(/width="72"/);
    expect(gaffer.html).toContain('height="40"');
    expect(gaffer.html).toContain("width:auto");
  });

  it("includes headline numbers, the month opener, and a portal details CTA", () => {
    expect(letter.html).toContain("Your July 2026 Amazon performance snapshot is ready");
    expect(letter.html).not.toMatch(/\bHi[, ]/);
    expect(letter.html).toContain("$10.9K");
    expect(letter.html).toContain("July cooled vs last year");
    expect(letter.html).toContain("/portal/reports/monthly?period=2026-07");
    expect(letter.html).toContain("client=REA_SC_US");
    expect(letter.html).toContain("Click for more details");
    expect(letter.html).toContain("Jul 2026");
    expect(letter.html).toContain("Jun 2026");
    expect(letter.html).toContain("4,580");
    expect(letter.html).toContain("$2,100");
    expect(letter.html).toContain("$1,842");
    expect(letter.html).not.toContain("$1,842.36");
    expect(letter.html).toContain("0.40%");
    expect(letter.html).toContain("4.14%");
    expect(letter.html).toContain("18.20%");
    expect(letter.html).not.toContain("Trends");
    expect(letter.html).not.toContain("$1.5K");
    expect(letter.html).toContain("▼370");
    expect(letter.html).toContain("▲0.40%");
    expect(letter.html).toContain("▲$258");
    expect(letter.html).toContain("Issued Aug 26, 2026");
    expect(letter.html).not.toContain("Open PDF");
    expect(letter.html).not.toContain("Download HTML");
    expect(letter.html).not.toContain("drive.google.com");
    expect(letter.subject).toBe("ReadyRESCUE — July 2026 performance");
  });

  it("issues on the generation day, not a later regen stamp in JSON", () => {
    const dated = buildMonthlyReportEmail({
      report: { ...report, meta: { ...report.meta, issued: "Sep 08, 2026" } },
      period: "2026-07",
      issuedAt: "2026-08-04T12:00:00.000Z",
    });
    expect(dated.html).toContain("Issued Aug 04, 2026");
    expect(dated.html).not.toContain("Issued Sep 08, 2026");
  });

  it("escapes client-supplied HTML", () => {
    const poisoned = buildMonthlyReportEmail({
      report: {
        ...report,
        meta: { ...report.meta, client: `<img src=x onerror=alert(1)>`, month: `<b>July</b>` },
        execSummary: { lede: `<script>alert(1)</script>`, headlineStats: [], movers: [] },
      },
      period: "2026-07",
    });
    expect(poisoned.html).not.toContain("<script>");
    expect(poisoned.html).not.toContain("<img src=x");
    expect(poisoned.html).toContain("&lt;script&gt;");
    expect(poisoned.html).toContain("Your &lt;b&gt;July&lt;/b&gt; Amazon performance snapshot is ready");
  });

  it("ships a plain-text alternative", () => {
    const portal = monthlyReportPortalUrl({ clientIdCode: "REA_SC_US", period: "2026-07" });
    expect(letter.text).toContain("Your July 2026 Amazon performance snapshot is ready");
    expect(letter.text).not.toMatch(/\bHi[, ]/);
    expect(letter.text).toContain("ReadyRESCUE");
    expect(letter.text).toContain(`Click for more details: ${portal}`);
    expect(letter.text).not.toContain("drive.google.com");
    expect(letter.text).not.toContain("<table");
  });

  it("embeds a thread id so Gmail does not collapse a repeat send", () => {
    const threaded = buildMonthlyReportEmail({
      report,
      period: "2026-07",
      threadId: "send-abc-123",
    });
    expect(threaded.html).toContain("send-abc-123");
    expect(threaded.html).toContain("display:none");
  });

  it("includes client notes after the matching letter blocks", () => {
    const noted = buildMonthlyReportEmail({
      report: {
        ...report,
        sectionComments: {
          kpis: {
            text: "Sessions dipped on Prime Day.",
            authorName: "Sara Khan",
            role: "pm",
            updatedAt: "2026-09-01T10:00:00.000Z",
          },
        },
      },
      period: "2026-07",
    });
    expect(noted.html).toContain("Sessions dipped on Prime Day.");
    expect(noted.html).toContain("Sara Khan");
    expect(noted.text).toContain("Note: Sessions dipped on Prime Day.");
  });
});
