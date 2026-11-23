import { describe, expect, it } from "vitest";
import { buildClientReport, type MonthData } from "./build";
import { reportRules } from "./style-guide";
import { DEFAULT_STYLE_GUIDE } from "./default-style-guide";
import { bulletsToHtml, figuresIn, htmlToPlain, paragraphsToHtml, sanitizeReportHtml, textSectionsFor, unsupportedFigures } from "./text";
import { dataForPrompt, outputSchema, userPrompt } from "./prompt";

const full = (totals: Record<string, number>, days = 31): MonthData => ({
  totals,
  coverage: Object.fromEntries([...new Set(Object.keys(totals).map((k) => k.split(":")[0]))].map((s) => [s, days])),
});
const data = buildClientReport({
  client: { code: "KSS", name: "K9 Sport Sack", logo: null, raw: {} },
  period: "2026-10",
  months: {
    "2026-10": full({ "shopify:net_sales": 99271, "shopify:orders": 800, "meta:spend": 13456, "meta:purchase_value": 21405 }),
    "2026-09": full({ "shopify:net_sales": 115931, "shopify:orders": 990, "meta:spend": 11727, "meta:purchase_value": 21088 }, 30),
  },
  days: {},
  dataThrough: "2026-10-31",
  generatedAt: "2026-11-23T00:00:00Z",
});

describe("report text helpers", () => {
  it("lists the written sections the report has", () => {
    expect(textSectionsFor(data)).toEqual(["summary", "sales", "paid_media", "wins", "watchouts", "next_steps"]);
  });

  it("turns Claude's text into safe HTML", () => {
    expect(paragraphsToHtml(["Up **4.4%** <b>", " "])).toBe("<p>Up <strong>4.4%</strong> &lt;b&gt;</p>");
    expect(bulletsToHtml(["- One", "Two"])).toBe("<ul><li>One</li><li>Two</li></ul>");
    expect(sanitizeReportHtml('<p onclick="x">Hi <script>alert(1)</script><a href="javascript:x">l</a></p>')).toBe("<p>Hi <a>l</a></p>");
    expect(htmlToPlain("<p>A &amp; B</p><ul><li>C</li></ul>")).toBe("A & B\nC");
  });

  it("finds figures and flags the ones not in the data", () => {
    expect(figuresIn("Total ad spend was $26,515. MER landed at 3.74x").map((f) => f.text)).toEqual(["$26,515", "3.74x"]);
    const text = "Net sales were $99,271 ($99.3k), down 14.4% from $115,931. ROAS 1.59x. Orders hit 12,345 and AOV $500.";
    expect(unsupportedFigures(text, data)).toEqual(["12,345", "$500"]);
  });
});

describe("prompt", () => {
  it("keeps only the style rules that apply to a report", () => {
    const rules = reportRules(DEFAULT_STYLE_GUIDE);
    expect(rules).toContain("## Writing Rules");
    expect(rules).toContain("## Editorial Rules");
    expect(rules).not.toContain("## SEO Rules");
    expect(rules).not.toContain("Intro & Hook");
  });

  it("hands Claude the figures as the report prints them", () => {
    const text = dataForPrompt(data);
    expect(text).toContain("- Net Sales: $99,271; September 2026: $115,931 (-14.4%)");
    expect(userPrompt({ data, keys: ["sales"], instruction: "shorter", current: { sales: "Old text", summary: "Sum" } })).toMatch(/Old text[\s\S]*Instruction from the team for this rewrite: shorter/);
  });

  it("asks for paragraphs or bullet items per section", () => {
    const schema = outputSchema(["summary", "wins"]) as { required: string[]; properties: Record<string, { required: string[] }> };
    expect(schema.required).toEqual(["summary", "wins"]);
    expect(schema.properties.summary.required).toEqual(["paragraphs"]);
    expect(schema.properties.wins.required).toEqual(["items"]);
  });
});
