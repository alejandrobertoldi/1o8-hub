/**
 * Generate an XLSX workbook from ClientReportData using SheetJS.
 */
import * as XLSX from "xlsx";
import type { ClientReportData } from "./client-report";

export function generateXlsx(data: ClientReportData): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──
  const summaryRows = [
    ["Client Report"],
    [],
    ["Client", data.clientName],
    ["Client Code", data.clientIdCode],
    ["Generated", new Date(data.generatedAt).toLocaleString("en-US")],
    [
      "Date Range",
      `${new Date(data.dateRange.from).toLocaleDateString("en-US")} – ${new Date(data.dateRange.to).toLocaleDateString("en-US")}`,
    ],
    [],
    ["Product Summary"],
    ["Total Products", data.summary.totalProducts],
    ["Active Products", data.summary.activeProducts],
    ["Average Readiness Score", `${data.summary.averageScore}%`],
    [],
    ["Score Distribution"],
    ["Ready (≥90%)", data.summary.distribution.ready],
    ["Good (70–89%)", data.summary.distribution.good],
    ["Incomplete (50–69%)", data.summary.distribution.incomplete],
    ["Poor (<50%)", data.summary.distribution.poor],
    [],
    ["Recent Changes", data.recentChanges.length],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  // Set column widths
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // ── Sheet 2: Products ──
  const productHeaders = [
    "ASIN",
    "SKU",
    "Item Name",
    "Status",
    "Score",
    "Missing Required",
    "Missing Cond. Required",
  ];
  const productRows = data.products.map((p) => [
    p.asin || "",
    p.sku || "",
    p.itemName || "",
    p.status || "",
    p.score,
    p.missingRequired.join(", "),
    p.missingConditionallyRequired.join(", "),
  ]);
  const productsWs = XLSX.utils.aoa_to_sheet([productHeaders, ...productRows]);
  productsWs["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 50 },
    { wch: 10 },
    { wch: 8 },
    { wch: 60 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, productsWs, "Products");

  // ── Sheet 3: Recent Changes ──
  if (data.recentChanges.length > 0) {
    const changeHeaders = [
      "Date",
      "ASIN",
      "SKU",
      "Item Name",
      "Field",
      "Old Value",
      "New Value",
      "Changed By",
      "Type",
    ];
    const changeRows = data.recentChanges.map((c) => [
      new Date(c.changedAt).toLocaleString("en-US"),
      c.asin || "",
      c.sku || "",
      c.itemName || "",
      c.fieldLabel,
      c.oldValue || "",
      c.newValue || "",
      c.changedBy,
      c.editType,
    ]);
    const changesWs = XLSX.utils.aoa_to_sheet([
      changeHeaders,
      ...changeRows,
    ]);
    changesWs["!cols"] = [
      { wch: 20 },
      { wch: 14 },
      { wch: 20 },
      { wch: 40 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 25 },
      { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, changesWs, "Recent Changes");
  }

  // ── Sheet 4: Field Coverage ──
  if (data.fieldCoverage.length > 0) {
    const coverageHeaders = [
      "Field",
      "Requirement Level",
      "Filled",
      "Total",
      "Fill Rate",
    ];
    const coverageRows = data.fieldCoverage.map((f) => [
      f.fieldLabel,
      f.requirementLevel,
      f.filledCount,
      f.totalCount,
      `${f.fillRate}%`,
    ]);
    const coverageWs = XLSX.utils.aoa_to_sheet([
      coverageHeaders,
      ...coverageRows,
    ]);
    coverageWs["!cols"] = [
      { wch: 40 },
      { wch: 25 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, coverageWs, "Field Coverage");
  }

  // Write to buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
