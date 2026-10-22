/**
 * Generate a PDF report from ClientReportData using jspdf + jspdf-autotable.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ClientReportData } from "./client-report";

const BRAND_GOLD = "#FAC800";
const BRAND_DARK = "#565454";

function getScoreColor(score: number): string {
  if (score >= 90) return "#10b981";
  if (score >= 70) return BRAND_GOLD;
  if (score >= 50) return "#f97316";
  return "#ef4444";
}

export function generatePdf(data: ClientReportData): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(BRAND_DARK);
  doc.rect(0, 0, pageWidth, 22, "F");

  doc.setTextColor(BRAND_GOLD);
  doc.setFontSize(18);
  doc.text("1o8", 14, 14);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`Client Report: ${data.clientName}`, 70, 14);

  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US")} | Range: ${new Date(data.dateRange.from).toLocaleDateString("en-US")} – ${new Date(data.dateRange.to).toLocaleDateString("en-US")}`,
    pageWidth - 14,
    14,
    { align: "right" }
  );

  let y = 30;

  // ── Summary Section ──
  doc.setTextColor(BRAND_DARK);
  doc.setFontSize(14);
  doc.text("Summary", 14, y);
  y += 8;

  // Summary cards
  const cardWidth = 55;
  const cards = [
    { label: "Total Products", value: String(data.summary.totalProducts) },
    { label: "Active Products", value: String(data.summary.activeProducts) },
    { label: "Avg. Readiness", value: `${data.summary.averageScore}%` },
    { label: "Recent Changes", value: String(data.recentChanges.length) },
  ];

  cards.forEach((card, i) => {
    const x = 14 + i * (cardWidth + 6);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(card.label, x + 4, y + 6);
    doc.setFontSize(16);
    doc.setTextColor(BRAND_DARK);
    doc.text(card.value, x + 4, y + 15);
  });
  y += 24;

  // Distribution row
  const distItems = [
    { label: "Ready", count: data.summary.distribution.ready, color: "#10b981" },
    { label: "Good", count: data.summary.distribution.good, color: BRAND_GOLD },
    { label: "Incomplete", count: data.summary.distribution.incomplete, color: "#f97316" },
    { label: "Poor", count: data.summary.distribution.poor, color: "#ef4444" },
  ];
  doc.setFontSize(9);
  distItems.forEach((item, i) => {
    const x = 14 + i * 50;
    doc.setTextColor(item.color);
    doc.text(`${item.label}: ${item.count}`, x, y);
  });
  y += 10;

  // ── Products Table ──
  doc.setTextColor(BRAND_DARK);
  doc.setFontSize(14);
  doc.text("Products", 14, y);
  y += 4;

  const productBody = data.products
    .sort((a, b) => a.score - b.score)
    .slice(0, 100)
    .map((p) => [
      p.asin || "—",
      p.sku || "—",
      (p.itemName || "—").slice(0, 60),
      p.status || "—",
      `${p.score}%`,
      String(p.missingRequired.length),
    ]);

  autoTable(doc, {
    startY: y,
    head: [["ASIN", "SKU", "Item Name", "Status", "Score", "Missing"]],
    body: productBody,
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: {
      fillColor: BRAND_DARK,
      textColor: [255, 255, 255],
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 35 },
      2: { cellWidth: 100 },
      3: { cellWidth: 18 },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 18, halign: "center" },
    },
    didParseCell(hookData) {
      if (hookData.section === "body" && hookData.column.index === 4) {
        const score = parseInt(String(hookData.cell.raw).replace("%", ""));
        if (!isNaN(score)) {
          hookData.cell.styles.textColor = getScoreColor(score);
          hookData.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // ── Field Coverage Table (new page) ──
  if (data.fieldCoverage.length > 0) {
    doc.addPage();

    // Header on new page
    doc.setFillColor(BRAND_DARK);
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(BRAND_GOLD);
    doc.setFontSize(18);
    doc.text("1o8", 14, 14);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("Field Coverage", 70, 14);

    const coverageBody = data.fieldCoverage.slice(0, 150).map((f) => [
      f.fieldLabel,
      f.requirementLevel,
      `${f.filledCount}/${f.totalCount}`,
      `${f.fillRate}%`,
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["Field", "Requirement", "Filled/Total", "Fill Rate"]],
      body: coverageBody,
      theme: "striped",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: BRAND_DARK,
        textColor: [255, 255, 255],
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 45 },
        2: { cellWidth: 35, halign: "center" },
        3: { cellWidth: 30, halign: "center" },
      },
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index === 3) {
          const rate = parseInt(String(hookData.cell.raw).replace("%", ""));
          if (!isNaN(rate)) {
            hookData.cell.styles.textColor = getScoreColor(rate);
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  // ── Recent Changes Table (new page) ──
  if (data.recentChanges.length > 0) {
    doc.addPage();

    doc.setFillColor(BRAND_DARK);
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(BRAND_GOLD);
    doc.setFontSize(18);
    doc.text("1o8", 14, 14);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("Recent Changes", 70, 14);

    const changeBody = data.recentChanges.slice(0, 200).map((c) => [
      new Date(c.changedAt).toLocaleDateString("en-US"),
      c.asin || "—",
      c.fieldLabel,
      (c.oldValue || "—").slice(0, 40),
      (c.newValue || "—").slice(0, 40),
      c.changedBy,
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "ASIN", "Field", "Old Value", "New Value", "By"]],
      body: changeBody,
      theme: "striped",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: BRAND_DARK,
        textColor: [255, 255, 255],
        fontSize: 8,
      },
    });
  }

  // Return as Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
