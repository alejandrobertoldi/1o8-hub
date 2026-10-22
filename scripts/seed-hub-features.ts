/* eslint-disable react-doctor/async-parallel */
/**
 * Seeds hub_features with the initial platform feature list.
 * Idempotent: upserts on name. Safe to re-run.
 * Usage: npm run seed-hub-features
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type FeatureStatus = "done" | "in_progress" | "planned";

interface FeatureSeed {
  name: string;
  description: string;
  status: FeatureStatus;
  progress: number;
  domain: string;
  displayOrder: number;
}

const features: FeatureSeed[] = [
  // ── Done ──────────────────────────────────────────────────────────
  { name: "Auth & Roles", description: "NextAuth v5, Google OAuth, 5 roles (admin/editor/viewer/client/pending)", status: "done", progress: 100, domain: "Platform", displayOrder: 10 },
  { name: "Product Catalog", description: "Full CRUD, inline editing, 972-column registry with JSONB blobs", status: "done", progress: 100, domain: "Products", displayOrder: 20 },
  { name: "Variations Builder", description: "Hierarchical grouping: exclusive groups + cross-cutting tags, auto-detect, bulk assign", status: "done", progress: 100, domain: "Products", displayOrder: 30 },
  { name: "A+ Content Editor", description: "Up to 7 modules per product, image slots, Google Drive upload, comments", status: "done", progress: 100, domain: "A+", displayOrder: 40 },
  { name: "SEO Pipeline (S1–S6)", description: "Full 6-phase pipeline: intake → keywords → reviews → Rufus Q&A → COSMO → content gen", status: "done", progress: 100, domain: "SEO", displayOrder: 50 },
  { name: "SEO Manager", description: "Content Control Center, per-client detail views, Score Now, backend keyword refine", status: "done", progress: 100, domain: "SEO", displayOrder: 60 },
  { name: "Finance Dashboard", description: "Redshift settlement data, Sankey revenue flow, hub + client portal views", status: "done", progress: 100, domain: "Finance", displayOrder: 70 },
  { name: "Client Portal", description: "Client-facing views: A+ approval, reports, sales, finance statements", status: "done", progress: 100, domain: "Portal", displayOrder: 80 },
  { name: "Amazon Sync", description: "SP-API + Rainforest comparisons, discrepancy tracking per ASIN", status: "done", progress: 100, domain: "Platform", displayOrder: 90 },
  { name: "BigQuery Publishing", description: "Dirty-row tracking, full WRITE_TRUNCATE table write-back to BQ", status: "done", progress: 100, domain: "Platform", displayOrder: 100 },
  { name: "Reports & Export", description: "PDF, XLSX, DOCX generation for client reports", status: "done", progress: 100, domain: "Platform", displayOrder: 110 },
  { name: "Admin Panel", description: "User management, event log, AI config (model/prompts)", status: "done", progress: 100, domain: "Admin", displayOrder: 120 },
  { name: "Client Management", description: "Onboarding/offboarding dates, status tracking, Asana sync", status: "done", progress: 100, domain: "Clients", displayOrder: 130 },
  { name: "Onboarding Gantt Chart", description: "AIA/NTA onboarding timeline templates with visual Gantt view", status: "done", progress: 100, domain: "Clients", displayOrder: 140 },
  { name: "Design Status Tracker", description: "Per-client design status for brand story, A+, listing images, storefront", status: "done", progress: 100, domain: "Platform", displayOrder: 150 },
  { name: "Google Drive Integration", description: "File upload and folder management for A+ assets", status: "done", progress: 100, domain: "Platform", displayOrder: 160 },
  { name: "Revenue Calculator", description: "Public Amazon FBA calculator — fees, fulfillment, net profit", status: "done", progress: 100, domain: "Platform", displayOrder: 170 },

  // ── In Progress ───────────────────────────────────────────────────
  { name: "Hub Status Tracker", description: "Public /status page with Done / In Progress / Planned feature board", status: "in_progress", progress: 20, domain: "Platform", displayOrder: 10 },
  { name: "Master Tables Rethink", description: "Supabase as live source of truth, BigQuery as backup/analytics layer", status: "in_progress", progress: 20, domain: "Platform", displayOrder: 20 },
  { name: "Sales Cache", description: "PostgreSQL cache for sales summary data with 6-hour cron refresh for instant loads", status: "in_progress", progress: 15, domain: "Finance", displayOrder: 30 },

  // ── Planned ───────────────────────────────────────────────────────
  { name: "Onboarding Merge-Master Fix", description: "Switch cascade-delete to upsert-in-place to preserve activity log on re-merge", status: "planned", progress: 0, domain: "Clients", displayOrder: 10 },
  { name: "PPC Campaign Manager", description: "Sponsored products campaign creation, bid management, and performance tracking", status: "planned", progress: 0, domain: "Products", displayOrder: 20 },
  { name: "Forecasting Dashboard", description: "Inventory and revenue forecasting with trend analysis", status: "planned", progress: 0, domain: "Finance", displayOrder: 30 },
  { name: "Competitor Analysis", description: "ASIN comparison, keyword gap analysis, and competitive intelligence", status: "planned", progress: 0, domain: "SEO", displayOrder: 40 },
  { name: "Client Onboarding Admin UI", description: "In-hub CRUD for onboarding steps without needing Drizzle Studio", status: "planned", progress: 0, domain: "Admin", displayOrder: 50 },
];

async function main() {
  const { db } = await import("../src/lib/db");
  const { hubFeatures } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  let inserted = 0;
  let updated = 0;

  for (const feature of features) {
    const existing = await db
      .select({ id: hubFeatures.id })
      .from(hubFeatures)
      .where(eq(hubFeatures.name, feature.name))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(hubFeatures)
        .set({
          description: feature.description,
          status: feature.status,
          progress: feature.progress,
          domain: feature.domain,
          displayOrder: feature.displayOrder,
          updatedAt: new Date(),
        })
        .where(eq(hubFeatures.name, feature.name));
      updated++;
    } else {
      await db.insert(hubFeatures).values(feature);
      inserted++;
    }
  }

  console.log(`Seed complete: ${inserted} inserted, ${updated} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
