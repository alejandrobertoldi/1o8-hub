# Attribute Template Workbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat XLSX template generator with a styled, client-friendly Excel workbook featuring grouped columns, color-coded requirement bands, and dropdown validation for constrained attributes.

**Architecture:** Rewrite `POST /api/attributes/template` to use ExcelJS instead of SheetJS. Add `hideFromTemplate` column to `category_attributes`. Enhance the admin UI toggle and template dialog to support the new column and multi-category generation.

**Tech Stack:** ExcelJS (generation), SheetJS (existing XLSM parsing stays), Drizzle ORM, Next.js API routes, React/shadcn UI

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `drizzle/migrations/0040_attribute_hide_from_template.sql` | DB migration for `hide_from_template` column |
| Modify | `src/lib/db/schema.ts:477-501` | Add `hideFromTemplate` field to `categoryAttributes` |
| Create | `src/lib/template-workbook-builder.ts` | ExcelJS workbook generation logic (core engine) |
| Modify | `src/app/api/attributes/template/route.ts` | Rewrite to use builder, support `productType: 'all'` |
| Modify | `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts` | Accept `hideFromTemplate` in PATCH body |
| Modify | `src/components/admin/category-attributes.tsx:654-747` | Add hide toggle to `AttributeRow` |
| Modify | `src/components/attributes/template-dialog.tsx:197-215` | Add "All categories" option to category dropdown |

---

### Task 1: DB Migration + Schema

**Files:**
- Create: `drizzle/migrations/0040_attribute_hide_from_template.sql`
- Modify: `src/lib/db/schema.ts:477-501`

- [ ] **Step 1: Create the migration file**

```sql
-- 0040_attribute_hide_from_template.sql
ALTER TABLE category_attributes
  ADD COLUMN hide_from_template boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Run the migration**

Run: `psql "$DATABASE_URL" -f drizzle/migrations/0040_attribute_hide_from_template.sql`
Expected: `ALTER TABLE` success

- [ ] **Step 3: Update the Drizzle schema**

In `src/lib/db/schema.ts`, inside the `categoryAttributes` table definition, add `hideFromTemplate` after `isKey` (line 493):

```ts
    isKey: boolean("is_key").notNull().default(false),
    hideFromTemplate: boolean("hide_from_template").notNull().default(false),
```

- [ ] **Step 4: Verify the build**

Run: `npx next build 2>&1 | head -30`
Expected: Build succeeds (or only pre-existing warnings)

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/0040_attribute_hide_from_template.sql src/lib/db/schema.ts
git commit -m "feat(attributes): add hide_from_template column to category_attributes"
```

---

### Task 2: Install ExcelJS

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install exceljs**

Run: `npm install exceljs`
Expected: added 1 package (exceljs has minimal deps)

- [ ] **Step 2: Verify import works**

Run: `node -e "const ExcelJS = require('exceljs'); console.log('ExcelJS version:', ExcelJS.Workbook ? 'OK' : 'FAIL')"`
Expected: `ExcelJS version: OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add exceljs for styled template generation"
```

---

### Task 3: Template Workbook Builder

This is the core engine. Creates a styled multi-sheet Excel workbook.

**Files:**
- Create: `src/lib/template-workbook-builder.ts`

- [ ] **Step 1: Create the builder file with types and main function**

```ts
import ExcelJS from "exceljs";
import type { CategoryAttribute } from "@/lib/db/schema";

// ─── Types ──────────────────────────────────────────────────────────

export interface TemplateProduct {
  name: string;
  asin: string;
  values: Record<string, string>; // bibleFieldMatch → current value
}

export interface TemplateCategorySheet {
  productType: string;
  attributes: CategoryAttribute[];
  products: TemplateProduct[];
}

export interface TemplateConfig {
  clientName: string;
  generatedDate: string;
  sheets: TemplateCategorySheet[];
}

// ─── Color System ───────────────────────────────────────────────────

const COLORS = {
  brandGold: "FFE8A700",
  brandGoldText: "FF000000",
  groupHeader: "FF4A3D8F",
  groupHeaderText: "FFFFFFFF",
  headerRow: "FF333333",
  headerRowText: "FFFFFFFF",
  metaRow: "FFF5F5F5",
  metaRowText: "FF666666",
  readOnly: "FFE8E8E8",
  preFilled: "FFF0F0F0",
  reqBadge: "FFDC3545",
  reqTint: "FFFFF0F0",
  condBadge: "FFFF8C00",
  condTint: "FFFFF8F0",
  keyBadge: "FF7C3AED",
  keyTint: "FFF5F0FF",
  recBadge: "FF3B82F6",
  recTint: "FFF0F5FF",
} as const;

const REQ_PRIORITY: Record<string, number> = {
  Required: 0,
  "Conditionally Required": 1,
  Key: 2,
  Recommended: 3,
  Optional: 4,
};

// ─── Main Builder ───────────────────────────────────────────────────

export async function buildTemplateWorkbook(
  config: TemplateConfig
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "1o8Hub";
  wb.created = new Date();

  // 1. Instructions sheet
  addInstructionsSheet(wb, config);

  // 2. Category sheets
  for (const sheet of config.sheets) {
    addCategorySheet(wb, config, sheet);
  }

  // 3. Valid Values sheet (hidden)
  addValidValuesSheet(wb, config.sheets);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

- [ ] **Step 2: Add the Instructions sheet builder**

Append to the same file:

```ts
// ─── Instructions Sheet ─────────────────────────────────────────────

function addInstructionsSheet(wb: ExcelJS.Workbook, config: TemplateConfig) {
  const ws = wb.addWorksheet("Instructions", { properties: { tabColor: { argb: COLORS.brandGold } } });
  ws.columns = [{ width: 20 }, { width: 60 }];

  // Title
  ws.mergeCells("A1:B1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "Attribute Template — Instructions";
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.brandGoldText } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandGold } };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 36;

  // Meta
  ws.mergeCells("A2:B2");
  const metaCell = ws.getCell("A2");
  metaCell.value = `Client: ${config.clientName} | Generated: ${config.generatedDate}`;
  metaCell.font = { size: 10, color: { argb: COLORS.metaRowText } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.metaRow } };

  // Color legend
  let row = 4;
  ws.getCell(`A${row}`).value = "Color Legend";
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row++;

  const legend: [string, string, string][] = [
    ["Red-tinted cell", COLORS.reqTint, "Required — must be filled for Amazon listing"],
    ["Orange-tinted cell", COLORS.condTint, "Conditionally Required — fill if applicable to your product"],
    ["Purple-tinted cell", COLORS.keyTint, "Key — our team flagged this as important for your category"],
    ["Blue-tinted cell", COLORS.recTint, "Recommended — improves listing quality"],
    ["Grey cell", COLORS.readOnly, "Pre-filled — verify but don't delete"],
  ];

  for (const [label, color, meaning] of legend) {
    const labelCell = ws.getCell(`A${row}`);
    labelCell.value = label;
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    labelCell.font = { size: 10 };
    ws.getCell(`B${row}`).value = meaning;
    ws.getCell(`B${row}`).font = { size: 10 };
    row++;
  }

  // How to fill
  row += 1;
  ws.getCell(`A${row}`).value = "How to Fill";
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row++;

  const instructions = [
    "Type values in highlighted (colored) cells.",
    "Use dropdown menus where available — click the cell, then the arrow.",
    "If a dropdown doesn't have your value, type it manually and highlight the cell yellow.",
    "Grey cells contain data from your current catalog — verify but don't remove.",
  ];
  for (const text of instructions) {
    ws.getCell(`A${row}`).value = `•`;
    ws.getCell(`B${row}`).value = text;
    ws.getCell(`B${row}`).font = { size: 10 };
    row++;
  }

  // Do's and Don'ts
  row += 1;
  ws.getCell(`A${row}`).value = "Do's and Don'ts";
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row++;

  const donts = [
    "Don't modify or delete the header rows (rows 1–5).",
    "Don't add or remove columns.",
    "You may add product rows at the bottom for additional products.",
    "Don't change the sheet names.",
  ];
  for (const text of donts) {
    ws.getCell(`A${row}`).value = `•`;
    ws.getCell(`B${row}`).value = text;
    ws.getCell(`B${row}`).font = { size: 10 };
    row++;
  }

  // Return instructions
  row += 1;
  ws.mergeCells(`A${row}:B${row}`);
  ws.getCell(`A${row}`).value = "When done, save the file and send it back to your 1o8 account manager.";
  ws.getCell(`A${row}`).font = { bold: true, size: 11 };
}
```

- [ ] **Step 3: Add the Category sheet builder**

Append to the same file:

```ts
// ─── Category Sheet ─────────────────────────────────────────────────

function addCategorySheet(
  wb: ExcelJS.Workbook,
  config: TemplateConfig,
  sheet: TemplateCategorySheet
) {
  const sheetName = sheet.productType.slice(0, 31);
  const ws = wb.addWorksheet(sheetName, { properties: { tabColor: { argb: COLORS.groupHeader } } });

  // Sort attributes: group by groupName (preserving original sort order), then by requirement priority within each group
  const sorted = [...sheet.attributes].sort((a, b) => {
    if (a.groupName !== b.groupName) return a.sortOrder - b.sortOrder;
    const reqA = a.isKey ? "Key" : a.requirement;
    const reqB = b.isKey ? "Key" : b.requirement;
    return (REQ_PRIORITY[reqA] ?? 4) - (REQ_PRIORITY[reqB] ?? 4);
  });

  // Build group spans for merged headers
  const groups: { name: string; startCol: number; count: number }[] = [];
  let currentGroup = "";
  for (let i = 0; i < sorted.length; i++) {
    const attr = sorted[i];
    if (attr.groupName !== currentGroup) {
      currentGroup = attr.groupName;
      groups.push({ name: currentGroup, startCol: i + 3, count: 0 }); // +3 because cols A,B are product/ASIN
    }
    groups[groups.length - 1].count++;
  }

  const totalCols = sorted.length + 2; // +2 for Product Name + ASIN

  // ─── Row 1: Title ─────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${sheet.productType} — Attribute Template`;
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.brandGoldText } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandGold } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 30;

  // ─── Row 2: Metadata ──────────────────────────────────────────
  ws.mergeCells(2, 1, 2, totalCols);
  const metaCell = ws.getCell(2, 1);
  metaCell.value = `Client: ${config.clientName} | Generated: ${config.generatedDate} | Fill the highlighted cells`;
  metaCell.font = { size: 10, color: { argb: COLORS.metaRowText } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.metaRow } };

  // ─── Row 3: Group headers (merged) ────────────────────────────
  // First two columns blank for row 3
  ws.getCell(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };
  ws.getCell(3, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };

  for (const group of groups) {
    if (group.count > 1) {
      ws.mergeCells(3, group.startCol, 3, group.startCol + group.count - 1);
    }
    const cell = ws.getCell(3, group.startCol);
    cell.value = group.name;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.groupHeaderText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.groupHeader } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // ─── Row 4: Requirement badges ────────────────────────────────
  ws.getCell(4, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };
  ws.getCell(4, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };

  for (let i = 0; i < sorted.length; i++) {
    const attr = sorted[i];
    const effectiveReq = attr.isKey ? "Key" : attr.requirement;
    const col = i + 3;
    const cell = ws.getCell(4, col);

    const { label, badgeColor, tintColor } = getReqStyle(effectiveReq);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: badgeColor } };
    cell.alignment = { horizontal: "center" };
  }

  // ─── Row 5: Attribute names ───────────────────────────────────
  ws.getCell(5, 1).value = "Product Name";
  ws.getCell(5, 1).font = { bold: true, size: 10, color: { argb: COLORS.headerRowText } };
  ws.getCell(5, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };

  ws.getCell(5, 2).value = "ASIN";
  ws.getCell(5, 2).font = { bold: true, size: 10, color: { argb: COLORS.headerRowText } };
  ws.getCell(5, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };

  for (let i = 0; i < sorted.length; i++) {
    const col = i + 3;
    const cell = ws.getCell(5, col);
    cell.value = sorted[i].localLabel;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.headerRowText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerRow } };
    cell.alignment = { wrapText: true };
  }

  // Freeze panes at row 5
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];

  // ─── Column widths ────────────────────────────────────────────
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 15;
  for (let i = 0; i < sorted.length; i++) {
    ws.getColumn(i + 3).width = 20;
  }

  // ─── Data rows (row 6+) ──────────────────────────────────────
  for (let p = 0; p < sheet.products.length; p++) {
    const product = sheet.products[p];
    const rowNum = p + 6;

    // Product name (read-only)
    const nameCell = ws.getCell(rowNum, 1);
    nameCell.value = product.name;
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.readOnly } };
    nameCell.font = { size: 10 };

    // ASIN (read-only)
    const asinCell = ws.getCell(rowNum, 2);
    asinCell.value = product.asin;
    asinCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.readOnly } };
    asinCell.font = { size: 10, color: { argb: "FF666666" } };

    // Attribute values
    for (let i = 0; i < sorted.length; i++) {
      const attr = sorted[i];
      const col = i + 3;
      const cell = ws.getCell(rowNum, col);
      const value = attr.bibleFieldMatch ? (product.values[attr.bibleFieldMatch] || "") : "";
      const effectiveReq = attr.isKey ? "Key" : attr.requirement;

      if (value) {
        cell.value = value;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.preFilled } };
      } else {
        const { tintColor } = getReqStyle(effectiveReq);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tintColor } };
      }
      cell.font = { size: 10 };
    }
  }

}

function getReqStyle(requirement: string): { label: string; badgeColor: string; tintColor: string } {
  switch (requirement) {
    case "Required":
      return { label: "REQ", badgeColor: COLORS.reqBadge, tintColor: COLORS.reqTint };
    case "Conditionally Required":
      return { label: "COND", badgeColor: COLORS.condBadge, tintColor: COLORS.condTint };
    case "Key":
      return { label: "KEY", badgeColor: COLORS.keyBadge, tintColor: COLORS.keyTint };
    case "Recommended":
      return { label: "REC", badgeColor: COLORS.recBadge, tintColor: COLORS.recTint };
    default:
      return { label: "OPT", badgeColor: "FF999999", tintColor: "FFF5F5F5" };
  }
}
```

- [ ] **Step 4: Add the Valid Values sheet builder with data validation wiring**

Append to the same file:

```ts
// ─── Valid Values Sheet (Hidden) ────────────────────────────────────

function addValidValuesSheet(wb: ExcelJS.Workbook, sheets: TemplateCategorySheet[]) {
  const ws = wb.addWorksheet("Valid Values", { state: "hidden" });

  // Collect all unique constrained attributes across all category sheets
  // Track which column index in Valid Values corresponds to which attribute
  const validValueColumns: { sheetName: string; attrLabel: string; values: string[] }[] = [];

  for (const sheet of sheets) {
    for (const attr of sheet.attributes) {
      if (attr.validValues && attr.validValues.length > 0) {
        validValueColumns.push({
          sheetName: sheet.productType.slice(0, 31),
          attrLabel: attr.localLabel,
          values: attr.validValues,
        });
      }
    }
  }

  // Write valid values as columns
  for (let c = 0; c < validValueColumns.length; c++) {
    const col = c + 1;
    const { attrLabel, values } = validValueColumns[c];

    // Header
    ws.getCell(1, col).value = attrLabel;
    ws.getCell(1, col).font = { bold: true, size: 9 };

    // Values
    for (let r = 0; r < values.length; r++) {
      ws.getCell(r + 2, col).value = values[r];
    }

    ws.getColumn(col).width = 20;
  }

  // Now wire up data validation on each category sheet
  let vvColIndex = 0;
  for (const sheet of sheets) {
    const sheetName = sheet.productType.slice(0, 31);
    const categoryWs = wb.getWorksheet(sheetName);
    if (!categoryWs) continue;

    // Re-sort attributes same way as addCategorySheet to get correct column positions
    const sorted = [...sheet.attributes].sort((a, b) => {
      if (a.groupName !== b.groupName) return a.sortOrder - b.sortOrder;
      const reqA = a.isKey ? "Key" : a.requirement;
      const reqB = b.isKey ? "Key" : b.requirement;
      return (REQ_PRIORITY[reqA] ?? 4) - (REQ_PRIORITY[reqB] ?? 4);
    });

    for (let i = 0; i < sorted.length; i++) {
      const attr = sorted[i];
      if (!attr.validValues || attr.validValues.length === 0) continue;

      const dataCol = i + 3; // +2 for Product Name + ASIN, +1 for 1-based
      const vvCol = vvColIndex + 1; // 1-based column in Valid Values sheet
      const vvColLetter = getExcelColLetter(vvCol);
      const lastValueRow = attr.validValues.length + 1; // +1 for header

      // Apply data validation to all product rows (row 6 to row 6+productCount-1)
      const productCount = Math.max(sheet.products.length, 1);
      const firstDataRow = 6;
      const lastDataRow = firstDataRow + productCount - 1;

      for (let r = firstDataRow; r <= lastDataRow; r++) {
        categoryWs.getCell(r, dataCol).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`'Valid Values'!$${vvColLetter}$2:$${vvColLetter}$${lastValueRow}`],
          showErrorMessage: true,
          errorTitle: "Invalid Value",
          error: "Please select from the dropdown list. If your value isn't listed, type it and highlight the cell in yellow.",
          errorStyle: "warning",
        };
      }

      vvColIndex++;
    }
  }
}

function getExcelColLetter(col: number): string {
  let letter = "";
  let num = col;
  while (num > 0) {
    const mod = (num - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}
```

- [ ] **Step 5: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/template-workbook-builder.ts 2>&1 | head -20`

If there are import issues (ExcelJS types), check with:
Run: `node -e "import('exceljs').then(m => console.log('OK'))"`

- [ ] **Step 6: Commit**

```bash
git add src/lib/template-workbook-builder.ts
git commit -m "feat(attributes): add ExcelJS template workbook builder with styling and dropdowns"
```

---

### Task 4: Rewrite the Template API Route

**Files:**
- Modify: `src/app/api/attributes/template/route.ts`

- [ ] **Step 1: Rewrite the route to use the builder**

Replace the entire contents of `src/app/api/attributes/template/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  categoryAttributes,
  master,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import {
  buildTemplateWorkbook,
  type TemplateConfig,
  type TemplateCategorySheet,
  type TemplateProduct,
} from "@/lib/template-workbook-builder";
import { CLIENT_NAMES } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode, productType, scope, levels } = await req.json();

  if (!clientIdCode || !productType || !scope || !levels?.length) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Determine which definitions to process
  let defs: (typeof categoryDefinitions.$inferSelect)[];

  if (productType === "all") {
    defs = await db
      .select()
      .from(categoryDefinitions)
      .where(eq(categoryDefinitions.clientIdCode, clientIdCode));

    if (defs.length === 0) {
      return NextResponse.json(
        { error: "No category definitions found for this client" },
        { status: 404 }
      );
    }
  } else {
    const [def] = await db
      .select()
      .from(categoryDefinitions)
      .where(
        and(
          eq(categoryDefinitions.clientIdCode, clientIdCode),
          eq(categoryDefinitions.productType, productType)
        )
      )
      .limit(1);

    if (!def) {
      return NextResponse.json(
        { error: "Category definition not found" },
        { status: 404 }
      );
    }
    defs = [def];
  }

  // Build sheets for each definition
  const sheets: TemplateCategorySheet[] = [];

  for (const def of defs) {
    // Get attributes matching selected levels, excluding hidden
    const attrs = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.definitionId, def.id))
      .orderBy(categoryAttributes.sortOrder);

    const filteredAttrs = attrs.filter((a) => {
      if (!a.bibleFieldMatch) return false;
      if (a.hideFromTemplate) return false;
      if (levels.includes(a.requirement)) return true;
      if (levels.includes("Key") && a.isKey) return true;
      return false;
    });

    if (filteredAttrs.length === 0) continue;

    // Get products
    let products: TemplateProduct[] = [];

    if (scope === "new") {
      // 10 blank rows for new product launches
      products = Array.from({ length: 10 }, () => ({
        name: "",
        asin: "",
        values: {},
      }));
    } else {
      let dbProducts = await db
        .select()
        .from(master)
        .where(
          and(
            eq(master.clientIdCode, clientIdCode),
            eq(master.productType, def.productType)
          )
        );

      if (scope === "gaps") {
        dbProducts = dbProducts.filter((product) =>
          filteredAttrs.some((attr) => {
            const val = getProductFieldValue(product, attr.bibleFieldMatch!);
            return !val || val.trim() === "";
          })
        );
      }

      products = dbProducts.map((product) => {
        const values: Record<string, string> = {};
        for (const attr of filteredAttrs) {
          if (attr.bibleFieldMatch) {
            values[attr.bibleFieldMatch] =
              getProductFieldValue(product, attr.bibleFieldMatch) || "";
          }
        }
        return {
          name: getProductFieldValue(product, "ItemName") || "",
          asin: getProductFieldValue(product, "ASIN") || "",
          values,
        };
      });
    }

    sheets.push({
      productType: def.productType,
      attributes: filteredAttrs,
      products,
    });
  }

  if (sheets.length === 0) {
    return NextResponse.json(
      { error: "No attributes match the selected filters" },
      { status: 400 }
    );
  }

  const config: TemplateConfig = {
    clientName: CLIENT_NAMES[clientIdCode] || clientIdCode,
    generatedDate: new Date().toISOString().split("T")[0],
    sheets,
  };

  const buffer = await buildTemplateWorkbook(config);

  const filename =
    productType === "all"
      ? `attribute-template-${clientIdCode}-${config.generatedDate}.xlsx`
      : `attribute-template-${clientIdCode}-${productType}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Verify the build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Test manually**

Start dev server and use the existing template dialog to generate a template:
Run: `PORT=3000 npm run dev`

1. Go to `/attributes`, click "Generate Template"
2. Select a client + category + levels
3. Click "Download XLSX"
4. Open the file in Excel/Google Sheets — verify:
   - Instructions sheet exists with color legend
   - Category sheet has 5 header rows with styling
   - Group headers are merged
   - Requirement badges are color-coded
   - Data rows have correct tinting
   - Dropdown menus work on constrained fields

- [ ] **Step 4: Commit**

```bash
git add src/app/api/attributes/template/route.ts
git commit -m "feat(attributes): rewrite template route to use ExcelJS builder with styled output"
```

---

### Task 5: PATCH Endpoint — Accept hideFromTemplate

**Files:**
- Modify: `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts`

- [ ] **Step 1: Update the PATCH handler to accept hideFromTemplate**

In `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts`, replace lines 25-38:

```ts
  const body = await req.json();

  const updateData: { isKey?: boolean; hideFromTemplate?: boolean } = {};
  if (typeof body.isKey === "boolean") updateData.isKey = body.isKey;
  if (typeof body.hideFromTemplate === "boolean") updateData.hideFromTemplate = body.hideFromTemplate;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(categoryAttributes)
    .set(updateData)
    .where(eq(categoryAttributes.id, attrId))
    .returning({
      id: categoryAttributes.id,
      isKey: categoryAttributes.isKey,
      hideFromTemplate: categoryAttributes.hideFromTemplate,
    });

  if (!updated) {
    return NextResponse.json({ error: "Attribute not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...updated });
```

- [ ] **Step 2: Verify the build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/category-definitions/[productType]/attributes/[id]/route.ts
git commit -m "feat(attributes): accept hideFromTemplate in PATCH endpoint"
```

---

### Task 6: Admin UI — Hide Toggle

**Files:**
- Modify: `src/components/admin/category-attributes.tsx:59-70, 491-547, 654-747`

- [ ] **Step 1: Add hideFromTemplate to the CategoryAttributeData type**

In `src/components/admin/category-attributes.tsx`, find the `CategoryAttributeData` interface (line 58) and add the field after `isKey`:

```ts
  isKey: boolean;
  hideFromTemplate: boolean;
```

- [ ] **Step 2: Add the hide toggle mutation to ExpandedAttributes**

In the `ExpandedAttributes` component (~line 525), after the `keyToggleMutation`, add:

```ts
  const hideToggleMutation = useMutation({
    mutationFn: async ({ attrId, hideFromTemplate }: { attrId: number; hideFromTemplate: boolean }) => {
      const res = await fetch(
        `/api/category-definitions/${encodeURIComponent(def.productType)}/attributes/${attrId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hideFromTemplate }),
        }
      );
      if (!res.ok) throw new Error("Failed to toggle visibility");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["category-definition", def.productType, def.clientIdCode],
      });
    },
    onError: () => toast.error("Failed to toggle template visibility"),
  });
```

- [ ] **Step 3: Pass the hide toggle to AttributeGroupRow and AttributeRow**

Update the `AttributeGroupRow` rendering (~line 594) to pass the new callback:

```tsx
          <AttributeGroupRow
            key={group.name}
            group={group}
            onToggleKey={(attrId, isKey) =>
              keyToggleMutation.mutate({ attrId, isKey })
            }
            onToggleHide={(attrId, hide) =>
              hideToggleMutation.mutate({ attrId, hideFromTemplate: hide })
            }
          />
```

Update the `AttributeGroupRow` props and pass-through (~line 607):

```ts
function AttributeGroupRow({
  group,
  onToggleKey,
  onToggleHide,
}: {
  group: CategoryGroup;
  onToggleKey: (attrId: number, isKey: boolean) => void;
  onToggleHide: (attrId: number, hide: boolean) => void;
}) {
```

And inside its render, update the `AttributeRow`:

```tsx
            <AttributeRow
              key={attr.amazonFieldName}
              attr={attr}
              onToggleKey={onToggleKey}
              onToggleHide={onToggleHide}
            />
```

- [ ] **Step 4: Add the EyeOff toggle button to AttributeRow**

Add `EyeOff` to the lucide-react imports at the top of the file (line 40):

```ts
import {
  Upload,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Package,
  Check,
  Minus,
  Info,
  Star,
  EyeOff,
} from "lucide-react";
```

Update the `AttributeRow` component props (~line 654):

```ts
function AttributeRow({
  attr,
  onToggleKey,
  onToggleHide,
}: {
  attr: CategoryAttributeData;
  onToggleKey: (attrId: number, isKey: boolean) => void;
  onToggleHide: (attrId: number, hide: boolean) => void;
}) {
```

After the Star (key toggle) button (~line 703), add the hide toggle button:

```tsx
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide(attr.id, !attr.hideFromTemplate);
          }}
          className={`shrink-0 p-1 rounded transition-all ${
            attr.hideFromTemplate
              ? "text-red-400 hover:text-red-300"
              : "text-muted-foreground/20 hover:text-red-400/50"
          }`}
          title={attr.hideFromTemplate ? "Show in template" : "Hide from template"}
        >
          <EyeOff className={`h-3 w-3 ${attr.hideFromTemplate ? "opacity-100" : "opacity-40"}`} />
        </button>
```

Add a dimming effect to the entire attribute row when hidden. In the outer `<div>` of `AttributeRow` (~line 664), add conditional opacity:

```tsx
    <div className={`text-xs ${attr.hideFromTemplate ? "opacity-40" : ""}`}>
```

- [ ] **Step 5: Verify the build and test visually**

Run: `PORT=3000 npm run dev`

1. Go to `/admin/attributes`
2. Expand a category definition → expand a group
3. Verify each attribute row now shows:
   - Star icon (key toggle) — existing
   - EyeOff icon (hide toggle) — new
4. Click EyeOff on an attribute → row dims, icon turns red
5. Click again → row restores
6. Generate a template → verify hidden attribute is excluded

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/category-attributes.tsx
git commit -m "feat(attributes): add hide-from-template toggle in admin attribute browser"
```

---

### Task 7: Template Dialog — "All Categories" Option

**Files:**
- Modify: `src/components/attributes/template-dialog.tsx:197-215`

- [ ] **Step 1: Add "All categories" option to the category dropdown**

In `src/components/attributes/template-dialog.tsx`, find the Category `<Select>` (~line 199). Update the `<SelectContent>` to include an "All categories" option:

```tsx
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {definitions.map((d) => (
                  <SelectItem key={d.productType} value={d.productType}>
                    {d.productType}
                  </SelectItem>
                ))}
              </SelectContent>
```

- [ ] **Step 2: Update the download filename for "all" case**

In the `onSuccess` handler of `downloadMutation` (~line 117), update the filename:

```ts
      a.download = productType === "all"
        ? `attribute-template-${client}-${new Date().toISOString().split("T")[0]}.xlsx`
        : `attribute-template-${client}-${productType}.xlsx`;
```

- [ ] **Step 3: Verify the build and test**

Run: `PORT=3000 npm run dev`

1. Go to `/attributes`, click "Generate Template"
2. Select a client
3. Verify "All categories" appears as first option in the category dropdown
4. Select "All categories" → download → verify workbook has multiple category sheets (one per definition)
5. Select a specific category → download → verify single category sheet

- [ ] **Step 4: Commit**

```bash
git add src/components/attributes/template-dialog.tsx
git commit -m "feat(attributes): add 'All categories' option for multi-category template generation"
```

---

### Task 8: Ensure category-definitions API returns hideFromTemplate

**Files:**
- Check: `src/app/api/category-definitions/[productType]/route.ts`

- [ ] **Step 1: Verify the GET endpoint returns hideFromTemplate**

Read `src/app/api/category-definitions/[productType]/route.ts` and check if it does a `select()` (all columns) or selects specific columns. If it uses `select()` with no arguments, `hideFromTemplate` will be included automatically since we added it to the schema. If it selects specific columns, add `hideFromTemplate`.

- [ ] **Step 2: Verify by hitting the endpoint**

Run: `curl -s http://localhost:3000/api/category-definitions/SHIRT?clientIdCode=<TEST_CLIENT> | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.groups?.[0]?.attributes?.[0]?.hideFromTemplate)})"`

Expected: `false` (the default value)

- [ ] **Step 3: Commit if changes were needed**

```bash
git add src/app/api/category-definitions/[productType]/route.ts
git commit -m "fix(attributes): include hideFromTemplate in category definition API response"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full E2E test**

Run: `PORT=3000 npm run dev`

Test the complete flow:
1. `/admin/attributes` → expand a definition → toggle Key on 2 attributes → toggle Hide on 1 attribute
2. `/attributes` → "Generate Template" → select client + "All categories" + "With gaps" + Required/Cond/Key
3. Download XLSX → open in Excel or Google Sheets
4. Verify:
   - Instructions sheet with color legend
   - One sheet per category
   - Attributes grouped by Amazon group with merged headers
   - Within groups, sorted by requirement priority (REQ → COND → KEY)
   - Requirement badges color-coded in row 4
   - Pre-filled values in grey cells
   - Empty cells tinted by requirement level
   - Dropdown menus on constrained attributes (click a cell with valid values)
   - Hidden attributes are NOT in the sheet
   - Key-flagged attributes show "KEY" badge
   - Freeze pane locks first 5 rows + first 2 columns

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Commit any final fixes, then push**

```bash
git push origin main
```
