import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoKeywords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

export const maxDuration = 60;

const SEMANTIC_GROUP_ORDER = ["CoreProduct", "Ingredient", "Language", "GenericCat", "Benefit", "Competitor"];

const SEMANTIC_GROUP_LABELS: Record<string, string> = {
  CoreProduct: "Core Product Keywords",
  Ingredient: "Ingredient / Material / Format",
  Language: "Spanish / Foreign Language Terms",
  GenericCat: "Generic Category Keywords",
  Benefit: "Benefit / Use-Case Keywords",
  Competitor: "Competitor Brand Keywords",
  "": "Unclassified",
};

const NEGATIVE_CATEGORY_LABELS: Record<string, string> = {
  WrongForm: "Wrong Product Form",
  WrongType: "Wrong Product Type",
  WrongIngredient: "Wrong Ingredient",
  CompetitorBrand: "Competitor Brand",
  WrongCat: "Wrong Category",
  "": "Other",
};

// Group header row fill colors (ARGB)
const GROUP_COLORS: Record<string, string> = {
  CoreProduct: "FF1E40AF",
  Ingredient: "FF065F46",
  Language: "FF92400E",
  GenericCat: "FF5B21B6",
  Benefit: "FF9D174D",
  Competitor: "FF991B1B",
  "": "FF374151",
};

// Light tint for data rows
const GROUP_TINTS: Record<string, string> = {
  CoreProduct: "FFDBEAFE",
  Ingredient: "FFD1FAE5",
  Language: "FFFEF3C7",
  GenericCat: "FFEDE9FE",
  Benefit: "FFFCE7F3",
  Competitor: "FFFEE2E2",
  "": "FFF3F4F6",
};

function ppcCampaignType(volume: number): string {
  if (volume >= 10000) return "Exact + Broad";
  if (volume >= 3000) return "Exact";
  return "Exact (Niche)";
}

function applyHeaderStyle(ws: XLSX.WorkSheet, cellRef: string, color: string) {
  if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
  ws[cellRef].s = {
    fill: { fgColor: { argb: color }, patternType: "solid" },
    font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", sz: 11 },
    alignment: { horizontal: "left", vertical: "center", wrapText: false },
    border: { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } },
  };
}

function applyDataStyle(ws: XLSX.WorkSheet, cellRef: string, bgColor: string, bold = false) {
  if (!ws[cellRef]) return;
  ws[cellRef].s = {
    fill: { fgColor: { argb: bgColor }, patternType: "solid" },
    font: { bold, name: "Arial", sz: 10 },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const keywords = await db
    .select()
    .from(seoKeywords)
    .where(eq(seoKeywords.projectId, id))
    .orderBy(desc(seoKeywords.searchVolume));

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Master Keyword List ───────────────────────────────────────────
  {
    const positiveKws = keywords.filter((k) => !k.isNegative);
    const grouped: Record<string, typeof positiveKws> = {};
    for (const g of SEMANTIC_GROUP_ORDER) grouped[g] = [];
    grouped[""] = [];
    for (const k of positiveKws) {
      const g = k.semanticGroup || "";
      if (!(g in grouped)) grouped[g] = [];
      grouped[g].push(k);
    }

    const data: any[][] = [];
    // Title rows
    data.push([`${project.brandName || "Product"} — Keyword Research`]);
    data.push(["Master Keyword List — All Semantic Groups"]);
    data.push([]);

    const colHeaders = ["Keyword", "Search Volume", "Cerebro IQ", "PPC Bid", "Competing", "Title Density", "Tier", "Use Location", "Buyer Stage", "Priority"];
    data.push(colHeaders);

    for (const groupKey of [...SEMANTIC_GROUP_ORDER, ""]) {
      const kws = grouped[groupKey];
      if (!kws || kws.length === 0) continue;
      // Group header
      data.push([SEMANTIC_GROUP_LABELS[groupKey] || groupKey, "", "", "", "", "", "", "", "", `${kws.length} keywords`]);
      for (const k of kws) {
        const vol = k.searchVolume || 0;
        const priority = vol >= 5000 ? "High" : vol >= 1000 ? "Medium" : vol >= 300 ? "Low" : "Very Low";
        data.push([
          k.text,
          vol,
          k.cerebroIq ?? "",
          k.ppcSuggestedBid ? `$${k.ppcSuggestedBid}` : "",
          k.competingProducts ?? "",
          k.titleDensity ?? "",
          k.priorityTier || "T4",
          k.primaryUseLocation || "",
          k.buyerStage || "",
          priority,
        ]);
      }
      data.push([]); // blank spacer row
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
      { wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 10 },
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 4 };

    // Style title rows
    applyDataStyle(ws, "A1", "FF1E293B", true);
    if (ws["A1"]) ws["A1"].s.font = { bold: true, name: "Arial", sz: 14, color: { argb: "FFFFFFFF" } };
    applyDataStyle(ws, "A2", "FF334155", false);
    if (ws["A2"]) ws["A2"].s.font = { name: "Arial", sz: 11, color: { argb: "FFCBD5E1" } };

    // Style column headers (row 4)
    for (let c = 0; c < colHeaders.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 3, c });
      applyHeaderStyle(ws, ref, "FF0F172A");
    }

    // Style group headers and data rows
    let row = 4; // 0-indexed row after the 4 header rows
    for (const groupKey of [...SEMANTIC_GROUP_ORDER, ""]) {
      const kws = grouped[groupKey];
      if (!kws || kws.length === 0) continue;
      const headerColor = GROUP_COLORS[groupKey] || GROUP_COLORS[""];
      const tintColor = GROUP_TINTS[groupKey] || GROUP_TINTS[""];
      for (let c = 0; c < colHeaders.length; c++) {
        applyHeaderStyle(ws, XLSX.utils.encode_cell({ r: row, c }), headerColor);
      }
      row++;
      for (let i = 0; i < kws.length; i++) {
        for (let c = 0; c < colHeaders.length; c++) {
          applyDataStyle(ws, XLSX.utils.encode_cell({ r: row, c }), tintColor);
        }
        row++;
      }
      row++; // spacer
    }

    XLSX.utils.book_append_sheet(wb, ws, "Master Keyword List");
  }

  // ─── Sheet 2: Single Keyword Campaigns ──────────────────────────────────────
  {
    const singleKws = keywords
      .filter((k) => !k.isNegative && (k.priorityTier === "T1" || k.priorityTier === "T2"))
      .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
      .slice(0, 20);

    const data: any[][] = [];
    data.push(["Single Keyword Campaigns"]);
    data.push(["Top priority keywords recommended for isolated exact-match campaigns"]);
    data.push([]);
    data.push(["Keyword", "Search Volume", "Cerebro IQ", "PPC Bid", "Competing", "Title Density", "Campaign Type"]);

    for (const k of singleKws) {
      data.push([
        k.text,
        k.searchVolume || 0,
        k.cerebroIq ?? "",
        k.ppcSuggestedBid ? `$${k.ppcSuggestedBid}` : "",
        k.competingProducts ?? "",
        k.titleDensity ?? "",
        ppcCampaignType(k.searchVolume || 0),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];

    for (let c = 0; c < 7; c++) {
      applyHeaderStyle(ws, XLSX.utils.encode_cell({ r: 0, c }), "FF1E3A5F");
    }
    if (ws["A1"]) ws["A1"].s.font = { bold: true, name: "Arial", sz: 14, color: { argb: "FFFFFFFF" } };
    for (let c = 0; c < 7; c++) {
      applyHeaderStyle(ws, XLSX.utils.encode_cell({ r: 3, c }), "FF0F172A");
    }
    for (let r = 4; r < 4 + singleKws.length; r++) {
      for (let c = 0; c < 7; c++) {
        applyDataStyle(ws, XLSX.utils.encode_cell({ r, c }), "FFDBEAFE");
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, "Single KW Campaigns");
  }

  // ─── Sheet 3: Negative Keywords ─────────────────────────────────────────────
  {
    const negKws = keywords.filter((k) => k.isNegative);
    const negByCategory: Record<string, typeof negKws> = {};
    for (const k of negKws) {
      const cat = k.negativeReason || "";
      if (!negByCategory[cat]) negByCategory[cat] = [];
      negByCategory[cat].push(k);
    }

    const data: any[][] = [];
    data.push(["Negative Keywords"]);
    data.push(["Keywords to exclude from targeting — organized by reason"]);
    data.push([]);
    data.push(["Negative Keyword", "Reason", "Category", "Match Type"]);

    const catOrder = ["WrongForm", "WrongType", "WrongIngredient", "CompetitorBrand", "WrongCat", ""];
    for (const cat of catOrder) {
      const kws = negByCategory[cat];
      if (!kws || kws.length === 0) continue;
      data.push([NEGATIVE_CATEGORY_LABELS[cat] || cat, "", "", ""]);
      for (const k of kws) {
        data.push([k.text, k.notes || "", NEGATIVE_CATEGORY_LABELS[cat] || cat, "Phrase"]);
      }
      data.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 40 }, { wch: 40 }, { wch: 22 }, { wch: 12 }];

    for (let c = 0; c < 4; c++) {
      applyHeaderStyle(ws, XLSX.utils.encode_cell({ r: 0, c }), "FF7F1D1D");
    }
    if (ws["A1"]) ws["A1"].s.font = { bold: true, name: "Arial", sz: 14, color: { argb: "FFFFFFFF" } };
    for (let c = 0; c < 4; c++) {
      applyHeaderStyle(ws, XLSX.utils.encode_cell({ r: 3, c }), "FF0F172A");
    }

    let r = 4;
    for (const cat of catOrder) {
      const kws = negByCategory[cat];
      if (!kws || kws.length === 0) continue;
      for (let c = 0; c < 4; c++) {
        applyHeaderStyle(ws, XLSX.utils.encode_cell({ r, c }), "FF991B1B");
      }
      r++;
      for (let i = 0; i < kws.length; i++) {
        for (let c = 0; c < 4; c++) {
          applyDataStyle(ws, XLSX.utils.encode_cell({ r, c }), "FFFEE2E2");
        }
        r++;
      }
      r++;
    }

    XLSX.utils.book_append_sheet(wb, ws, "Negative Keywords");
  }

  // ─── Sheet 4: Strategy Summary ───────────────────────────────────────────────
  {
    const positiveKws = keywords.filter((k) => !k.isNegative);
    const negKws = keywords.filter((k) => k.isNegative);
    const singleKwCount = keywords.filter(
      (k) => !k.isNegative && (k.priorityTier === "T1" || k.priorityTier === "T2")
    ).length;
    const competitorCount = keywords.filter((k) => k.isCompetitor).length;

    const groupCounts = SEMANTIC_GROUP_ORDER.map((g) => ({
      name: SEMANTIC_GROUP_LABELS[g],
      count: positiveKws.filter((k) => k.semanticGroup === g).length,
    }));

    const t1 = keywords.filter((k) => k.priorityTier === "T1").slice(0, 5).map((k) => k.text).join(", ");
    const t2 = keywords.filter((k) => k.priorityTier === "T2").slice(0, 8).map((k) => k.text).join(", ");

    const data: any[][] = [
      ["Strategy Summary"],
      [],
      ["PROJECT"],
      ["Brand", project.brandName || ""],
      ["Marketplace", "amazon.com"],
      [],
      ["KEYWORD COUNTS"],
      ["Total keywords", keywords.length],
      ["Targeted (non-negative)", positiveKws.length],
      ["Negative keywords", negKws.length],
      ["Single KW campaign candidates", Math.min(singleKwCount, 20)],
      ["Competitor brand terms", competitorCount],
      [],
      ["SEMANTIC GROUPS"],
      ...groupCounts.map((g) => [g.name, g.count]),
      [],
      ["SEO TIERS"],
      ["T1 — Title keywords", keywords.filter((k) => k.priorityTier === "T1").length],
      ["T2 — Bullet keywords", keywords.filter((k) => k.priorityTier === "T2").length],
      ["T3 — Description keywords", keywords.filter((k) => k.priorityTier === "T3").length],
      ["T4 — Backend keywords", keywords.filter((k) => k.priorityTier === "T4").length],
      [],
      ["TOP T1 KEYWORDS"],
      [t1 || "None assigned"],
      [],
      ["TOP T2 KEYWORDS"],
      [t2 || "None assigned"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 36 }, { wch: 30 }];

    applyHeaderStyle(ws, "A1", "FF0F172A");
    if (ws["A1"]) ws["A1"].s.font = { bold: true, name: "Arial", sz: 16, color: { argb: "FFFFFFFF" } };

    XLSX.utils.book_append_sheet(wb, ws, "Strategy Summary");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
  const projectSlug = (project.brandName || "keywords").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${projectSlug}_keyword_research.xlsx"`,
    },
  });
}
