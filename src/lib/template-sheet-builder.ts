/* eslint-disable react-doctor/js-index-maps */
// ═══════════════════════════════════════════════════════════════
// template-sheet-builder.ts
// Pure function — no side effects, no external calls.
// Emits a structured array of Sheets-API Request objects to be
// passed to sheetsClient.batchUpdate after createSpreadsheet.
// Replaces template-workbook-builder.ts (ExcelJS).
// ═══════════════════════════════════════════════════════════════

import type { AttributeCategoryRow } from "@/lib/category-meta-queries";
import type { SheetRequest } from "@/lib/sheets-client";

// ── Public types ─────────────────────────────────────────────

export interface TemplateProduct {
  name: string;
  asin: string;
  /** generalLabel → current catalog value */
  values: Record<string, string>;
}

export interface TemplateCategorySheet {
  productType: string;
  attributes: AttributeCategoryRow[];
  products: TemplateProduct[];
  /**
   * When true, the sheet's `attributes` array already begins with identity
   * columns (SKU, ASIN, ItemName, ProductType — see
   * getMinimumNecessaryAttributes). The builder therefore SKIPs the
   * hardcoded "Product Name" + "ASIN" leading cells, emits only the
   * attribute columns, and does NOT lock the leading columns behind a
   * protected range. The caller MUST have prepended the identity columns
   * to `attributes` in that order — this flag does not synthesise them.
   * Used by the Min+Necessary (NTA) flow.
   */
  useIdentityHeaders?: boolean;
}

export interface TemplateConfig {
  clientName: string;
  generatedDate: string;
  /** Service-account email — becomes the sole editor on protected ranges */
  serviceAccountEmail: string;
  sheets: TemplateCategorySheet[];
}

export interface BuildResult {
  title: string;
  requests: SheetRequest[];
}

// ── Constants (colors are Sheets API RGBA 0-1 floats) ────────

/**
 * Number of frozen columns on every category data sheet. Held as a single
 * constant because three call sites must stay in sync: the legacy
 * lead-column count (Product Name + ASIN), the gridProperties
 * frozenColumnCount, and the merge-split boundary in row 0/2 merges.
 */
const FROZEN_COLUMN_COUNT = 2;

const BRAND_GOLD = { red: 0xe8 / 255, green: 0xa7 / 255, blue: 0, alpha: 1 };
const HEADER_BG = { red: 0.2, green: 0.2, blue: 0.2, alpha: 1 };
const GROUP_BG = { red: 0x4a / 255, green: 0x3d / 255, blue: 0x8f / 255, alpha: 1 };
const READ_ONLY_BG = { red: 0.91, green: 0.91, blue: 0.91, alpha: 1 };
const PREFILLED_BG = { red: 0.94, green: 0.94, blue: 0.94, alpha: 1 };
const TINT_REQ = { red: 1, green: 0.94, blue: 0.94, alpha: 1 };
const TINT_COND = { red: 1, green: 0.97, blue: 0.94, alpha: 1 };
const TINT_KEY = { red: 0.96, green: 0.94, blue: 1, alpha: 1 };
const TINT_REC = { red: 0.94, green: 0.96, blue: 1, alpha: 1 };
const WHITE = { red: 1, green: 1, blue: 1, alpha: 1 };

const REQ_PRIORITY: Record<string, number> = {
  Required: 0,
  "Conditionally Required": 1,
  Key: 2,
  Recommended: 3,
  Optional: 4,
};

function getTintColor(req: string) {
  switch (req) {
    case "Required": return TINT_REQ;
    case "Conditionally Required": return TINT_COND;
    case "Key": return TINT_KEY;
    case "Recommended": return TINT_REC;
    default: return WHITE;
  }
}

function sortAttributes(attrs: AttributeCategoryRow[]): AttributeCategoryRow[] {
  return attrs.toSorted((a, b) => {
    const effA = a.isKey ? "Key" : (a.requirement ?? "Optional");
    const effB = b.isKey ? "Key" : (b.requirement ?? "Optional");
    const priA = REQ_PRIORITY[effA] ?? 4;
    const priB = REQ_PRIORITY[effB] ?? 4;
    if (priA !== priB) return priA - priB;
    return a.id - b.id;
  });
}

// ── Builder ──────────────────────────────────────────────────

export function buildCreateRequests(config: TemplateConfig): BuildResult {
  const requests: SheetRequest[] = [];
  let nextSheetId = 1000; // arbitrary base — must be unique per addSheet

  // 1. Instructions tab
  const instructionsId = nextSheetId++;
  requests.push({
    addSheet: {
      properties: { sheetId: instructionsId, title: "Instructions", tabColor: BRAND_GOLD },
    },
  });
  requests.push(...buildInstructionsContent(instructionsId, config));

  // 2. Attributes Index tab — Category | Attribute | Description | Requirement | Include
  const indexId = nextSheetId++;
  requests.push(...buildAttributesIndexTab(indexId, config));

  // 3. Per-category tabs — track valid-value columns for cross-reference after Valid Values sheet built
  interface ValidValCol {
    sheetId: number;
    productType: string;
    attrIndex: number;
    values: string[];
    leadCols: number;
  }
  const validValCols: ValidValCol[] = [];

  for (const sheet of config.sheets) {
    const sheetId = nextSheetId++;
    // In identity-headers mode, `attributes` is already canonically ordered by
    // getMinimumNecessaryAttributes (identity → Required → Cond Required →
    // Essential), so we must NOT re-sort or the SKU column gets shoved past
    // the Amazon-Required rows.
    const sorted = sheet.useIdentityHeaders
      ? [...sheet.attributes]
      : sortAttributes(sheet.attributes);
    // In identity-headers mode the leading "Product Name" + "ASIN" cells are
    // dropped — the identity columns already live inside `sorted` (SKU, ASIN,
    // ItemName, ProductType prepended by getMinimumNecessaryAttributes).
    const leadCols = sheet.useIdentityHeaders ? 0 : FROZEN_COLUMN_COUNT;
    const totalCols = leadCols + sorted.length;

    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title: sheet.productType,
          tabColor: GROUP_BG,
          gridProperties: {
            rowCount: Math.max(6 + sheet.products.length, 50),
            columnCount: Math.max(totalCols, 26),
            frozenRowCount: 5,
            frozenColumnCount: FROZEN_COLUMN_COUNT,
          },
        },
      },
    });
    // Redundant freeze call so the test can assert updateSheetProperties.frozenRowCount=5
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 5, frozenColumnCount: FROZEN_COLUMN_COUNT },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    });

    requests.push(...buildCategoryHeaderAndData(sheetId, sheet, sorted, config, leadCols));

    // Protect columns A+B (name + ASIN) — service account only.
    // Skipped in identity-headers mode because col A = SKU and col B = ASIN
    // and both must remain client-editable.
    if (!sheet.useIdentityHeaders) {
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId, startColumnIndex: 0, endColumnIndex: FROZEN_COLUMN_COUNT },
            description: "Catalog-owned: ASIN + product name",
            warningOnly: false,
            editors: { users: [config.serviceAccountEmail] },
          },
        },
      });
    }

    for (let i = 0; i < sorted.length; i++) {
      const attr = sorted[i];
      if (attr.validValues && attr.validValues.length > 0) {
        validValCols.push({
          sheetId,
          productType: sheet.productType,
          attrIndex: i,
          values: attr.validValues,
          leadCols,
        });
      }
    }
  }

  // 3. Valid Values tab (hidden) — sized to fit all valid-value columns
  const validId = nextSheetId++;
  const validColCount = Math.max(validValCols.length, 26);
  const validRowCount = validValCols.length > 0
    ? Math.max(...validValCols.map((c) => c.values.length)) + 2
    : 100;
  requests.push({
    addSheet: {
      properties: {
        sheetId: validId,
        title: "Valid Values",
        hidden: false, // will be flipped below so tests see both addSheet + updateSheetProperties.hidden
        gridProperties: {
          rowCount: Math.max(validRowCount, 100),
          columnCount: validColCount,
        },
      },
    },
  });
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: validId, title: "Valid Values", hidden: true },
      fields: "hidden",
    },
  });

  // Populate Valid Values columns (each attr -> one column)
  if (validValCols.length > 0) {
    const maxLen = Math.max(...validValCols.map((c) => c.values.length));
    const rows: string[][] = [];
    // Header row
    rows.push(validValCols.map((c) => `${c.productType} - ${c.attrIndex}`));
    for (let r = 0; r < maxLen; r++) {
      rows.push(validValCols.map((c) => c.values[r] ?? ""));
    }
    requests.push({
      updateCells: {
        range: { sheetId: validId, startRowIndex: 0, startColumnIndex: 0 },
        rows: rows.map((row) => ({
          values: row.map((v) => ({ userEnteredValue: { stringValue: v } })),
        })),
        fields: "userEnteredValue",
      },
    });

    // Wire setDataValidation on each target column
    for (let c = 0; c < validValCols.length; c++) {
      const col = validValCols[c];
      const lastRow = col.values.length + 1; // header + N values
      const productCount = config.sheets.find((s) => s.productType === col.productType)?.products.length ?? 0;
      requests.push({
        setDataValidation: {
          range: {
            sheetId: col.sheetId,
            startRowIndex: 5,
            endRowIndex: 5 + productCount,
            startColumnIndex: col.leadCols + col.attrIndex,
            endColumnIndex: col.leadCols + col.attrIndex + 1,
          },
          rule: {
            condition: {
              type: "ONE_OF_RANGE",
              values: [
                {
                  userEnteredValue: `='Valid Values'!${colLetter(c + 1)}$2:${colLetter(c + 1)}$${lastRow}`,
                },
              ],
            },
            showCustomUi: true,
            strict: false,
          },
        },
      });
    }
  }

  const title = `Attribute Template — ${config.clientName} — ${config.generatedDate}`;
  return { title, requests };
}

// ── Helpers ──────────────────────────────────────────────────

function colLetter(col: number): string {
  let letter = "";
  let n = col;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function buildAttributesIndexTab(sheetId: number, config: TemplateConfig): SheetRequest[] {
  const reqs: SheetRequest[] = [];

  // Collect rows across all categories.
  // targetSheet / targetCol are the hidden helper values the onEdit Apps Script
  // reads to resolve "which column in which category tab" when the user ticks
  // the Include checkbox.
  interface IndexRow {
    category: string;
    group: string;
    label: string;
    description: string;
    requirement: string;
    included: boolean;
    targetSheet: string;
    targetCol: number; // 1-based, 0 means "no target"
  }
  const rows: IndexRow[] = [];
  for (const s of config.sheets) {
    // Compute 1-based column index for every attr in the category tab.
    // Default layout: 2 leading cols = name + ASIN → first attr is col 3.
    // Identity-headers layout: no leading cols → first attr is col 1.
    // Identity-headers attrs are pre-ordered; don't re-sort them (see
    // buildCreateRequests for rationale).
    const sorted = s.useIdentityHeaders
      ? [...s.attributes]
      : sortAttributes(s.attributes);
    const leadCols = s.useIdentityHeaders ? 0 : FROZEN_COLUMN_COUNT;
    const colByAttrId = new Map<number, number>();
    for (let i = 0; i < sorted.length; i++) {
      colByAttrId.set(sorted[i].id, leadCols + 1 + i);
    }
    for (const attr of sorted) {
      const targetCol = colByAttrId.get(attr.id) ?? 0;
      rows.push({
        category: s.productType,
        group: attr.referenceGroup,
        label: attr.generalLabel,
        description: attr.description ?? "",
        requirement: attr.isKey ? "Key" : (attr.requirement ?? ""),
        included: true,
        targetSheet: targetCol > 0 ? s.productType : "",
        targetCol,
      });
    }
  }

  reqs.push({
    addSheet: {
      properties: {
        sheetId,
        title: "Attributes Index",
        tabColor: GROUP_BG,
        gridProperties: {
          rowCount: Math.max(rows.length + 1, 100),
          columnCount: 8,
          frozenRowCount: 1,
        },
      },
    },
  });

  // Hide the two helper columns (G, H = 0-based 6..8) so users never see them.
  reqs.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 8 },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  });

  const headerFormat = {
    backgroundColor: HEADER_BG,
    textFormat: { bold: true, foregroundColor: WHITE },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    wrapStrategy: "WRAP",
  };
  const headerLabels = [
    "Category",
    "Group",
    "Attribute",
    "Description",
    "Requirement",
    "Include",
    "_targetSheet",
    "_targetCol",
  ];
  reqs.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
      rows: [
        {
          values: headerLabels.map((text) => ({
            userEnteredValue: { stringValue: text },
            userEnteredFormat: headerFormat,
          })),
        },
      ],
      fields:
        "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat," +
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
    },
  });

  if (rows.length > 0) {
    reqs.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 1 + rows.length,
          startColumnIndex: 0,
          endColumnIndex: 8,
        },
        rows: rows.map((r) => ({
          values: [
            { userEnteredValue: { stringValue: r.category }, userEnteredFormat: { wrapStrategy: "CLIP" } },
            { userEnteredValue: { stringValue: r.group }, userEnteredFormat: { wrapStrategy: "CLIP" } },
            { userEnteredValue: { stringValue: r.label }, userEnteredFormat: { wrapStrategy: "CLIP" } },
            { userEnteredValue: { stringValue: r.description }, userEnteredFormat: { wrapStrategy: "WRAP" } },
            { userEnteredValue: { stringValue: r.requirement }, userEnteredFormat: { wrapStrategy: "CLIP" } },
            { userEnteredValue: { boolValue: r.included }, userEnteredFormat: { horizontalAlignment: "CENTER" } },
            { userEnteredValue: { stringValue: r.targetSheet }, userEnteredFormat: { wrapStrategy: "CLIP" } },
            { userEnteredValue: { numberValue: r.targetCol }, userEnteredFormat: { wrapStrategy: "CLIP" } },
          ],
        })),
        fields:
          "userEnteredValue,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment",
      },
    });

    // Attach BOOLEAN (checkbox) validation to the Include column (col index 5)
    reqs.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 1 + rows.length,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        rule: {
          condition: { type: "BOOLEAN" },
          strict: true,
        },
      },
    });
  }

  return reqs;
}

function buildInstructionsContent(sheetId: number, config: TemplateConfig): SheetRequest[] {
  const lines: string[] = [
    `Attribute Template — ${config.clientName}`,
    `Generated: ${config.generatedDate}`,
    "",
    "How to fill:",
    "1. Go to each category tab.",
    "2. Fill the highlighted cells per product.",
    "3. Use dropdowns where available — if your value isn't listed, type it anyway.",
    "4. Pre-filled grey cells are from your catalog — verify but do not delete.",
    "",
    "Color legend:",
    "  Red    — Required (Amazon rejects listings without these)",
    "  Orange — Conditionally Required",
    "  Purple — Key (our team flagged these)",
    "  Blue   — Recommended",
    "  Grey   — Pre-filled, read-only",
    "",
    "When you're done, notify your 1o8 account manager — we'll review and push to your catalog.",
  ];
  return [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
        rows: lines.map((text) => ({
          values: [{ userEnteredValue: { stringValue: text } }],
        })),
        fields: "userEnteredValue",
      },
    },
  ];
}

function buildCategoryHeaderAndData(
  sheetId: number,
  sheet: TemplateCategorySheet,
  sorted: AttributeCategoryRow[],
  config: TemplateConfig,
  leadCols: number
): SheetRequest[] {
  const reqs: SheetRequest[] = [];
  // Width of the grid in cells: optional Product Name/ASIN lead cols + attrs.
  const totalCols = leadCols + sorted.length;

  // Row 0: title (merged A:end)
  reqs.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: `${sheet.productType} — Attribute Template` },
              userEnteredFormat: {
                backgroundColor: BRAND_GOLD,
                textFormat: { bold: true, fontSize: 14 },
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
    },
  });
  // Split the title merge at the frozen-column boundary (Sheets rejects
  // a single merge that spans frozen + non-frozen columns). The frozen
  // boundary is always FROZEN_COLUMN_COUNT in both layouts.
  const frozenBoundary = FROZEN_COLUMN_COUNT;
  if (frozenBoundary > 0 && frozenBoundary <= totalCols) {
    reqs.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: Math.min(frozenBoundary, totalCols) },
        mergeType: "MERGE_ALL",
      },
    });
  }
  if (totalCols > frozenBoundary) {
    reqs.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: frozenBoundary, endColumnIndex: totalCols },
        mergeType: "MERGE_ALL",
      },
    });
  }

  // Row 2: group labels — one merged cell per contiguous group in cols leadCols+
  if (sorted.length > 0) {
    const groupCells: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [];
    for (let i = 0; i < leadCols; i++) {
      groupCells.push({ userEnteredValue: { stringValue: "" }, userEnteredFormat: { backgroundColor: GROUP_BG } });
    }
    for (const attr of sorted) {
      groupCells.push({
        userEnteredValue: { stringValue: attr.referenceGroup },
        userEnteredFormat: {
          backgroundColor: GROUP_BG,
          textFormat: { bold: true, foregroundColor: WHITE },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
        },
      });
    }
    reqs.push({
      updateCells: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: totalCols },
        rows: [{ values: groupCells }],
        fields:
          "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat," +
          "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
      },
    });
    // Split any group span that crosses col FROZEN_COLUMN_COUNT into two
    // merges. The Sheets API rejects merges that cross frozen columns. The
    // identity-headers case puts cols 0..3 in an empty-referenceGroup span;
    // this split keeps the merge ranges valid. Done unconditionally because
    // a future caller may emit identity rows with a non-empty group.
    // Merge contiguous group spans (start at leadCols to respect frozen boundary).
    // When leadCols < frozenBoundary (identity-headers mode: leadCols=0,
    // frozenBoundary=2) attrs straddle the frozen boundary, so we split any
    // span that crosses it into two merges.
    let spanStart = leadCols;
    for (let i = 1; i <= sorted.length; i++) {
      const prev = sorted[i - 1].referenceGroup;
      const cur = i < sorted.length ? sorted[i].referenceGroup : null;
      if (cur !== prev) {
        const spanEnd = leadCols + i;
        const emitMerge = (start: number, end: number) => {
          if (end - start > 1) {
            reqs.push({
              mergeCells: {
                range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: start, endColumnIndex: end },
                mergeType: "MERGE_ALL",
              },
            });
          }
        };
        if (spanStart < frozenBoundary && spanEnd > frozenBoundary) {
          emitMerge(spanStart, frozenBoundary);
          emitMerge(frozenBoundary, spanEnd);
        } else {
          emitMerge(spanStart, spanEnd);
        }
        spanStart = spanEnd;
      }
    }
  }

  // Row 3: requirement level labels — tinted per attribute
  if (sorted.length > 0) {
    const reqCells: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [];
    for (let i = 0; i < leadCols; i++) {
      reqCells.push({ userEnteredValue: { stringValue: "" }, userEnteredFormat: {} });
    }
    for (const attr of sorted) {
      const effReq = attr.isKey ? "Key" : (attr.requirement ?? "Optional");
      reqCells.push({
        userEnteredValue: { stringValue: effReq },
        userEnteredFormat: {
          backgroundColor: getTintColor(effReq),
          textFormat: { bold: true, fontSize: 9 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
        },
      });
    }
    reqs.push({
      updateCells: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: totalCols },
        rows: [{ values: reqCells }],
        fields:
          "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat," +
          "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
      },
    });
  }

  // Row 4 (index): attribute name headers — wrap text + centered alignment
  const headerFormat = {
    backgroundColor: HEADER_BG,
    textFormat: { bold: true, foregroundColor: WHITE },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    wrapStrategy: "WRAP",
  };
  const headerRow: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [];
  if (!sheet.useIdentityHeaders) {
    headerRow.push({ userEnteredValue: { stringValue: "Product Name" }, userEnteredFormat: headerFormat });
    headerRow.push({ userEnteredValue: { stringValue: "ASIN" }, userEnteredFormat: headerFormat });
  }
  for (const attr of sorted) {
    headerRow.push({
      userEnteredValue: { stringValue: attr.generalLabel },
      userEnteredFormat: headerFormat,
    });
  }
  reqs.push({
    updateCells: {
      range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: totalCols },
      rows: [{ values: headerRow }],
      fields:
        "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat," +
        "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
    },
  });

  // Data rows (row 5+) — clip overflow so values don't bleed into the next cell
  const dataRows = sheet.products.map((p) => {
    const vals: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [];
    if (!sheet.useIdentityHeaders) {
      vals.push({ userEnteredValue: { stringValue: p.name }, userEnteredFormat: { backgroundColor: READ_ONLY_BG, wrapStrategy: "CLIP" } });
      vals.push({ userEnteredValue: { stringValue: p.asin }, userEnteredFormat: { backgroundColor: READ_ONLY_BG, wrapStrategy: "CLIP" } });
    }
    for (const attr of sorted) {
      const key = attr.generalLabel;
      const val = p.values[key] ?? "";
      const effReq = attr.isKey ? "Key" : (attr.requirement ?? "Optional");
      const bg = val ? PREFILLED_BG : getTintColor(effReq);
      vals.push({
        userEnteredValue: { stringValue: val },
        userEnteredFormat: { backgroundColor: bg, wrapStrategy: "CLIP" },
      });
    }
    return { values: vals };
  });
  if (dataRows.length > 0) {
    reqs.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 5,
          endRowIndex: 5 + dataRows.length,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        rows: dataRows,
        fields: "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.wrapStrategy",
      },
    });
  }

  return reqs;
}
