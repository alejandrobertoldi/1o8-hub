/**
 * Reads the BigQuery schema for Master and generates a column registry.
 *
 * Usage: npx tsx scripts/generate-column-registry.ts > src/lib/generated-columns.ts
 *
 * The output is a TypeScript file that exports JSONB_COLUMNS for use in column-registry.ts.
 * After generation, review the grouping heuristics and adjust as needed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8BibleApp";
const TABLE = process.env.BQ_TABLE || "Master";

// Core columns that already have dedicated DB fields (skip these)
const CORE_BQ_NAMES = new Set([
  "ASIN", "SKU", "ClientIDCode", "Marketplace", "Country", "Status",
  "ParentageLevel", "ParentSKU", "ParentASIN", "BrandName", "ItemName",
  "SummarizedTitle", "ProductType", "ListPrice", "CostPrice", "MainImageURL",
  "ItemTypeKeyword", "FeedProductType", "RecommendedBrowseNodes",
  "GenericKeywords", "PlatinumKeywords", "SyncStatus", "SyncTimestamp", "SyncInfo",
]);

/**
 * Heuristic grouping based on column name patterns.
 */
function guessGroup(name: string): string {
  const lower = name.toLowerCase();

  // Images
  if (lower.includes("image") || lower.includes("swatch") || lower.includes("photo")) {
    return "images";
  }

  // Content & SEO
  if (
    lower.includes("bullet") || lower.includes("description") ||
    lower.includes("keyword") || lower.includes("search_term") ||
    lower.includes("seo") || lower.includes("title") ||
    lower.includes("subject_matter")
  ) {
    return "content_seo";
  }

  // Variations
  if (
    lower.includes("variation") || lower.includes("color") ||
    lower.includes("size") || lower.includes("style") ||
    lower.includes("flavor") || lower.includes("scent") ||
    lower.includes("pattern")
  ) {
    return "variations";
  }

  // Packaging
  if (
    lower.includes("package") || lower.includes("packaging") ||
    lower.includes("box") || lower.includes("container") ||
    lower.includes("unit_count")
  ) {
    return "packaging";
  }

  // Target Audience
  if (
    lower.includes("audience") || lower.includes("age") ||
    lower.includes("gender") || lower.includes("demographic") ||
    lower.includes("target")
  ) {
    return "target_audience";
  }

  // Fulfillment
  if (
    lower.includes("fulfillment") || lower.includes("fba") ||
    lower.includes("shipping") || lower.includes("delivery") ||
    lower.includes("merchant") || lower.includes("condition")
  ) {
    return "fulfillment";
  }

  // Nutrition & Supplements
  if (
    lower.includes("nutri") || lower.includes("vitamin") ||
    lower.includes("supplement") || lower.includes("serving") ||
    lower.includes("calori") || lower.includes("fat") ||
    lower.includes("protein") || lower.includes("carb") ||
    lower.includes("sodium") || lower.includes("sugar") ||
    lower.includes("fiber") || lower.includes("cholesterol") ||
    lower.includes("ingredient") || lower.includes("allergen")
  ) {
    return "nutrition_supplements";
  }

  // Compliance & Safety
  if (
    lower.includes("compliance") || lower.includes("safety") ||
    lower.includes("warning") || lower.includes("hazard") ||
    lower.includes("cpsia") || lower.includes("prop65") ||
    lower.includes("certification") || lower.includes("regulation") ||
    lower.includes("battery") || lower.includes("chemical") ||
    lower.includes("pesticide") || lower.includes("fda")
  ) {
    return "compliance_safety";
  }

  // Dimensions & Weight
  if (
    lower.includes("dimension") || lower.includes("weight") ||
    lower.includes("height") || lower.includes("width") ||
    lower.includes("length") || lower.includes("depth") ||
    lower.includes("volume") || lower.includes("diameter")
  ) {
    return "dimensions_weight";
  }

  // Default: product attributes
  return "product_attributes";
}

function humanizeLabel(bqName: string): string {
  return bqName
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  let bigquery: BigQuery;

  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    bigquery = new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
    });
  } else {
    // Fall back to application default credentials
    bigquery = new BigQuery({ projectId: PROJECT_ID });
  }

  const [metadata] = await bigquery
    .dataset(DATASET)
    .table(TABLE)
    .getMetadata();

  const fields = metadata.schema.fields as Array<{ name: string; type: string }>;

  console.log(`// Auto-generated from BigQuery schema: ${PROJECT_ID}.${DATASET}.${TABLE}`);
  console.log(`// ${fields.length} total columns found, ${CORE_BQ_NAMES.size} are core columns`);
  console.log(`// Generated at: ${new Date().toISOString()}`);
  console.log(`// Review and adjust groupings as needed.\n`);
  console.log(`import type { ColumnDef } from "./column-registry";\n`);
  console.log(`export const GENERATED_JSONB_COLUMNS: ColumnDef[] = [`);

  let jsonbCount = 0;
  for (const field of fields) {
    if (CORE_BQ_NAMES.has(field.name)) continue;

    const group = guessGroup(field.name);
    const label = humanizeLabel(field.name);

    console.log(`  { bqName: ${JSON.stringify(field.name)}, label: ${JSON.stringify(label)}, group: ${JSON.stringify(group)}, fieldType: "text", coreField: null },`);
    jsonbCount++;
  }

  console.log(`];\n`);
  console.log(`// ${jsonbCount} JSONB columns generated`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error reading BQ schema:", err.message);
  process.exit(1);
});
