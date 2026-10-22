/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
// ═══════════════════════════════════════════════════════════════
// seo-docx-builder.ts — Builds the SEO Content .docx buffer
// Drive upload is handled separately in the route file.
// ═══════════════════════════════════════════════════════════════

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, Footer, PageNumber,
  FileChild,
} from "docx";

// ── Brand palette (1o8) ──────────────────────────────
const GOLD   = "FF751F";   // Burnt Orange / accent
const GREY   = "2C2B36";   // Charcoal / dark text
const BLACK  = "000000";
const WHITE  = "FFFFFF";
const LIGHT  = "F7F7F7";
const MID    = "888888";
const GREEN  = "35C759";
const RED    = "FF5C60";
const FONT   = "Inter";

// ── Border helpers ──────────────────────────────────────────────
const cb     = { style: BorderStyle.SINGLE, size: 1, color: "E5E5E5" };
const borders = { top: cb, bottom: cb, left: cb, right: cb };
const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const gap = (pts = 120) => new Paragraph({ children: [new TextRun("")], spacing: { after: pts } });

// ── Keyword highlighting ────────────────────────────────────────
const highlightRuns = (text: string, keywords: string[], baseColor: string, size: number): TextRun[] => {
  if (!text) return [new TextRun({ text: "", size, font: FONT, color: baseColor })];
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
  if (!cleaned.length) return [new TextRun({ text, size, font: FONT, color: baseColor })];
  const sorted = cleaned.toSorted((a, b) => b.length - a.length);
  const escaped = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).filter((p) => p !== "").map((p) => {
    const isKw = sorted.some((k) => k.toLowerCase() === p.toLowerCase());
    return new TextRun({ text: p, size, font: FONT, color: isKw ? RED : baseColor });
  });
};

// ── Text helpers ────────────────────────────────────────────────
const bodyP = (text: string, color = GREY, size = 20, keywords: string[] = []) =>
  new Paragraph({ children: highlightRuns(text, keywords, color, size), spacing: { after: 80 } });

const metaP = (label: string, value: string, warn = false) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 18, font: FONT, color: MID }),
      new TextRun({ text: value || "—", size: 18, font: FONT, color: warn ? RED : value ? GREY : "BBBBBB" }),
    ],
    spacing: { after: 60 },
  });

// H1 = 18pt bold (Inter Extra Bold), accent gold — used for cover title
// H2 = 14pt bold — section headings
const headingP = (text: string, level: number) =>
  new Paragraph({
    children: [new TextRun({
      text,
      bold: true,
      font: FONT,
      size: level === 1 ? 36 : level === 2 ? 28 : 22,
      color: level === 1 ? GOLD : GREY,
    })],
    spacing: { before: level === 1 ? 480 : 400, after: 120 },
    ...(level === 1 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 1 } } } : {}),
  });

const asinHeader = (asin: string, product: string, level: string, attrs: string) => {
  const isParent = level.toLowerCase() === "parent";
  return [
    new Paragraph({
      pageBreakBefore: true,
      children: [
        new TextRun({ text: asin, bold: true, size: 22, font: "Courier New", color: GOLD }),
        new TextRun({ text: `   ${isParent ? "PARENT" : "CHILD"}`, bold: true, size: 16, font: FONT, color: isParent ? "1D4ED8" : "7C3AED" }),
        ...(product ? [new TextRun({ text: `   ${product}`, size: 20, font: FONT, color: GREY })] : []),
      ],
      spacing: { before: 480, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "E5E5E5", space: 1 } },
    }),
    ...(attrs ? [bodyP(attrs, MID, 18)] : []),
    gap(80),
  ];
};

// ── Bullet row — num | content | char count (no label column) ──
const bRow = (num: number, text: string, chars: number, lo: number, hi: number, keywords: string[] = []) => {
  const warn = chars > 0 && (chars < lo || chars > hi);
  const cc = warn ? RED : chars > 0 ? GREEN : MID;
  const cellRuns = text
    ? highlightRuns(text, keywords, GREY, 20)
    : [new TextRun({ text: "— not generated —", size: 20, font: FONT, color: "BBBBBB" })];
  return new TableRow({ children: [
    new TableCell({
      borders, width: { size: 400, type: WidthType.DXA },
      shading: { fill: LIGHT, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(num), bold: true, size: 18, font: FONT, color: MID })] })],
    }),
    new TableCell({
      borders, width: { size: 8200, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: cellRuns })],
    }),
    new TableCell({
      borders, width: { size: 760, type: WidthType.DXA },
      shading: { fill: LIGHT, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: chars ? `${chars}c` : "", size: 16, font: "Courier New", color: cc })] })],
    }),
  ]});
};

const bTable = (rows: TableRow[]) =>
  new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [400, 8200, 760], rows });

// ── Premium Q&A card (Q row dark + A row gold) ─────────────────
const qaPairTable = (num: number, q: string, a: string): FileChild[] => {
  const qLen = (q || "").length, aLen = (a || "").length;
  const qOk = qLen >= 115 && qLen <= 120, aOk = aLen >= 245 && aLen <= 250;
  const cardBorder = { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" };

  const table = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [700, 7940, 720],
    rows: [
      new TableRow({ children: [
        new TableCell({
          borders: { top: cardBorder, bottom: noBorder, left: cardBorder, right: noBorder },
          shading: { fill: GREY, type: ShadingType.CLEAR },
          width: { size: 700, type: WidthType.DXA },
          margins: { top: 120, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Q", bold: true, size: 22, font: FONT, color: WHITE })] })],
        }),
        new TableCell({
          borders: { top: cardBorder, bottom: noBorder, left: noBorder, right: noBorder },
          width: { size: 7940, type: WidthType.DXA },
          margins: { top: 120, bottom: 60, left: 160, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: q || "—", bold: true, size: 20, font: FONT, color: BLACK })] })],
        }),
        new TableCell({
          borders: { top: cardBorder, bottom: noBorder, left: noBorder, right: cardBorder },
          shading: { fill: LIGHT, type: ShadingType.CLEAR },
          width: { size: 720, type: WidthType.DXA },
          margins: { top: 120, bottom: 60, left: 60, right: 60 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: qLen ? `${qLen}c` : "", size: 16, font: "Courier New", color: qOk ? GREEN : RED })] })],
        }),
      ]}),
      new TableRow({ children: [
        new TableCell({
          borders: { top: noBorder, bottom: cardBorder, left: cardBorder, right: noBorder },
          shading: { fill: GOLD, type: ShadingType.CLEAR },
          width: { size: 700, type: WidthType.DXA },
          margins: { top: 60, bottom: 120, left: 100, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "A", bold: true, size: 22, font: FONT, color: WHITE })] })],
        }),
        new TableCell({
          borders: { top: noBorder, bottom: cardBorder, left: noBorder, right: noBorder },
          width: { size: 7940, type: WidthType.DXA },
          margins: { top: 60, bottom: 120, left: 160, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: a || "—", size: 20, font: FONT, color: GREY })] })],
        }),
        new TableCell({
          borders: { top: noBorder, bottom: cardBorder, left: noBorder, right: cardBorder },
          shading: { fill: LIGHT, type: ShadingType.CLEAR },
          width: { size: 720, type: WidthType.DXA },
          margins: { top: 60, bottom: 120, left: 60, right: 60 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: aLen ? `${aLen}c` : "", size: 16, font: "Courier New", color: aOk ? GREEN : RED })] })],
        }),
      ]}),
    ],
  });
  return [table, gap(80)];
};

// ── Public interface ────────────────────────────────────────────

export interface DocxRow {
  asin: string; parentage: string; product: string;
  flavor: string; style: string; color: string; size: string;
  title: string; titleC: number;
  itemHighlight: string;
  d1: string; d1c: number; d2: string; d2c: number; d3: string; d3c: number; d4: string; d4c: number; d5: string; d5c: number;
  // Concise / Content / Key Features retained in interface for backward compat but not rendered
  c1: string; c1c: number; c2: string; c2c: number; c3: string; c3c: number; c4: string; c4c: number; c5: string; c5c: number;
  ct1: string; ct1c: number; ct2: string; ct2c: number; ct3: string; ct3c: number; ct4: string; ct4c: number; ct5: string; ct5c: number;
  kf1: string; kf1c: number; kf2: string; kf2c: number; kf3: string; kf3c: number; kf4: string; kf4c: number; kf5: string; kf5c: number;
  desc: string; descC: number;
  backend: string; backendB: number;
  aplusQA?: { q: string; a: string }[];
}

export async function buildDocxBuffer(
  rows: DocxRow[],
  brand: string,
  today: string,
  projectName: string,
  keywords: string[] = [],
): Promise<Buffer> {
  const children: FileChild[] = [];
  const kws = keywords.filter(Boolean);

  // ── Cover page ──────────────────────────────────────────────
  children.push(gap(480));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "1o8 SEO", size: 48, bold: true, font: FONT, color: GOLD })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: projectName, size: 28, font: FONT, color: GREY })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 480 },
    children: [new TextRun({ text: `${brand}  ·  ${rows.length} ASINs  ·  ${today}`, size: 20, font: FONT, color: MID })],
  }));
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: GOLD, space: 1 } },
    children: [new TextRun("")], spacing: { after: 480 },
  }));

  // ── Per-ASIN sections ────────────────────────────────────────
  for (const r of rows) {
    const attrs = [r.flavor, r.style, r.color, r.size].filter(Boolean).join("  ·  ");
    children.push(...asinHeader(r.asin, r.product, r.parentage, attrs));

    // B1 — Title
    children.push(headingP("B1 — Title", 2));
    children.push(r.title
      ? bodyP(r.title, GREY, 22, kws)
      : bodyP("— not generated —", "BBBBBB"));
    children.push(metaP("Characters", `${r.titleC} / 75`, r.titleC > 75));
    children.push(gap(160));

    // B1b — Item Highlight
    children.push(headingP("B1b — Item Highlight", 2));
    children.push(r.itemHighlight
      ? bodyP(r.itemHighlight, GREY, 20, kws)
      : bodyP("— not generated —", "BBBBBB"));
    const ihLen = r.itemHighlight ? r.itemHighlight.length : 0;
    children.push(metaP("Characters", `${ihLen} / 125`, ihLen > 125));
    children.push(gap(240));

    // B2 — Detailed Bullet Points
    children.push(headingP("B2 — Detailed Bullet Points", 2));
    children.push(bodyP("390–400 chars each", MID, 18));
    children.push(bTable([
      bRow(1, r.d1, r.d1c, 390, 400, kws),
      bRow(2, r.d2, r.d2c, 390, 400, kws),
      bRow(3, r.d3, r.d3c, 390, 400, kws),
      bRow(4, r.d4, r.d4c, 390, 400, kws),
      bRow(5, r.d5, r.d5c, 390, 400, kws),
    ]));
    children.push(gap(240));

    // B3 — Product Description
    children.push(headingP("B3 — Product Description", 2));
    children.push(r.desc
      ? bodyP(r.desc, GREY, 20, kws)
      : bodyP("— not generated —", "BBBBBB"));
    children.push(metaP("Characters", `${r.descC} / 1200`, r.descC > 1200 || (r.descC > 0 && r.descC < 1000)));
    children.push(gap(240));

    // B4 — Backend Search Terms
    children.push(headingP("B4 — Backend Search Terms", 2));
    const backendWarn = r.backendB > 500;
    const backendRuns = r.backend
      ? highlightRuns(r.backend, kws, GREY, 20)
      : [new TextRun({ text: "— not generated —", size: 20, font: FONT, color: "BBBBBB" })];
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA }, columnWidths: [9000, 360],
      rows: [new TableRow({ children: [
        new TableCell({
          borders, width: { size: 9000, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: backendRuns })],
        }),
        new TableCell({
          borders, width: { size: 360, type: WidthType.DXA },
          shading: { fill: LIGHT, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.backendB ? `${r.backendB}B` : "", size: 16, font: "Courier New", color: backendWarn ? RED : r.backendB > 0 ? GREEN : MID })] })],
        }),
      ]})],
    }));

    // B5 — Premium A+ Q&A
    if (r.aplusQA?.length) {
      children.push(gap(240));
      children.push(headingP("B5 — Premium A+ Q&A (Module 7)", 2));
      children.push(bodyP("Decision-stage Q&A  ·  Q: 115–120 chars  ·  A: 245–250 chars", MID, 18));
      children.push(gap(80));
      children.push(...r.aplusQA.flatMap((pair, i) => qaPairTable(i + 1, pair.q, pair.a)));
    }

    children.push(gap(480));
  }

  // ── Footer ───────────────────────────────────────────────────
  const footerPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: `${brand}  ·  1o8 SEO  ·  Page `, size: 16, font: FONT, color: "AAAAAA" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: "AAAAAA" }),
      new TextRun({ text: " of ", size: 16, font: FONT, color: "AAAAAA" }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONT, color: "AAAAAA" }),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20, color: GREY } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: { default: new Footer({ children: [footerPara] }) },
      children,
    }],
  });

  return await Packer.toBuffer(doc) as Buffer;
}
