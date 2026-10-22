# Attribute Audit & Template System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an attribute audit system that scans products against category definitions to surface gaps, lets admins tag "Key" attributes, generates XLSX templates for clients, and provides a portal form for clients to fill gaps directly.

**Architecture:** Extends the existing `category_definitions` + `category_attributes` tables with an `is_key` flag and two new tables (`product_key_overrides`, `attribute_template_requests`). New API endpoints compute audit gaps by joining category attributes against product field values. A new `/attributes` page surfaces the audit dashboard; `/portal/attributes` provides a wizard form for clients. XLSX generation uses the existing SheetJS (`xlsx`) package.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM, PostgreSQL (Supabase), SheetJS, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query

---

## File Map

### Modified Files

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `isKey` to `categoryAttributes`, add `productKeyOverrides` + `attributeTemplateRequests` tables |
| `src/lib/constants.ts` | Add `"Key"` to `RequirementLevel` type, colors, labels, order |
| `src/hooks/use-category-definition.ts` | Add `isKey` to `CategoryAttributeData` type |
| `src/components/admin/category-attributes.tsx` | Add Key toggle to `AttributeRow`, Key filter chip, key counter |
| `src/app/api/category-definitions/[productType]/route.ts` | Include `isKey` in attribute response |
| `src/components/products/product-detail-form.tsx` | Mount `AttributeHealthCard` above sections |
| `src/components/layout/app-sidebar.tsx` | Add "Attribute Audit" nav item under Catalog |
| `src/components/layout/portal-shell.tsx` | Add "Attributes" nav item for portal |
| `src/components/products/amazon-category-attributes.tsx` | Account for Key in `computeGroupStats` |
| `src/components/products/requirement-summary.tsx` | Add "Key" to `DISPLAY_ORDER` |

### New Files

| File | Purpose |
|------|---------|
| `drizzle/migrations/0039_attribute_audit_tables.sql` | Migration: `is_key` column + 2 new tables |
| `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts` | PATCH `is_key` toggle |
| `src/app/api/attributes/audit/route.ts` | GET audit gap data per client/category |
| `src/app/api/products/[id]/key-overrides/route.ts` | GET/POST/DELETE product-level key overrides |
| `src/app/api/attributes/template/route.ts` | POST generate XLSX download |
| `src/app/api/attributes/template-requests/route.ts` | POST create portal link |
| `src/app/api/attributes/template-requests/[id]/route.ts` | GET template request for portal |
| `src/app/attributes/page.tsx` | Audit dashboard page shell |
| `src/components/attributes/audit-dashboard.tsx` | Main audit component: client cards, category drill-down, product drill-down |
| `src/components/attributes/template-dialog.tsx` | Template generation dialog (XLSX + portal link) |
| `src/components/products/attribute-health-card.tsx` | Missing attributes alert card for product detail |
| `src/app/portal/attributes/page.tsx` | Portal form page shell |
| `src/components/portal/attribute-form.tsx` | Portal wizard: one product at a time, auto-save |

---

## Task 1: DB Migration & Schema

**Files:**
- Create: `drizzle/migrations/0039_attribute_audit_tables.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration SQL file**

```sql
-- 0039_attribute_audit_tables.sql

-- 1. Add is_key column to category_attributes
ALTER TABLE category_attributes ADD COLUMN is_key boolean NOT NULL DEFAULT false;

-- 2. Create product_key_overrides table
CREATE TABLE product_key_overrides (
  id serial PRIMARY KEY,
  product_id text NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  category_definition_id integer REFERENCES category_definitions(id) ON DELETE CASCADE,
  is_key boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, attribute_name)
);

CREATE INDEX idx_pko_product ON product_key_overrides(product_id);
CREATE INDEX idx_pko_definition ON product_key_overrides(category_definition_id);

-- 3. Create attribute_template_requests table
CREATE TABLE attribute_template_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code text NOT NULL,
  product_type text NOT NULL,
  scope text NOT NULL,
  levels text[] NOT NULL,
  product_ids text[],
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_atr_client ON attribute_template_requests(client_id_code);

-- 4. RLS policies
ALTER TABLE product_key_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_product_key_overrides" ON product_key_overrides FOR ALL TO anon USING (false);
CREATE POLICY "deny_auth_product_key_overrides" ON product_key_overrides FOR ALL TO authenticated USING (false);

ALTER TABLE attribute_template_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_attribute_template_requests" ON attribute_template_requests FOR ALL TO anon USING (false);
CREATE POLICY "deny_auth_attribute_template_requests" ON attribute_template_requests FOR ALL TO authenticated USING (false);
```

Write to: `drizzle/migrations/0039_attribute_audit_tables.sql`

- [ ] **Step 2: Add `isKey` to `categoryAttributes` in schema.ts**

In `src/lib/db/schema.ts`, add after the `sortOrder` field in `categoryAttributes`:

```typescript
isKey: boolean("is_key").notNull().default(false),
```

- [ ] **Step 3: Add `productKeyOverrides` table to schema.ts**

After the `categoryAttributes` table block (around line 500), add:

```typescript
// ─── Product Key Overrides ───────────────────────────────────────────
// Per-product override: editors can flag/unflag specific attributes as key.

export const productKeyOverrides = pgTable(
  "product_key_overrides",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    attributeName: text("attribute_name").notNull(),
    categoryDefinitionId: integer("category_definition_id").references(
      () => categoryDefinitions.id,
      { onDelete: "cascade" }
    ),
    isKey: boolean("is_key").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pko_product").on(table.productId),
    index("idx_pko_definition").on(table.categoryDefinitionId),
    unique("uq_pko_product_attr").on(table.productId, table.attributeName),
  ]
);
```

- [ ] **Step 4: Add `attributeTemplateRequests` table to schema.ts**

Immediately after `productKeyOverrides`:

```typescript
// ─── Attribute Template Requests ─────────────────────────────────────
// Records template generation events for portal links.

export const attributeTemplateRequests = pgTable(
  "attribute_template_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: text("client_id_code").notNull(),
    productType: text("product_type").notNull(),
    scope: text("scope").notNull(), // 'gaps' | 'all' | 'new'
    levels: text("levels").array().notNull(),
    productIds: text("product_ids").array(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_atr_client").on(table.clientIdCode)]
);
```

- [ ] **Step 5: Add type exports at end of schema.ts**

Find the existing `CategoryAttribute` type export block and add nearby:

```typescript
export type ProductKeyOverride = typeof productKeyOverrides.$inferSelect;
export type NewProductKeyOverride = typeof productKeyOverrides.$inferInsert;
export type AttributeTemplateRequest = typeof attributeTemplateRequests.$inferSelect;
export type NewAttributeTemplateRequest = typeof attributeTemplateRequests.$inferInsert;
```

- [ ] **Step 6: Run the migration**

```bash
cd /Users/manu/1o8Hub
node -e "
const { default: postgres } = require('postgres');
const fs = require('fs');
const sql = postgres(process.env.DATABASE_URL);
const migration = fs.readFileSync('drizzle/migrations/0039_attribute_audit_tables.sql', 'utf8');
sql.unsafe(migration).then(() => { console.log('Migration applied'); return sql.end(); }).catch(e => { console.error(e); sql.end(); process.exit(1); });
"
```

Expected: "Migration applied"

- [ ] **Step 7: Update constants.ts — add Key requirement level**

In `src/lib/constants.ts`, update the `RequirementLevel` type:

```typescript
export type RequirementLevel =
  | "Required"
  | "Conditionally Required"
  | "Key"
  | "Recommended"
  | "Optional"
  | "Not Required"
  | "";
```

Add to `REQUIREMENT_COLORS`:
```typescript
Key: "bg-purple-500/15 text-purple-400 border-purple-500/30",
```

Add to `REQUIREMENT_SHORT_LABELS`:
```typescript
Key: "Key",
```

Add to `REQUIREMENT_ORDER` (between Conditionally Required and Recommended):
```typescript
Key: 1.5,
```

- [ ] **Step 8: Update RequirementSummary display order**

In `src/components/products/requirement-summary.tsx`, add `"Key"` to `DISPLAY_ORDER`:

```typescript
const DISPLAY_ORDER: RequirementLevel[] = [
  "Required",
  "Conditionally Required",
  "Key",
  "Recommended",
  "Optional",
];
```

- [ ] **Step 9: Commit**

```bash
git add drizzle/migrations/0039_attribute_audit_tables.sql src/lib/db/schema.ts src/lib/constants.ts src/components/products/requirement-summary.tsx
git commit -m "feat(attributes): add is_key column, product_key_overrides, attribute_template_requests tables"
```

---

## Task 2: API Endpoints

**Files:**
- Modify: `src/app/api/category-definitions/[productType]/route.ts`
- Modify: `src/hooks/use-category-definition.ts`
- Create: `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts`
- Create: `src/app/api/attributes/audit/route.ts`
- Create: `src/app/api/products/[id]/key-overrides/route.ts`

### 2A: Include isKey in category definition response

- [ ] **Step 1: Update the GET handler in `src/app/api/category-definitions/[productType]/route.ts`**

The response currently maps attributes without `isKey`. Update the loop that builds `groupMap` entries to include it.

Find the object pushed into `groupMap.get(group)!.push({...})` and add `isKey`:

```typescript
groupMap.get(group)!.push({
  id: attr.id,
  localLabel: attr.localLabel,
  amazonFieldName: attr.amazonFieldName,
  description: attr.description,
  example: attr.example,
  requirement: attr.requirement,
  validValues: attr.validValues,
  bibleFieldMatch: attr.bibleFieldMatch,
  currentValue,
  sortOrder: attr.sortOrder,
  isKey: attr.isKey,
});
```

Also add `id` and `isKey` to the `groupMap` type annotation above the loop.

- [ ] **Step 2: Update `CategoryAttributeData` in `src/hooks/use-category-definition.ts`**

Add to the interface:

```typescript
interface CategoryAttributeData {
  id: number;
  localLabel: string;
  amazonFieldName: string;
  description: string | null;
  example: string | null;
  requirement: string;
  validValues: string[] | null;
  bibleFieldMatch: string | null;
  currentValue: string | null;
  sortOrder: number;
  isKey: boolean;
}
```

### 2B: PATCH is_key toggle endpoint

- [ ] **Step 3: Create `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryAttributes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productType: string; id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const attrId = parseInt(id, 10);
  if (isNaN(attrId)) {
    return NextResponse.json({ error: "Invalid attribute ID" }, { status: 400 });
  }

  const body = await req.json();
  const isKey = Boolean(body.isKey);

  const [updated] = await db
    .update(categoryAttributes)
    .set({ isKey })
    .where(eq(categoryAttributes.id, attrId))
    .returning({ id: categoryAttributes.id, isKey: categoryAttributes.isKey });

  if (!updated) {
    return NextResponse.json({ error: "Attribute not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: updated.id, isKey: updated.isKey });
}
```

### 2C: Audit endpoint

- [ ] **Step 4: Create `src/app/api/attributes/audit/route.ts`**

This is the core audit computation. It fetches category definitions, their required/key attributes, and checks product field values.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  categoryAttributes,
  productKeyOverrides,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";

interface AuditGap {
  attributeName: string;
  localLabel: string;
  requirement: string;
  isKey: boolean;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
}

interface ProductAudit {
  productId: string;
  productName: string;
  asin: string;
  gaps: AuditGap[];
}

interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  products?: ProductAudit[];
}

interface ClientAudit {
  clientIdCode: string;
  categories: CategoryAudit[];
  totalProducts: number;
  totalGaps: number;
  healthPercent: number;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const productType = req.nextUrl.searchParams.get("productType");
  const includeProducts = req.nextUrl.searchParams.get("includeProducts") === "true";

  // 1. Fetch category definitions
  const defFilter = clientIdCode
    ? eq(categoryDefinitions.clientIdCode, clientIdCode)
    : undefined;
  const defs = await db
    .select()
    .from(categoryDefinitions)
    .where(defFilter)
    .orderBy(categoryDefinitions.clientIdCode, categoryDefinitions.productType);

  const filteredDefs = productType
    ? defs.filter((d) => d.productType === productType)
    : defs;

  // 2. Build audit per client
  const clientMap = new Map<string, ClientAudit>();

  for (const def of filteredDefs) {
    // Get auditable attributes: Required, Conditionally Required, or isKey
    const attrs = await db
      .select()
      .from(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.definitionId, def.id),
          or(
            inArray(categoryAttributes.requirement, [
              "Required",
              "Conditionally Required",
            ]),
            eq(categoryAttributes.isKey, true)
          )
        )
      );

    // Only attributes with a bibleFieldMatch can be audited
    const auditableAttrs = attrs.filter((a) => a.bibleFieldMatch);
    if (auditableAttrs.length === 0) {
      // No auditable attrs — still report the category but no gaps
      if (!clientMap.has(def.clientIdCode)) {
        clientMap.set(def.clientIdCode, {
          clientIdCode: def.clientIdCode,
          categories: [],
          totalProducts: 0,
          totalGaps: 0,
          healthPercent: 100,
        });
      }
      clientMap.get(def.clientIdCode)!.categories.push({
        definitionId: def.id,
        productType: def.productType,
        totalAuditable: 0,
        productCount: 0,
        productsWithGaps: 0,
        gapBreakdown: { required: 0, conditional: 0, key: 0 },
        totalGaps: 0,
      });
      continue;
    }

    // Get products for this client + productType
    const products = await db
      .select()
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, def.clientIdCode),
          eq(master.productType, def.productType)
        )
      );

    // Get product-level key overrides for these products
    const productIds = products.map((p) => p.id);
    const overrides =
      productIds.length > 0
        ? await db
            .select()
            .from(productKeyOverrides)
            .where(inArray(productKeyOverrides.productId, productIds))
        : [];

    const overrideMap = new Map<string, Map<string, boolean>>();
    for (const ov of overrides) {
      if (!overrideMap.has(ov.productId)) overrideMap.set(ov.productId, new Map());
      overrideMap.get(ov.productId)!.set(ov.attributeName, ov.isKey);
    }

    // Audit each product
    let catTotalChecks = 0;
    let catTotalFilled = 0;
    let productsWithGaps = 0;
    const gapBreakdown = { required: 0, conditional: 0, key: 0 };
    const productAudits: ProductAudit[] = [];

    for (const product of products) {
      const productOverrides = overrideMap.get(product.id);
      const gaps: AuditGap[] = [];

      for (const attr of auditableAttrs) {
        const fieldName = attr.bibleFieldMatch!;

        // Determine effective key status
        let effectiveIsKey = attr.isKey;
        if (productOverrides?.has(fieldName)) {
          effectiveIsKey = productOverrides.get(fieldName)!;
        }

        // Determine effective level
        let effectiveLevel: "Required" | "Conditionally Required" | "Key";
        if (attr.requirement === "Required") {
          effectiveLevel = "Required";
        } else if (attr.requirement === "Conditionally Required") {
          effectiveLevel = "Conditionally Required";
        } else if (effectiveIsKey) {
          effectiveLevel = "Key";
        } else {
          // Override turned off isKey for a non-required attribute — skip
          continue;
        }

        catTotalChecks++;
        const value = getProductFieldValue(product, fieldName);

        if (!value || value.trim() === "") {
          gaps.push({
            attributeName: fieldName,
            localLabel: attr.localLabel,
            requirement: attr.requirement,
            isKey: effectiveIsKey,
            effectiveLevel,
          });

          if (effectiveLevel === "Required") gapBreakdown.required++;
          else if (effectiveLevel === "Conditionally Required") gapBreakdown.conditional++;
          else gapBreakdown.key++;
        } else {
          catTotalFilled++;
        }
      }

      if (gaps.length > 0) productsWithGaps++;

      if (includeProducts) {
        productAudits.push({
          productId: product.id,
          productName: getProductFieldValue(product, "ItemName") || product.id,
          asin: getProductFieldValue(product, "ASIN") || "",
          gaps,
        });
      }
    }

    const totalGaps = gapBreakdown.required + gapBreakdown.conditional + gapBreakdown.key;

    if (!clientMap.has(def.clientIdCode)) {
      clientMap.set(def.clientIdCode, {
        clientIdCode: def.clientIdCode,
        categories: [],
        totalProducts: 0,
        totalGaps: 0,
        healthPercent: 100,
      });
    }
    const client = clientMap.get(def.clientIdCode)!;

    const catAudit: CategoryAudit = {
      definitionId: def.id,
      productType: def.productType,
      totalAuditable: auditableAttrs.length,
      productCount: products.length,
      productsWithGaps,
      gapBreakdown,
      totalGaps,
    };
    if (includeProducts) catAudit.products = productAudits;

    client.categories.push(catAudit);
    client.totalProducts += products.length;
    client.totalGaps += totalGaps;
  }

  // Calculate health percentages
  for (const client of clientMap.values()) {
    let totalChecks = 0;
    let totalFilled = 0;
    for (const cat of client.categories) {
      const catChecks = cat.totalAuditable * cat.productCount;
      totalChecks += catChecks;
      totalFilled += catChecks - cat.totalGaps;
    }
    client.healthPercent = totalChecks > 0
      ? Math.round((totalFilled / totalChecks) * 100)
      : 100;
  }

  const clients = [...clientMap.values()].sort((a, b) =>
    a.clientIdCode.localeCompare(b.clientIdCode)
  );

  return NextResponse.json({ clients });
}
```

### 2D: Product key overrides endpoint

- [ ] **Step 5: Create `src/app/api/products/[id]/key-overrides/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { productKeyOverrides } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: productId } = await params;
  const overrides = await db
    .select()
    .from(productKeyOverrides)
    .where(eq(productKeyOverrides.productId, productId));

  return NextResponse.json({ overrides });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "editor") {
    return NextResponse.json({ error: "Editors or admins only" }, { status: 403 });
  }

  const { id: productId } = await params;
  const { attributeName, isKey, categoryDefinitionId } = await req.json();

  if (!attributeName) {
    return NextResponse.json({ error: "attributeName is required" }, { status: 400 });
  }

  const [result] = await db
    .insert(productKeyOverrides)
    .values({
      productId,
      attributeName,
      isKey: isKey !== false,
      categoryDefinitionId: categoryDefinitionId || null,
      createdBy: session.user.email ?? "unknown",
    })
    .onConflictDoUpdate({
      target: [productKeyOverrides.productId, productKeyOverrides.attributeName],
      set: { isKey: isKey !== false },
    })
    .returning();

  return NextResponse.json({ override: result });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "editor") {
    return NextResponse.json({ error: "Editors or admins only" }, { status: 403 });
  }

  const { id: productId } = await params;
  const { attributeName } = await req.json();

  await db
    .delete(productKeyOverrides)
    .where(
      and(
        eq(productKeyOverrides.productId, productId),
        eq(productKeyOverrides.attributeName, attributeName)
      )
    );

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/category-definitions/[productType]/route.ts \
  src/app/api/category-definitions/[productType]/attributes/[id]/route.ts \
  src/app/api/attributes/audit/route.ts \
  src/app/api/products/[id]/key-overrides/route.ts \
  src/hooks/use-category-definition.ts
git commit -m "feat(attributes): add audit, key toggle, and key override API endpoints"
```

---

## Task 3: Admin Key-Tagging UI Enhancement

**Files:**
- Modify: `src/components/admin/category-attributes.tsx`

The admin page at `/admin/attributes` already shows attribute rows when a definition is expanded. We need to add a Key toggle (purple switch) to each `AttributeRow` and a key counter/filter to the `ExpandedAttributes` header.

- [ ] **Step 1: Add Key toggle imports**

At the top of `src/components/admin/category-attributes.tsx`, add to the existing lucide imports:

```typescript
import { Star } from "lucide-react";
```

Add the Switch import:

```typescript
import { Switch } from "@/components/ui/switch";
```

- [ ] **Step 2: Update `CategoryAttributeData` interface**

Add `id` and `isKey` to the `CategoryAttributeData` interface in this file:

```typescript
interface CategoryAttributeData {
  id: number;
  localLabel: string;
  amazonFieldName: string;
  description: string | null;
  example: string | null;
  requirement: string;
  validValues: string[] | null;
  bibleFieldMatch: string | null;
  currentValue: string | null;
  sortOrder: number;
  isKey: boolean;
}
```

- [ ] **Step 3: Add key counter to `ExpandedAttributes`**

In the `ExpandedAttributes` component, after the `matchCount` memo, add a `keyCount` memo:

```typescript
const keyCount = useMemo(
  () =>
    groups.reduce(
      (sum, g) => sum + g.attributes.filter((a) => a.isKey).length,
      0
    ),
  [groups]
);
```

In the match summary div, add the key counter badge:

```tsx
<span className="text-purple-400">
  {keyCount} marked as Key
</span>
```

- [ ] **Step 4: Add key toggle mutation to `ExpandedAttributes`**

Inside `ExpandedAttributes`, add a mutation for toggling isKey:

```typescript
const queryClient = useQueryClient();

const keyToggleMutation = useMutation({
  mutationFn: async ({ attrId, isKey }: { attrId: number; isKey: boolean }) => {
    const res = await fetch(
      `/api/category-definitions/${encodeURIComponent(def.productType)}/attributes/${attrId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isKey }),
      }
    );
    if (!res.ok) throw new Error("Failed to toggle key");
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["category-definition", def.productType, def.clientIdCode],
    });
  },
  onError: () => toast.error("Failed to toggle key status"),
});
```

Pass the toggle function to `AttributeGroupRow` and then to `AttributeRow`.

- [ ] **Step 5: Update `AttributeGroupRow` to accept and pass `onToggleKey`**

```typescript
function AttributeGroupRow({
  group,
  onToggleKey,
}: {
  group: CategoryGroup;
  onToggleKey: (attrId: number, isKey: boolean) => void;
}) {
```

In the render, pass `onToggleKey` to each `AttributeRow`:

```tsx
{group.attributes.map((attr) => (
  <AttributeRow
    key={attr.amazonFieldName}
    attr={attr}
    onToggleKey={onToggleKey}
  />
))}
```

- [ ] **Step 6: Add Key toggle to `AttributeRow`**

Update the `AttributeRow` component to accept and render the toggle:

```typescript
function AttributeRow({
  attr,
  onToggleKey,
}: {
  attr: CategoryAttributeData;
  onToggleKey: (attrId: number, isKey: boolean) => void;
}) {
```

Add the toggle between the requirement badge and the match indicator in the row button's flex layout:

```tsx
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onToggleKey(attr.id, !attr.isKey);
  }}
  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all ${
    attr.isKey
      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
      : "bg-transparent text-muted-foreground/30 border-transparent hover:text-purple-400/50 hover:border-purple-500/20"
  }`}
  title={attr.isKey ? "Remove Key flag" : "Mark as Key"}
>
  <Star className={`h-3 w-3 inline-block ${attr.isKey ? "fill-current" : ""}`} />
</button>
```

- [ ] **Step 7: Wire up the toggle in `ExpandedAttributes` → `AttributeGroupRow`**

```tsx
{groups.map((group) => (
  <AttributeGroupRow
    key={group.name}
    group={group}
    onToggleKey={(attrId, isKey) =>
      keyToggleMutation.mutate({ attrId, isKey })
    }
  />
))}
```

- [ ] **Step 8: Test manually**

```bash
PORT=3000 npm run dev
```

1. Go to `/admin/attributes`
2. Expand a category definition
3. Expand an attribute group
4. Click the star icon on an attribute — it should turn purple and persist on refresh
5. Check the "N marked as Key" counter updates

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/category-attributes.tsx
git commit -m "feat(attributes): add Key toggle to admin attribute rows"
```

---

## Task 4: Audit Dashboard at `/attributes`

**Files:**
- Create: `src/app/attributes/page.tsx`
- Create: `src/components/attributes/audit-dashboard.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add sidebar nav item**

In `src/components/layout/app-sidebar.tsx`, find the "Catalog" section and add `ClipboardCheck` to the lucide imports. Then add a new item after "Attributes":

```typescript
{ title: "Attribute Audit", href: "/attributes", icon: ClipboardCheck, visible: checkAccess("catalog") || isAdmin },
```

Import `ClipboardCheck` at the top (add it to the existing lucide import line).

- [ ] **Step 2: Create page shell at `src/app/attributes/page.tsx`**

```tsx
"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditDashboard } from "@/components/attributes/audit-dashboard";

export default function AttributeAuditPage() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter mb-2">
          <span className="text-foreground font-bold">Attribute</span>
          <span className="text-brand font-medium">Audit</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Scan products against category definitions to find missing required,
          conditional, and key attributes.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        }
      >
        <AuditDashboard />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/attributes/audit-dashboard.tsx` — scaffold + queries**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────────────────

interface AuditGap {
  attributeName: string;
  localLabel: string;
  requirement: string;
  isKey: boolean;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
}

interface ProductAudit {
  productId: string;
  productName: string;
  asin: string;
  gaps: AuditGap[];
}

interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  products?: ProductAudit[];
}

interface ClientAudit {
  clientIdCode: string;
  categories: CategoryAudit[];
  totalProducts: number;
  totalGaps: number;
  healthPercent: number;
}

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function AuditDashboard() {
  const router = useRouter();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [gapFilter, setGapFilter] = useState<"all" | "gaps">("all");
  const [drillDown, setDrillDown] = useState<{
    clientIdCode: string;
    productType: string;
  } | null>(null);

  // Fetch client list
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch audit data (summary level)
  const { data: auditData, isLoading } = useQuery({
    queryKey: ["attribute-audit", clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientFilter !== "all") params.set("clientIdCode", clientFilter);
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit data");
      return res.json() as Promise<{ clients: ClientAudit[] }>;
    },
  });

  // Fetch drill-down data (with products) when a category is selected
  const { data: drillDownData, isLoading: drillDownLoading } = useQuery({
    queryKey: ["attribute-audit-drill", drillDown?.clientIdCode, drillDown?.productType],
    queryFn: async () => {
      const params = new URLSearchParams({
        clientIdCode: drillDown!.clientIdCode,
        productType: drillDown!.productType,
        includeProducts: "true",
      });
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch drill-down data");
      const data = await res.json() as Promise<{ clients: ClientAudit[] }>;
      return data;
    },
    enabled: !!drillDown,
  });

  const auditClients = auditData?.clients ?? [];
  const filteredClients =
    gapFilter === "gaps"
      ? auditClients.filter((c) => c.totalGaps > 0)
      : auditClients;

  // ─── Drill-down view ───────────────────────────────────────────
  if (drillDown) {
    const clientData = (drillDownData as { clients: ClientAudit[] } | undefined)?.clients?.[0];
    const category = clientData?.categories?.[0];
    const products = category?.products ?? [];
    const productsWithGaps = products.filter((p) => p.gaps.length > 0);
    const completeProducts = products.filter((p) => p.gaps.length === 0);

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDrillDown(null)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Audit
          </button>
          <span className="text-muted-foreground">/</span>
          <span>{CLIENT_NAMES[drillDown.clientIdCode] || drillDown.clientIdCode}</span>
          <span className="text-muted-foreground">/</span>
          <Badge variant="outline" className="font-mono text-xs border-brand/30 text-brand">
            {drillDown.productType}
          </Badge>
        </div>

        {/* Summary bar */}
        {category && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
            <span className="text-sm text-muted-foreground">
              {category.productCount} products, {category.totalGaps} missing fields
              across {category.productsWithGaps} products
            </span>
          </div>
        )}

        {drillDownLoading ? (
          <p className="text-sm text-muted-foreground">Loading products...</p>
        ) : (
          <div className="space-y-2">
            {/* Products with gaps */}
            {productsWithGaps.map((product) => (
              <div
                key={product.productId}
                className="rounded-lg border bg-card p-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => router.push(`/products/${product.productId}`)}
                    className="text-sm font-medium hover:underline text-left"
                  >
                    {product.productName}
                  </button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {product.asin}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.gaps.map((gap) => (
                    <Badge
                      key={gap.attributeName}
                      variant="outline"
                      className={`text-[10px] ${
                        gap.effectiveLevel === "Required"
                          ? "border-red-500/50 text-red-400"
                          : gap.effectiveLevel === "Conditionally Required"
                            ? "border-orange-500/50 text-orange-400"
                            : "border-purple-500/50 text-purple-400"
                      }`}
                    >
                      {gap.effectiveLevel === "Required"
                        ? "R"
                        : gap.effectiveLevel === "Conditionally Required"
                          ? "C"
                          : "K"}{" "}
                      {gap.localLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}

            {/* Complete products summary */}
            {completeProducts.length > 0 && (
              <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <span className="text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 inline-block mr-1.5" />
                  {completeProducts.length} product{completeProducts.length !== 1 ? "s" : ""} complete
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Main dashboard view ────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setGapFilter("all")}
              className={`px-3 py-1.5 text-xs ${
                gapFilter === "all"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setGapFilter("gaps")}
              className={`px-3 py-1.5 text-xs border-l ${
                gapFilter === "gaps"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Has gaps
            </button>
          </div>
        </div>
      </div>

      {/* Client cards */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground/70">Scanning products...</p>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {auditClients.length === 0
              ? "No category definitions uploaded yet. Upload XLSM files in Admin → Attributes."
              : "All clients are complete — no gaps found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((client) => (
            <ClientCard
              key={client.clientIdCode}
              client={client}
              onDrillDown={(productType) =>
                setDrillDown({
                  clientIdCode: client.clientIdCode,
                  productType,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Card ───────────────────────────────────────────────────

function ClientCard({
  client,
  onDrillDown,
}: {
  client: ClientAudit;
  onDrillDown: (productType: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasGaps = client.totalGaps > 0;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border bg-card overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="text-left">
              <span className="text-sm font-medium">
                {CLIENT_NAMES[client.clientIdCode] || client.clientIdCode}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {client.categories.length} categor{client.categories.length !== 1 ? "ies" : "y"},
                {" "}{client.totalProducts} product{client.totalProducts !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Health bar */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    client.healthPercent >= 90
                      ? "bg-emerald-500"
                      : client.healthPercent >= 70
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${client.healthPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground w-8">
                {client.healthPercent}%
              </span>
            </div>
            {/* Gap badge */}
            {hasGaps ? (
              <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                {client.totalGaps} gaps
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-2 space-y-1">
            {client.categories.map((cat) => (
              <button
                key={cat.productType}
                onClick={() => onDrillDown(cat.productType)}
                className="flex items-center justify-between w-full px-3 py-2 rounded hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs border-brand/30 text-brand"
                  >
                    {cat.productType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {cat.productCount} product{cat.productCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {cat.totalGaps > 0 ? (
                    <>
                      <span className="text-xs tabular-nums">
                        {cat.gapBreakdown.required > 0 && (
                          <span className="text-red-400 mr-1.5">{cat.gapBreakdown.required}R</span>
                        )}
                        {cat.gapBreakdown.conditional > 0 && (
                          <span className="text-orange-400 mr-1.5">{cat.gapBreakdown.conditional}C</span>
                        )}
                        {cat.gapBreakdown.key > 0 && (
                          <span className="text-purple-400">{cat.gapBreakdown.key}K</span>
                        )}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-red-500/30 text-red-400"
                      >
                        {cat.totalGaps} missing
                      </Badge>
                    </>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 text-emerald-400"
                    >
                      Complete
                    </Badge>
                  )}
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
```

- [ ] **Step 4: Test manually**

```bash
PORT=3000 npm run dev
```

1. Verify "Attribute Audit" appears in sidebar under Catalog
2. Navigate to `/attributes`
3. See client cards with health bars and gap badges
4. Expand a client to see category rows
5. Click a category to drill down to products with gap pills
6. Click a product name to navigate to product detail

- [ ] **Step 5: Commit**

```bash
git add src/app/attributes/page.tsx src/components/attributes/audit-dashboard.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(attributes): add audit dashboard at /attributes with client/category/product drill-down"
```

---

## Task 5: Product Detail Health Card

**Files:**
- Create: `src/components/products/attribute-health-card.tsx`
- Modify: `src/components/products/product-detail-form.tsx`
- Modify: `src/components/products/amazon-category-attributes.tsx`

- [ ] **Step 1: Create `src/components/products/attribute-health-card.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, ArrowDown, Plus, X } from "lucide-react";
import type { CategoryGroupData, CategoryAttributeData } from "@/hooks/use-category-definition";

interface HealthGap {
  attributeName: string;
  localLabel: string;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
  groupName: string;
}

interface AttributeHealthCardProps {
  productId: string;
  categoryGroups: CategoryGroupData[];
  categoryName?: string;
}

export function AttributeHealthCard({
  productId,
  categoryGroups,
  categoryName,
}: AttributeHealthCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = session?.user?.role === "admin" || session?.user?.role === "editor";
  const [showKeyPopover, setShowKeyPopover] = useState(false);

  // Fetch product-level key overrides
  const { data: overridesData } = useQuery({
    queryKey: ["product-key-overrides", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/key-overrides`);
      if (!res.ok) return { overrides: [] };
      return res.json() as Promise<{
        overrides: { attributeName: string; isKey: boolean }[];
      }>;
    },
  });

  const overrides = overridesData?.overrides ?? [];
  const overrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const ov of overrides) map.set(ov.attributeName, ov.isKey);
    return map;
  }, [overrides]);

  // Compute gaps
  const gaps = useMemo(() => {
    const result: HealthGap[] = [];
    for (const group of categoryGroups) {
      for (const attr of group.attributes) {
        if (!attr.bibleFieldMatch) continue;

        // Effective key status
        let effectiveIsKey = attr.isKey;
        if (overrideMap.has(attr.bibleFieldMatch)) {
          effectiveIsKey = overrideMap.get(attr.bibleFieldMatch)!;
        }

        // Check if auditable
        const isRequired = attr.requirement === "Required";
        const isConditional = attr.requirement === "Conditionally Required";
        if (!isRequired && !isConditional && !effectiveIsKey) continue;

        // Check if value is empty
        if (attr.currentValue && attr.currentValue.trim() !== "") continue;

        let effectiveLevel: "Required" | "Conditionally Required" | "Key";
        if (isRequired) effectiveLevel = "Required";
        else if (isConditional) effectiveLevel = "Conditionally Required";
        else effectiveLevel = "Key";

        result.push({
          attributeName: attr.bibleFieldMatch,
          localLabel: attr.localLabel,
          effectiveLevel,
          groupName: group.name,
        });
      }
    }
    return result;
  }, [categoryGroups, overrideMap]);

  // Key override mutations
  const addKeyMutation = useMutation({
    mutationFn: async (attributeName: string) => {
      const res = await fetch(`/api/products/${productId}/key-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeName, isKey: true }),
      });
      if (!res.ok) throw new Error("Failed to add key override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-key-overrides", productId] });
      toast.success("Marked as Key for this product");
    },
    onError: () => toast.error("Failed to mark as Key"),
  });

  const removeKeyMutation = useMutation({
    mutationFn: async (attributeName: string) => {
      const res = await fetch(`/api/products/${productId}/key-overrides`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeName }),
      });
      if (!res.ok) throw new Error("Failed to remove key override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-key-overrides", productId] });
      toast.success("Key override removed");
    },
    onError: () => toast.error("Failed to remove key override"),
  });

  // All available attributes for the "add key" popover
  const allAttributes = useMemo(() => {
    const result: { name: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const group of categoryGroups) {
      for (const attr of group.attributes) {
        if (!attr.bibleFieldMatch || seen.has(attr.bibleFieldMatch)) continue;
        seen.add(attr.bibleFieldMatch);
        result.push({ name: attr.bibleFieldMatch, label: attr.localLabel });
      }
    }
    return result;
  }, [categoryGroups]);

  if (gaps.length === 0) return null;

  const required = gaps.filter((g) => g.effectiveLevel === "Required").length;
  const conditional = gaps.filter((g) => g.effectiveLevel === "Conditionally Required").length;
  const key = gaps.filter((g) => g.effectiveLevel === "Key").length;

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">
            {gaps.length} Missing Attribute{gaps.length !== 1 ? "s" : ""}
          </span>
          {categoryName && (
            <span className="text-xs text-muted-foreground">
              in {categoryName}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 text-xs tabular-nums">
          {required > 0 && <span className="text-red-400">{required}R</span>}
          {conditional > 0 && <span className="text-orange-400">{conditional}C</span>}
          {key > 0 && <span className="text-purple-400">{key}K</span>}
        </div>
      </div>

      <div className="space-y-1">
        {gaps.map((gap) => (
          <div
            key={gap.attributeName}
            className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-red-500/5"
          >
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  gap.effectiveLevel === "Required"
                    ? "border-red-500/50 text-red-400"
                    : gap.effectiveLevel === "Conditionally Required"
                      ? "border-orange-500/50 text-orange-400"
                      : "border-purple-500/50 text-purple-400"
                }`}
              >
                {gap.effectiveLevel === "Required"
                  ? "R"
                  : gap.effectiveLevel === "Conditionally Required"
                    ? "C"
                    : "K"}
              </Badge>
              <span className="text-foreground/80">{gap.localLabel}</span>
            </div>
            <button
              onClick={() => {
                const el = document.querySelector(
                  `[data-field="${gap.attributeName}"]`
                );
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("ring-2", "ring-brand", "ring-offset-2");
                  setTimeout(() => {
                    el.classList.remove("ring-2", "ring-brand", "ring-offset-2");
                  }, 2000);
                }
              }}
              className="text-brand hover:underline shrink-0"
            >
              Jump to field <ArrowDown className="h-3 w-3 inline-block" />
            </button>
          </div>
        ))}
      </div>

      {/* Add key override */}
      {canEdit && (
        <div className="pt-1 border-t border-red-500/10">
          <Popover open={showKeyPopover} onOpenChange={setShowKeyPopover}>
            <PopoverTrigger asChild>
              <button className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                <Plus className="h-3 w-3" />
                Mark another field as Key for this product
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2 max-h-60 overflow-y-auto">
              <div className="space-y-0.5">
                {allAttributes.map((attr) => {
                  const isOverridden = overrideMap.has(attr.name);
                  return (
                    <button
                      key={attr.name}
                      onClick={() => {
                        if (isOverridden) {
                          removeKeyMutation.mutate(attr.name);
                        } else {
                          addKeyMutation.mutate(attr.name);
                        }
                        setShowKeyPopover(false);
                      }}
                      className="flex items-center justify-between w-full px-2 py-1.5 rounded text-xs hover:bg-muted/30"
                    >
                      <span className="truncate">{attr.label}</span>
                      {isOverridden && (
                        <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">
                          Key <X className="h-2.5 w-2.5 ml-0.5" />
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount health card in product detail form**

In `src/components/products/product-detail-form.tsx`, add the import:

```typescript
import { AttributeHealthCard } from "./attribute-health-card";
```

Then find where the sections begin rendering (after the header/toolbar area, before the first `ProductSection`). Mount the health card there — it should appear above the data sections. Look for where `AmazonCategoryAttributes` is rendered and place the health card just before it:

```tsx
{/* Attribute Health Card — only shows when gaps exist */}
{effectiveProductType && product && (
  <AttributeHealthCard
    productId={productId}
    categoryGroups={categoryGroups}
    categoryName={effectiveProductType}
  />
)}
```

- [ ] **Step 3: Update `computeGroupStats` in `amazon-category-attributes.tsx`**

In `src/components/products/amazon-category-attributes.tsx`, update `computeGroupStats` to count Key attributes:

```typescript
function computeGroupStats(attrs: CategoryAttributeData[]): GroupStats {
  let required = 0, conditional = 0, optional = 0, matched = 0, filled = 0, key = 0;
  for (const a of attrs) {
    if (a.requirement === "Required") required++;
    else if (a.requirement === "Conditionally Required") conditional++;
    else optional++;
    if (a.isKey) key++;
    if (a.bibleFieldMatch) matched++;
    if (a.currentValue) filled++;
  }
  return { total: attrs.length, required, conditional, optional, matched, filled, key };
}
```

Add `key: number` to the `GroupStats` interface.

- [ ] **Step 4: Test manually**

1. Navigate to a product detail page where the product has a category definition
2. Verify the red "Missing Attributes" card appears if there are gaps
3. Click "Jump to field" — it should scroll to and highlight the field
4. Click "Mark another field as Key" — the popover should show available attributes
5. Toggle a key override and verify the card updates

- [ ] **Step 5: Commit**

```bash
git add src/components/products/attribute-health-card.tsx \
  src/components/products/product-detail-form.tsx \
  src/components/products/amazon-category-attributes.tsx
git commit -m "feat(attributes): add attribute health card to product detail page"
```

---

## Task 6: Template Generation XLSX

**Files:**
- Create: `src/components/attributes/template-dialog.tsx`
- Create: `src/app/api/attributes/template/route.ts`
- Create: `src/app/api/attributes/template-requests/route.ts`
- Create: `src/app/api/attributes/template-requests/[id]/route.ts`
- Modify: `src/components/attributes/audit-dashboard.tsx`

- [ ] **Step 1: Create XLSX template API at `src/app/api/attributes/template/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  categoryAttributes,
  productKeyOverrides,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode, productType, scope, levels } = await req.json();

  if (!clientIdCode || !productType || !scope || !levels?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 1. Get definition
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
    return NextResponse.json({ error: "Category definition not found" }, { status: 404 });
  }

  // 2. Get attributes matching the selected levels
  const attrs = await db
    .select()
    .from(categoryAttributes)
    .where(eq(categoryAttributes.definitionId, def.id))
    .orderBy(categoryAttributes.sortOrder);

  const filteredAttrs = attrs.filter((a) => {
    if (!a.bibleFieldMatch) return false;
    if (levels.includes(a.requirement)) return true;
    if (levels.includes("Key") && a.isKey) return true;
    return false;
  });

  // 3. Get products
  let products: any[] = [];
  if (scope !== "new") {
    products = await db
      .select()
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, clientIdCode),
          eq(master.productType, productType)
        )
      );

    if (scope === "gaps") {
      // Filter to products with at least one gap
      products = products.filter((product) =>
        filteredAttrs.some((attr) => {
          const val = getProductFieldValue(product, attr.bibleFieldMatch!);
          return !val || val.trim() === "";
        })
      );
    }
  }

  // 4. Build XLSX
  const wb = XLSX.utils.book_new();

  // Group columns by requirement level for color-coding
  const headerRow = ["Product Name", "ASIN"];
  const attrColumns = filteredAttrs.map((a) => ({
    label: a.localLabel,
    field: a.bibleFieldMatch!,
    requirement: a.isKey ? "Key" : a.requirement,
  }));
  headerRow.push(...attrColumns.map((c) => c.label));

  const dataRows: string[][] = [];
  if (scope === "new") {
    // Empty template — just headers, 10 blank rows
    for (let i = 0; i < 10; i++) {
      dataRows.push(new Array(headerRow.length).fill(""));
    }
  } else {
    for (const product of products) {
      const row = [
        getProductFieldValue(product, "ItemName") || "",
        getProductFieldValue(product, "ASIN") || "",
      ];
      for (const col of attrColumns) {
        row.push(getProductFieldValue(product, col.field) || "");
      }
      dataRows.push(row);
    }
  }

  const wsData = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = [
    { wch: 40 }, // Product Name
    { wch: 14 }, // ASIN
    ...attrColumns.map(() => ({ wch: 20 })),
  ];

  XLSX.utils.book_append_sheet(wb, ws, productType.slice(0, 31)); // Sheet name max 31 chars

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attribute-template-${clientIdCode}-${productType}.xlsx"`,
    },
  });
}
```

- [ ] **Step 2: Create template request endpoints**

Create `src/app/api/attributes/template-requests/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeTemplateRequests, master } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode, productType, scope, levels } = await req.json();

  if (!clientIdCode || !productType || !scope || !levels?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get product IDs if not "new" scope
  let productIds: string[] | null = null;
  if (scope !== "new") {
    const products = await db
      .select({ id: master.id })
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, clientIdCode),
          eq(master.productType, productType)
        )
      );
    productIds = products.map((p) => p.id);
  }

  const [request] = await db
    .insert(attributeTemplateRequests)
    .values({
      clientIdCode,
      productType,
      scope,
      levels,
      productIds,
      createdBy: session.user.email ?? "unknown",
    })
    .returning();

  return NextResponse.json({ request });
}
```

Create `src/app/api/attributes/template-requests/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryDefinitions,
  categoryAttributes,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [request] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch the definition + attributes
  const [def] = await db
    .select()
    .from(categoryDefinitions)
    .where(
      and(
        eq(categoryDefinitions.clientIdCode, request.clientIdCode),
        eq(categoryDefinitions.productType, request.productType)
      )
    )
    .limit(1);

  if (!def) {
    return NextResponse.json({ error: "Category definition not found" }, { status: 404 });
  }

  const attrs = await db
    .select()
    .from(categoryAttributes)
    .where(eq(categoryAttributes.definitionId, def.id))
    .orderBy(categoryAttributes.sortOrder);

  const filteredAttrs = attrs.filter((a) => {
    if (!a.bibleFieldMatch) return false;
    if (request.levels.includes(a.requirement)) return true;
    if (request.levels.includes("Key") && a.isKey) return true;
    return false;
  });

  // Fetch products
  const products =
    request.productIds && request.productIds.length > 0
      ? await db
          .select()
          .from(master)
          .where(inArray(master.id, request.productIds))
      : [];

  // Build product data with gaps
  const productData = products.map((product) => {
    const fields = filteredAttrs.map((attr) => ({
      attributeName: attr.bibleFieldMatch!,
      localLabel: attr.localLabel,
      description: attr.description,
      example: attr.example,
      requirement: attr.isKey ? "Key" : attr.requirement,
      currentValue: getProductFieldValue(product, attr.bibleFieldMatch!) || "",
      isEmpty: !getProductFieldValue(product, attr.bibleFieldMatch!)?.trim(),
    }));

    return {
      productId: product.id,
      productName: getProductFieldValue(product, "ItemName") || product.id,
      asin: getProductFieldValue(product, "ASIN") || "",
      fields,
      missingCount: fields.filter((f) => f.isEmpty).length,
    };
  });

  return NextResponse.json({
    request,
    productType: def.productType,
    products: productData,
  });
}
```

- [ ] **Step 3: Create template dialog component at `src/components/attributes/template-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Link2, Loader2, FileSpreadsheet } from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

interface CategoryDef {
  id: number;
  clientIdCode: string;
  productType: string;
}

interface TemplateDialogProps {
  /** Pre-selected client */
  defaultClient?: string;
  /** Pre-selected productType */
  defaultProductType?: string;
  trigger?: React.ReactNode;
}

const SCOPE_OPTIONS = [
  { value: "gaps", label: "With gaps only" },
  { value: "all", label: "All products" },
  { value: "new", label: "New (empty)" },
] as const;

const LEVEL_OPTIONS = [
  { value: "Required", label: "Required", disabled: true, defaultChecked: true },
  { value: "Conditionally Required", label: "Conditionally Required", defaultChecked: true },
  { value: "Key", label: "Key", defaultChecked: true },
  { value: "Recommended", label: "Recommended", defaultChecked: false },
  { value: "Optional", label: "Optional", defaultChecked: false },
] as const;

export function TemplateDialog({
  defaultClient,
  defaultProductType,
  trigger,
}: TemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(defaultClient || "");
  const [productType, setProductType] = useState(defaultProductType || "");
  const [scope, setScope] = useState<string>("gaps");
  const [levels, setLevels] = useState<Set<string>>(
    new Set(["Required", "Conditionally Required", "Key"])
  );
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch definitions for selected client
  const { data: definitions = [] } = useQuery({
    queryKey: ["category-definitions-list", client],
    queryFn: async () => {
      const res = await fetch(`/api/category-definitions?clientIdCode=${client}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.definitions as CategoryDef[];
    },
    enabled: !!client,
  });

  // Download XLSX mutation
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attributes/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: client,
          productType,
          scope,
          levels: [...levels],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate template");
      }
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attribute-template-${client}-${productType}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Create portal link mutation
  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attributes/template-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: client,
          productType,
          scope,
          levels: [...levels],
        }),
      });
      if (!res.ok) throw new Error("Failed to create portal link");
      return res.json();
    },
    onSuccess: (data) => {
      const url = `/portal/attributes?request=${data.request.id}`;
      setPortalUrl(url);
      toast.success("Portal link created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleLevel(level: string) {
    if (level === "Required") return; // Always on
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  const canGenerate = client && productType && levels.size > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Generate Template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Attribute Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client</Label>
            <Select value={client} onValueChange={(v) => { setClient(v); setProductType(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={productType} onValueChange={setProductType} disabled={!client}>
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {definitions.map((d) => (
                  <SelectItem key={d.productType} value={d.productType}>
                    {d.productType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Products scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Levels */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Attribute levels</Label>
            <div className="flex flex-wrap gap-3">
              {LEVEL_OPTIONS.map((l) => (
                <label key={l.value} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={levels.has(l.value)}
                    onCheckedChange={() => toggleLevel(l.value)}
                    disabled={l.value === "Required"}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </div>

          {/* Portal URL result */}
          {portalUrl && (
            <div className="rounded border bg-muted/30 p-3 text-xs">
              <span className="text-muted-foreground">Portal link: </span>
              <code className="text-brand">{portalUrl}</code>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => downloadMutation.mutate()}
              disabled={!canGenerate || downloadMutation.isPending}
              className="flex-1"
            >
              {downloadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              Download XLSX
            </Button>
            <Button
              variant="outline"
              onClick={() => portalMutation.mutate()}
              disabled={!canGenerate || scope === "new" || portalMutation.isPending}
              className="flex-1"
            >
              {portalMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-1.5" />
              )}
              Create Portal Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire template dialog into audit dashboard**

In `src/components/attributes/audit-dashboard.tsx`, add the import:

```typescript
import { TemplateDialog } from "./template-dialog";
```

In the toolbar (after the gap filter buttons), add:

```tsx
<TemplateDialog />
```

- [ ] **Step 5: Test manually**

1. Go to `/attributes`
2. Click "Generate Template"
3. Select a client, category, scope, and levels
4. Click "Download XLSX" — verify the file downloads with correct structure
5. Click "Create Portal Link" — verify a URL is generated

- [ ] **Step 6: Commit**

```bash
git add src/app/api/attributes/template/route.ts \
  src/app/api/attributes/template-requests/route.ts \
  src/app/api/attributes/template-requests/[id]/route.ts \
  src/components/attributes/template-dialog.tsx \
  src/components/attributes/audit-dashboard.tsx
git commit -m "feat(attributes): add XLSX template generation and portal link creation"
```

---

## Task 7: Portal Form

**Files:**
- Create: `src/app/portal/attributes/page.tsx`
- Create: `src/components/portal/attribute-form.tsx`
- Modify: `src/components/layout/portal-shell.tsx`

- [ ] **Step 1: Add portal nav item**

In `src/components/layout/portal-shell.tsx`, find the nav items array and add:

```typescript
{ id: "attributes", title: "Attributes", href: "/portal/attributes", icon: ClipboardList, permission: null },
```

Add `ClipboardList` to the lucide imports.

- [ ] **Step 2: Create portal page at `src/app/portal/attributes/page.tsx`**

```tsx
"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AttributeForm } from "@/components/portal/attribute-form";

export default function PortalAttributesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-[family-name:var(--font-geist-sans)] tracking-tighter mb-1">
          <span className="text-foreground font-bold">Attribute</span>
          <span className="text-brand font-medium">Form</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Fill in missing product attributes for your catalog.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <AttributeForm />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/portal/attribute-form.tsx`**

```tsx
"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";

interface FieldData {
  attributeName: string;
  localLabel: string;
  description: string | null;
  example: string | null;
  requirement: string;
  currentValue: string;
  isEmpty: boolean;
}

interface ProductData {
  productId: string;
  productName: string;
  asin: string;
  fields: FieldData[];
  missingCount: number;
}

interface TemplateRequestData {
  request: {
    id: string;
    clientIdCode: string;
    productType: string;
    scope: string;
    levels: string[];
  };
  productType: string;
  products: ProductData[];
}

export function AttributeForm() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request");
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch template request data
  const { data, isLoading, error } = useQuery({
    queryKey: ["template-request", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/attributes/template-requests/${requestId}`);
      if (!res.ok) throw new Error("Template request not found");
      return res.json() as Promise<TemplateRequestData>;
    },
    enabled: !!requestId,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({
      productId,
      bqName,
      value,
    }: {
      productId: string;
      bqName: string;
      value: string;
    }) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bqName, value, field: null }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onError: () => toast.error("Failed to save field"),
  });

  const handleBlur = useCallback(
    (productId: string, bqName: string, value: string) => {
      saveMutation.mutate({ productId, bqName, value });
    },
    [saveMutation]
  );

  if (!requestId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No attribute request specified. Ask your account manager for a link.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading form...</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">Template request not found or expired.</p>
      </div>
    );
  }

  const products = data.products;
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm text-emerald-400">All products are complete!</p>
      </div>
    );
  }

  const product = products[currentIndex];
  const missingFields = product.fields.filter((f) => f.isEmpty);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
        <span className="text-sm text-muted-foreground">
          Product {currentIndex + 1} of {products.length}
        </span>
        <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{
              width: `${((currentIndex + 1) / products.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Product header */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">{product.productName}</h2>
        <span className="text-xs text-muted-foreground font-mono">
          ASIN: {product.asin}
        </span>
        <span className="ml-3 text-xs text-muted-foreground">
          {missingFields.length} field{missingFields.length !== 1 ? "s" : ""} to fill
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {missingFields.map((field) => (
          <FieldInput
            key={field.attributeName}
            field={field}
            productId={product.productId}
            onBlur={handleBlur}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => i - 1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          size="sm"
          disabled={currentIndex === products.length - 1}
          onClick={() => setCurrentIndex((i) => i + 1)}
        >
          Next Product
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  productId,
  onBlur,
}: {
  field: FieldData;
  productId: string;
  onBlur: (productId: string, bqName: string, value: string) => void;
}) {
  const [value, setValue] = useState(field.currentValue);
  const isLong = (field.description?.length ?? 0) > 100;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            field.requirement === "Required"
              ? "border-red-500/50 text-red-400"
              : field.requirement === "Conditionally Required"
                ? "border-orange-500/50 text-orange-400"
                : "border-purple-500/50 text-purple-400"
          }`}
        >
          {field.requirement}
        </Badge>
        <Label className="text-sm font-medium">{field.localLabel}</Label>
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}

      {isLong ? (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onBlur(productId, field.attributeName, value)}
          placeholder={field.example || "Enter value..."}
          className="min-h-[80px]"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onBlur(productId, field.attributeName, value)}
          placeholder={field.example || "Enter value..."}
        />
      )}

      {field.example && (
        <p className="text-[11px] text-muted-foreground/60">
          Example: <span className="font-mono">{field.example}</span>
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/40 font-mono">
        {field.attributeName}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Test manually**

1. Go to `/attributes`, generate a portal link via the template dialog
2. Copy the generated URL and navigate to it
3. Verify the wizard shows one product at a time
4. Fill in a field and blur — check it auto-saves (verify by refreshing)
5. Click "Next Product" to advance

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/attributes/page.tsx \
  src/components/portal/attribute-form.tsx \
  src/components/layout/portal-shell.tsx
git commit -m "feat(attributes): add portal wizard form for client attribute data entry"
```

---

## Post-Implementation

- [ ] **Final verification: run build**

```bash
cd /Users/manu/1o8Hub && npm run build
```

Fix any TypeScript errors.

- [ ] **Final commit if build fixes were needed**

```bash
git add -A
git commit -m "fix(attributes): resolve build errors"
```
