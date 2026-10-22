import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";

type Row = {
  section: string;
  path: string;
  tables: string;
  columns_shown: string;
};

const rows: Row[] = [
  { section: "Activity", path: "/activity", tables: "activity_log, master, field_comments", columns_shown: "asin, sku, fieldLabel, oldValue, newValue, changedBy, changedAt, editType" },
  { section: "Calendar", path: "/calendar", tables: "client_gantt_tasks, gantt_templates, aac", columns_shown: "taskName, section, startDay, durationDays, status, completionPct, assignedTo, clientIdCode" },
  { section: "Design", path: "/design", tables: "design_status, aac", columns_shown: "clientIdCode, category, status, notes, updatedAt, updatedBy" },
  { section: "Export", path: "/export", tables: "master, attributes, aac", columns_shown: "asin, sku, clientIdCode, brandName, itemName, productType, all-attributes" },
  { section: "Import", path: "/import", tables: "master, attributes, publish_history", columns_shown: "asin, sku, clientIdCode, productType, isDirty, changeLog" },
  { section: "Publish", path: "/publish", tables: "master, publish_history, activity_log", columns_shown: "asin, sku, isDirty, changeLog, lastPublishedAt, dirtyCount, jobId" },
  { section: "Sales Monitor", path: "/sales-monitor", tables: "ppc_snapshots, ppc_alerts (cache: reports_cache)", columns_shown: "snapshotDate, data, summary, deltas, severity, message" },
  { section: "Timeline", path: "/timeline", tables: "client_gantt_tasks, gantt_templates", columns_shown: "wbs, taskName, weekStart, weekEnd, status, completionPct, assignedTo" },
  { section: "Tools", path: "/tools", tables: "(utility shell — links to subtools)", columns_shown: "n/a" },

  { section: "Products", path: "/products", tables: "master, attributes, activity_log", columns_shown: "asin, sku, clientIdCode, brandName, itemName, productType, status, mainImageUrl, listPrice, isDirty, isVp, plus all categorized JSONB columns via column registry" },
  { section: "Products", path: "/products/[id]", tables: "master, attributes, activity_log, field_comments, amazon_snapshots, content_impact_snapshots, variation_*, variety_pack_items", columns_shown: "all master columns + per-attribute requirement, completeness, comment threads, change history, sibling/family list" },

  { section: "Variations", path: "/variations", tables: "variations, variation_groups, variation_tags, master", columns_shown: "name, code, primaryDimension, themeAttributes, status, lockedAt" },
  { section: "Variations", path: "/variations/[id]", tables: "variations, variation_groups, variation_tags, variation_tag_assignments, variation_group_assignments, master", columns_shown: "groups (dimension, isVarietyPack), tags (dimension, value), assigned products list, themeAttributes" },
  { section: "Variations", path: "/variety-packs", tables: "variety_pack_items, master", columns_shown: "packProductId, includedProductId, flavor, size, color, style, units, customLabel" },

  { section: "A+ Content", path: "/design/aplus2", tables: "aplus2_sets, aac", columns_shown: "client list with A+ status" },
  { section: "A+ Content", path: "/design/aplus2/[clientIdCode]", tables: "aplus2_sets, aplus2_versions, aplus2_modules", columns_shown: "set list, version status, content type" },
  { section: "A+ Content", path: "/design/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]", tables: "aplus2_sets, aplus2_versions, aplus2_modules, aplus2_items, aplus2_assets", columns_shown: "modules, items, assets, alt text" },

  { section: "SEO", path: "/seo", tables: "seo_projects, users", columns_shown: "name, status, currentPhase, clientIdCode, brandName, assignedTo, updatedAt" },
  { section: "SEO", path: "/seo/new", tables: "seo_projects, aac, master, variations", columns_shown: "name, clientIdCode, brandName, brandUrl, variationTheme, competitors" },
  { section: "SEO", path: "/seo/[id]", tables: "seo_projects + 9 satellites", columns_shown: "currentPhase, status, version, brandGuidelines, contentRules, sX_approvedAt" },
  { section: "SEO", path: "/seo/[id]/intake", tables: "seo_asins, seo_projects", columns_shown: "asin, sku, amazonUrl, websiteUrl, variationProduct, flavor/size/color/style, existingContent" },
  { section: "SEO", path: "/seo/[id]/keywords", tables: "seo_keywords", columns_shown: "text, searchVolume, priorityTier, searchIntent, matchType, cosmoRelationship, buyerStage, keywordSource" },
  { section: "SEO", path: "/seo/[id]/reviews", tables: "seo_reviews", columns_shown: "reviewerName, starRating, title, text, sentiment, keyThemes, rufusUsableInsight, bulletMapping" },
  { section: "SEO", path: "/seo/[id]/rufus", tables: "seo_rufus", columns_shown: "phase1/2/3 questions+answers, optimizationSummary" },
  { section: "SEO", path: "/seo/[id]/cosmo", tables: "seo_cosmo_maps", columns_shown: "triples, rows, keywordCoverage, competitivePositioning" },
  { section: "SEO", path: "/seo/[id]/seo", tables: "seo_projects, seo_exports", columns_shown: "title, bullets, description, generatedContent, exports url" },
  { section: "SEO", path: "/seo/[id]/compliance", tables: "seo_compliance_reports, seo_quality_scores", columns_shown: "issues, status, overallScore, complianceScore, eeatScore, geoScore, findingsCount" },
  { section: "SEO", path: "/seo/manager", tables: "seo_projects, users, aac", columns_shown: "name, status, currentPhase, assignedTo, clientIdCode, updatedAt, version" },
  { section: "SEO", path: "/seo/clients/[clientId]", tables: "seo_projects, aac, master", columns_shown: "per-client project list with phase, status, linkedProductId" },
  { section: "SEO", path: "/seo/config", tables: "seo_settings", columns_shown: "key, value, updatedBy, updatedAt" },

  { section: "Amazon Sync", path: "/amazon-sync", tables: "amazon_sync_snapshots, amazon_sync_runs, amazon_sync_discrepancies, sp_api_credentials, master", columns_shown: "asin, runType, status, completedProducts, failedProducts, creditsUsed, fieldName, catalogValue, amazonValue, resolved" },

  { section: "Attributes", path: "/attributes", tables: "attributes, category_definitions, attribute_template_requests", columns_shown: "generalLabel, hubLabel, scLabel, vcLabel, bqLabel, referenceGroup, subgroup, isEssential, categoryMeta" },
  { section: "Attributes", path: "/portal/attributes", tables: "attributes, category_definitions, master", columns_shown: "per-attribute requirement (required/conditional/optional), hubLabel, completeness" },

  { section: "Admin", path: "/admin/users", tables: "users", columns_shown: "email, name, role, allowedSections, clientIdCode, lastLoginAt" },
  { section: "Admin", path: "/admin/issues", tables: "issue_reports", columns_shown: "reportedBy, section, description, status, adminNotes, screenshotUrl" },
  { section: "Admin", path: "/admin/logs", tables: "admin_event_log", columns_shown: "userEmail, section, action, status, resourceType, message, durationMs, createdAt" },
  { section: "Admin", path: "/admin/observability", tables: "admin_event_log", columns_shown: "section, action, status counts, latency p50/p95" },
  { section: "Admin", path: "/admin/sp-api", tables: "sp_api_credentials", columns_shown: "clientIdCode, marketplaceId, sellerId, region, isActive, lastSyncAt" },
  { section: "Admin", path: "/admin/support", tables: "support_tickets", columns_shown: "ticketNumber, title, category, priority, status, assignedTo, slaDeadline" },
  { section: "Admin", path: "/admin/sync", tables: "amazon_sync_runs, amazon_sync_snapshots", columns_shown: "runType, status, totalProducts, completedProducts, creditsUsed, startedAt" },
  { section: "Admin", path: "/admin/attributes", tables: "attributes, attribute_template_requests", columns_shown: "generalLabel, hubLabel, status, sheetUrl, finalizedAt" },
  { section: "Admin", path: "/admin/drive-folder-config", tables: "folder_tree_config", columns_shown: "tree (jsonb folder structure), updatedBy" },
  { section: "Admin", path: "/admin/ai", tables: "(seo_settings ai-config keys)", columns_shown: "model, temperature, system prompts" },
  { section: "Admin", path: "/admin/asana", tables: "(seo_settings asana keys), aac.asanaProjectGid", columns_shown: "asana workspace + project mapping" },
  { section: "Admin", path: "/admin/repo", tables: "(git metadata, no DB)", columns_shown: "branch list, last commit" },

  { section: "Clients", path: "/clients/[clientIdCode]", tables: "aac, client_onboarding_steps, master", columns_shown: "clientName, clientStatus, clientType, onboardingDate, asanaProjectGid, powerbiEmbedUrl, product count" },
  { section: "Clients", path: "/clients/[clientIdCode]/forecast", tables: "client_forecasts, forecast_tool_versions", columns_shown: "month, metric, forecastValue per month" },
  { section: "Clients", path: "/clients/[clientIdCode]/inventory", tables: "inventory_rec_settings, master, sales_summary_cache", columns_shown: "pct90d, pctQ1, pctAvg, recommended units" },
  { section: "Clients", path: "/clients/[clientIdCode]/onboarding", tables: "client_onboarding_steps, aac, drive_folders, staged_clr_products, staged_alr_links", columns_shown: "stepKey, status, completedAt, assigneeId, metadata" },
  { section: "Clients", path: "/clients/[clientIdCode]/timeline", tables: "client_gantt_tasks, gantt_templates", columns_shown: "wbs, section, taskName, status, weekStart, weekEnd, completionPct" },
  { section: "Clients", path: "/clients/aac", tables: "aac", columns_shown: "clientIdCode, clientName, clientStatus, clientType, onboardingDate" },
  { section: "Onboarding", path: "/onboarding", tables: "client_onboarding_steps, staged_clr_products, staged_alr_links, attributes, category_definitions, drive_folders, aac", columns_shown: "stepKey, status, staged products preview, CLR diff, ALR link table" },

  { section: "Sales", path: "/calculator", tables: "client_forecasts, master", columns_shown: "ASIN-level revenue projection inputs/outputs" },
  { section: "Sales", path: "/sales-summary", tables: "sales_summary_cache, aac, seo_settings (sales_summary_layout)", columns_shown: "clientName, brandName, current/previous/yoy/mtd/ytd metrics, ACOS, ROAS, TACOS, sparkline" },
  { section: "Sales", path: "/sales-summary/config", tables: "seo_settings (sales_summary_layout), aac", columns_shown: "clientIdCode, clientName, ordered, hidden" },
  { section: "Sales", path: "/sales-summary/forecast", tables: "client_forecasts, sales_summary_cache", columns_shown: "month, metric, forecastValue, actual" },
  { section: "Sales", path: "/sales-summary/forecast-tool", tables: "forecast_tool_versions, forecast_tool_cells, forecast_tool_asins, forecast_tool_asin_cells", columns_shown: "version name, asin, sku, sharePct, per-month value (numeric)" },
  { section: "Sales", path: "/sales-summary/inventory", tables: "inventory_rec_settings, master, sales_summary_cache", columns_shown: "asin, sku, on-hand, days-of-cover, recommendation" },

  { section: "PPC", path: "/ppc", tables: "ppc_snapshots, ppc_alerts, aac", columns_shown: "clientIdCode, snapshotDate, summary, alert severity, message" },
  { section: "PPC", path: "/ppc/[clientIdCode]", tables: "ppc_snapshots, ppc_approvals, ppc_decisions, ppc_alerts, users", columns_shown: "data, summary, deltas, approvalType, status, decision, expectedOutcome, actualOutcome" },

  { section: "Finances", path: "/finances", tables: "(Redshift settlements, BigQuery)", columns_shown: "settlement net, payouts, fees breakdown, sankey flow" },
  { section: "Finances", path: "/portal/finance", tables: "(Redshift settlements)", columns_shown: "client-scoped payouts + statements" },
  { section: "Finances", path: "/portal/finance/reports", tables: "reports_cache (finance scope), Redshift", columns_shown: "monthly statement PDF list" },

  { section: "Reports", path: "/reports", tables: "reports_cache, BigQuery", columns_shown: "overview cards, share of voice, period comparative, ad audit" },
  { section: "Reports", path: "/reports/monthly", tables: "reports_cache, report_section_config", columns_shown: "section toggles, monthly KPIs, charts" },
  { section: "Reports", path: "/reports/monthly/config", tables: "report_section_config", columns_shown: "scope, scopeKey, sectionKey, enabled" },
  { section: "Reports", path: "/reports/monthly/print", tables: "reports_cache", columns_shown: "print-ready monthly report layout" },

  { section: "Auth", path: "/auth/register", tables: "users", columns_shown: "email, name, requested role" },
  { section: "Auth", path: "/auth/signin", tables: "users", columns_shown: "Google OAuth flow (no DB columns rendered)" },

  { section: "Portal", path: "/portal", tables: "aac, client_onboarding_steps", columns_shown: "client landing tiles" },
  { section: "Portal", path: "/portal/aplus", tables: "aplus_modules, master", columns_shown: "moduleType, status, headlineText for client review" },
  { section: "Portal", path: "/portal/aplus/[productId]", tables: "aplus_sets, aplus_modules, aplus_module_images, aplus_comments", columns_shown: "module preview, comment threads, approval status" },
  { section: "Portal", path: "/portal/products", tables: "master, attributes", columns_shown: "client-scoped product list (filtered by clientIdCode)" },
  { section: "Portal", path: "/portal/reports", tables: "reports_cache", columns_shown: "client-scoped overview + share of voice" },
  { section: "Portal", path: "/portal/sales", tables: "sales_summary_cache", columns_shown: "current vs previous, ACOS, ROAS, TACOS" },
  { section: "Portal", path: "/portal/sales-monitor", tables: "ppc_snapshots, ppc_alerts (client-scoped)", columns_shown: "live KPI tiles, daily metrics" },
  { section: "Portal", path: "/portal/sales/forecast", tables: "client_forecasts", columns_shown: "month, metric, forecastValue" },
  { section: "Portal", path: "/portal/sales/inventory", tables: "inventory_rec_settings, sales_summary_cache", columns_shown: "stock health, days-of-cover" },
  { section: "Portal", path: "/portal/sales/overview", tables: "sales_summary_cache", columns_shown: "weekly KPI overview" },
  { section: "Portal", path: "/portal/timeline", tables: "client_gantt_tasks, gantt_templates", columns_shown: "wbs, taskName, weekStart, weekEnd, status, completionPct (portal-visible only)" },
  { section: "Portal", path: "/portal/design", tables: "design_status, drive_files", columns_shown: "category, status, notes" },
  { section: "Portal", path: "/portal/design/brandstory", tables: "brand_story, master", columns_shown: "data (jsonb story modules)" },
  { section: "Portal", path: "/portal/design/listing-images", tables: "drive_files (entityType=listing-image)", columns_shown: "displayName, mimeType, sizeBytes, uploadedBy" },
  { section: "Portal", path: "/portal/design/storefront", tables: "drive_files (entityType=storefront)", columns_shown: "displayName, uploadedBy, createdAt" },
  { section: "Portal", path: "/portal/tools/rev-calculator", tables: "client_forecasts", columns_shown: "revenue projection sliders" },
];

// All public tables in the Supabase project (lmmbeswipsjygogwksol), alphabetised.
const ALL_TABLES = [
  "aac",
  "activity_log",
  "admin_event_log",
  "amazon_snapshots",
  "amazon_sync_discrepancies",
  "amazon_sync_runs",
  "amazon_sync_snapshots",
  "aplus_comments",
  "aplus_module_images",
  "aplus_modules",
  "aplus_sets",
  "attribute_template_requests",
  "attributes",
  "brand_story",
  "catalog_listing_snapshots",
  "category_attributes",
  "category_definitions",
  "client_forecasts",
  "client_gantt_tasks",
  "client_onboarding_steps",
  "clr_unmatched_fields",
  "content_impact_snapshots",
  "design_status",
  "drive_files",
  "drive_folders",
  "field_comments",
  "folder_tree_config",
  "forecast_tool_asin_cells",
  "forecast_tool_asins",
  "forecast_tool_cells",
  "forecast_tool_versions",
  "gantt_templates",
  "inventory_rec_settings",
  "issue_reports",
  "master",
  "ppc_alerts",
  "ppc_approvals",
  "ppc_decisions",
  "ppc_snapshots",
  "product_key_overrides",
  "publish_history",
  "report_section_config",
  "reports_cache",
  "sales_summary_cache",
  "seo_asins",
  "seo_compliance_reports",
  "seo_cosmo_maps",
  "seo_exports",
  "seo_keywords",
  "seo_projects",
  "seo_quality_scores",
  "seo_reviews",
  "seo_rufus",
  "seo_settings",
  "sp_api_credentials",
  "staged_alr_links",
  "staged_clr_products",
  "support_tickets",
  "users",
  "variation_group_assignments",
  "variation_groups",
  "variation_tag_assignments",
  "variation_tags",
  "variations",
  "variety_pack_items",
];

// Tables that "+ 9 satellites" expands to on /seo/[id]. seo_projects is already listed explicitly.
const SEO_SATELLITES = [
  "seo_asins",
  "seo_keywords",
  "seo_reviews",
  "seo_rufus",
  "seo_cosmo_maps",
  "seo_compliance_reports",
  "seo_exports",
  "seo_quality_scores",
  "seo_settings",
];

// Tables that the `variation_*` wildcard on /products/[id] expands to.
const VARIATION_WILDCARD = [
  "variations",
  "variation_groups",
  "variation_tags",
  "variation_tag_assignments",
  "variation_group_assignments",
];

function tablesUsedBy(rawTables: string): Set<string> {
  const used = new Set<string>();
  if (rawTables.includes("9 satellites")) {
    for (const t of SEO_SATELLITES) used.add(t);
  }
  if (rawTables.includes("variation_*")) {
    for (const t of VARIATION_WILDCARD) used.add(t);
  }
  for (const t of ALL_TABLES) {
    // eslint-disable-next-line react-doctor/js-hoist-regexp
    const re = new RegExp(`\\b${t}\\b`);
    if (re.test(rawTables)) used.add(t);
  }
  return used;
}

const matrixRows = rows.map((r) => {
  const used = tablesUsedBy(r.tables);
  const out: Record<string, string> = {
    section: r.section,
    path: r.path,
    tables: r.tables,
  };
  for (const t of ALL_TABLES) {
    out[t] = used.has(t) ? "✓" : "";
  }
  out.columns_shown = r.columns_shown;
  return out;
});

const header = ["section", "path", "tables", ...ALL_TABLES, "columns_shown"];
const ws = XLSX.utils.json_to_sheet(matrixRows, { header });
ws["!cols"] = [
  { wch: 16 }, // section
  { wch: 42 }, // path
  { wch: 50 }, // tables (raw)
  ...ALL_TABLES.map((t) => ({ wch: Math.max(t.length + 2, 6) })),
  { wch: 80 }, // columns_shown
];
ws["!freeze"] = { xSplit: 3, ySplit: 1 };

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Pages × Tables");
const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync("/Users/manu/1o8Hub/docs/app-pages.xlsx", out);

const totalChecks = matrixRows.reduce(
  (n, r) => n + ALL_TABLES.reduce((m, t) => m + (r[t] ? 1 : 0), 0),
  0,
);
console.log(
  `Wrote ${matrixRows.length} pages × ${ALL_TABLES.length} tables (${totalChecks} ✓ marks) to docs/app-pages.xlsx`,
);
