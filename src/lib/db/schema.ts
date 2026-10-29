import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  serial,
  integer,
  doublePrecision,
  bigint,
  numeric,
  smallint,
  unique,
  date,
  time,
  char,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ContentGuidelines } from "@/lib/variation-guidelines";
import { ALL_TEAM_DEPARTMENTS } from "@/lib/team/departments";

// ─── Enums ───────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "viewer",
  "editor",
  "admin",
  "client",
  "pending",
  "prospect",
  "super_admin",
  "owner",
]);

export const aplusModuleTypeEnum = pgEnum("aplus_module_type", [
  "background_image_text",
  "comparison_table_1",
  "comparison_table_2",
  "comparison_table_3",
  "dual_images_text",
  "four_images_text",
  "full_image",
  "full_video",
  "hotspots_1",
  "hotspots_2",
  "navigation_carousel",
  "qa",
  "regimen_carousel",
  "simple_image_carousel",
  "single_image_text",
  "technical_specifications",
  "text",
  "video_image_carousel",
  "video_text",
]);

export const aplusModuleStatusEnum = pgEnum("aplus_module_status", [
  "draft",
  "in_review",
  "approved",
  "uploaded",
  "live",
]);

export const clientTypeEnum = pgEnum("client_type", ["AIA", "NTA"]);

export const ganttTaskStatusEnum = pgEnum("gantt_task_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const hubFeatureStatusEnum = pgEnum("hub_feature_status", [
  "done",
  "in_progress",
  "planned",
]);

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "holiday",
  "deadline",
  "content",
  "milestone",
  "pto",
]);

export const timeOffStatusEnum = pgEnum("time_off_status", [
  "pending",
  "approved",
  "denied",
  "cancelled",
]);

// ─── Team user detail enums (migration 0090) ─────────────────────────
// `contract_type` and `rate_period` are separate facts, not one field: a
// contractor can be paid monthly and a salaried person is quoted yearly.
export const employmentStatusEnum = pgEnum("employment_status", [
  "active",
  "inactive",
  "alumni",
]);
export const contractTypeEnum = pgEnum("contract_type", [
  "hourly",
  "salaried",
  "contractor",
]);
export const ratePeriodEnum = pgEnum("rate_period", ["hour", "month", "year"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "wise",
  "payoneer",
  "paypal",
  "other",
]);
export const paymentCadenceEnum = pgEnum("payment_cadence", [
  "monthly",
  "biweekly",
  "weekly",
  "per_invoice",
]);
// Functional department (org-chart axis). Distinct from clientIdCode, which
// remains the INTERNAL_TEAMS axis (agency / marketplace / external). Values
// live in src/lib/team/departments.ts — keep this enum in lockstep.
export const teamDepartmentEnum = pgEnum("team_department", ALL_TEAM_DEPARTMENTS);

// ─── Users ───────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("viewer"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    allowedSections: jsonb("allowed_sections")
      .$type<string[]>()
      .notNull()
      .default([]),
    clientIdCode: text("client_id_code"),
    // The user's HOLIDAY CALENDAR: one of VALID_COUNTRY_CODES
    // ('US' | 'PK' | 'ES' | 'PT' | 'PH' | 'FI') or null, matching
    // public_holidays.country_code. This is a POLICY ASSIGNMENT, not
    // geography (design D-G) — "which set of days off this person gets" —
    // so a Manila-based person working US hours is assigned 'US'. Do not
    // "correct" it to their country of residence: every seeded holiday is a
    // day NOT deducted from a time-off request, so the value decides their
    // leave allowance. A code is only usable once public_holidays actually
    // has rows for it — see the note on VALID_COUNTRY_CODES.
    // NULL means no calendar assigned, and a submission is REFUSED (D-C)
    // rather than silently counted against an empty holiday set — the
    // working_days snapshot is never recomputed, so a wrong count is
    // permanent. Set via PUT /api/admin/users.
    countryCode: char("country_code", { length: 2 }),
    // Where the person physically is, as an IANA zone string
    // ("America/Los_Angeles", "Asia/Karachi"). Drives ONLY the day boundary
    // (todayInZone in src/lib/time-off/guards.ts): is a request retroactive,
    // is an approved request still cancellable. Deliberately unconstrained —
    // any zone the runtime accepts. NULL falls back to UTC, which is a soft
    // failure that self-corrects the moment it is set.
    residenceTimezone: text("residence_timezone"),
    // Where this person books time off: "hub" (the hub's request + approval
    // flow) or "gusto" (they request in Gusto; the hub only mirrors it).
    timeOffVia: varchar("time_off_via", { length: 10 }).notNull().default("hub"),
    // Their Gusto employee uuid, matched by email on each Gusto sync.
    gustoEmployeeUuid: text("gusto_employee_uuid"),
    // Who decides their hub time off requests (an admin or above). Null: any admin.
    timeOffApproverId: uuid("time_off_approver_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    // ── Tier-0 team-directory fields (migration 0090) ──
    // Deliberately the ONLY new person-data on `users`. Everything more
    // sensitive lives in user_profiles / user_pay_periods /
    // user_payment_details, because the sensitivity tier IS the table
    // boundary (spec D3): GET /api/admin/users did an unprojected
    // select().from(users), so keeping these fields off this table makes the
    // protection structural rather than a code-review habit.
    // `phone` and `slackHandle` are self-tier, the other three admin-tier —
    // see FIELD_TIERS in src/lib/team/access.ts.
    phone: varchar("phone", { length: 40 }),
    slackHandle: varchar("slack_handle", { length: 80 }),
    jobTitle: varchar("job_title", { length: 120 }),
    // Full title list; jobTitle is the primary / first entry, kept in sync
    // by PATCH /api/team/[userId]. Empty array means "no titles".
    jobTitles: text("job_titles").array().notNull().default([]),
    department: teamDepartmentEnum("department"),
    // Multi-department membership (0118). Parallel to job_titles. A person may
    // sit in several departments; the org tree renders a card under each.
    // The scalar `department` above is left vestigial (additive-only).
    departments: teamDepartmentEnum("departments").array().notNull().default([]),
    // At most one true per department — enforced by the partial unique index
    // idx_users_one_lead_per_department (SQL in migration 0116; drizzle has no
    // partial-unique primitive that matches PG exactly, so the index lives in
    // SQL and is listed here as a comment so it is not "fixed" as drift).
    isDepartmentLead: boolean("is_department_lead").notNull().default(false),
    // The department this person LEADS, decoupled from `department` (the one
    // they are a MEMBER of) so a lead can come from outside — e.g. an Account
    // Manager (department = null) leading Design. Nullable = leads nothing.
    // At most one lead per department, enforced by the partial unique index
    // idx_users_one_lead_per_department_v2 (SQL in migration 0117; drizzle has
    // no partial-unique primitive that matches PG, so the index lives in SQL
    // and is commented here so a later generate does not "fix" it as drift).
    // `isDepartmentLead` above is now vestigial (kept per additive-only rule).
    // SUPERSEDED by the user_department_leads junction (0118). Frozen vestigial;
    // buildOrgTree now reads the junction, aggregated as leadsDepartments[].
    leadsDepartment: teamDepartmentEnum("leads_department"),
    startDate: date("start_date"),
    // NOT NULL DEFAULT 'active' backfills every existing row to 'active',
    // including the 1o8-era duplicates. They must be set to 'alumni' by hand
    // before the `ilike '%@marketfoundry.agency'` filter can leave /api/team —
    // that removal is a follow-up, not part of this work.
    employmentStatus: employmentStatusEnum("employment_status")
      .notNull()
      .default("active"),
    asanaEmail: varchar("asana_email", { length: 255 }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_users_client_id_code").on(table.clientIdCode),
    index("idx_users_department").on(table.department),
  ]
);

/**
 * Which departments each person LEADS (0118). Replaces the single
 * users.leads_department scalar so one person can lead several departments.
 * UNIQUE(department) keeps at most one lead per department; the composite PK
 * lets a person hold many rows. Source of truth for org-tree leadership.
 */
export const userDepartmentLeads = pgTable(
  "user_department_leads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    department: teamDepartmentEnum("department").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.department] }),
    uniqueIndex("idx_user_department_leads_one_per_dept").on(t.department),
  ]
);

// ─── Time Entries (team hours tracker) ───────────────────────────────
// One row per logged work session: user × client × date × time range.
// clientIdCode is a soft reference to aac.clientIdCode; the literal
// "INTERNAL" marks non-client time. Entries never cross midnight.
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    clientIdCode: text("client_id_code").notNull(),
    entryDate: date("entry_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    hours: numeric("hours", { precision: 4, scale: 2 }).notNull(),
    note: text("note"),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_time_entries_user_date").on(t.userId, t.entryDate),
    index("idx_time_entries_client_date").on(t.clientIdCode, t.entryDate),
  ]
);

// Admin-managed list of work categories for time entries. `time_entries.category`
// stores the label as text (not an FK) so renaming/deactivating a category never
// orphans or rewrites history. Deactivation (active=false) is a soft delete.
export const hourCategories = pgTable("hour_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Variation Data Type ──────────────────────────────────────────────
// Canonical type for the master.variations JSONB blob.
// 8 known Amazon-sourced keys + extensible index signature for
// category-specific dimensions (e.g., Scent, Material, Wattage).
//
// Variation Hierarchy (3 levels):
//   VariationID  — Amazon's family grouping (from SP-API). All ASINs
//                  sharing a VariationID belong to the same listing
//                  family. Stored in variations.VariationID.
//   VariationGroup — Our custom sub-grouping within a family. User-
//                    assigned via the SEO wizard or product API. Stored
//                    in master.variationGroup (varchar, NOT inside JSONB).
//                    Enables partial targeting: instead of selecting an
//                    entire family, users can target a subset (e.g.,
//                    "Citrus Flavors" within a 30-child family).
//   Individual ASIN — The leaf level. Each child ASIN can belong to
//                     at most one VariationGroup.
//
// Project naming convention: {CLIENTCODEID}_{VARIATIONID}_{GROUPID}_{ASIN}
//   - Parts are omitted when empty (filter(Boolean).join("_"))
export type VariationData = {
  VariationID?: string;
  VariationProduct?: string;
  VariationThemeName?: string;
  ChildRelationshipType?: string;
  Color?: string;
  Size?: string;
  Flavor?: string;
  Style?: string;
  [key: string]: string | undefined;
};

// ─── Products ────────────────────────────────────────────────────────
// Hybrid schema: ~30 core columns (indexed, searchable) +
// categorized JSONB blobs for the remaining ~940 columns +
// _raw_column_values JSONB for zero-data-loss guarantee.

export const master = pgTable(
  "master",
  {
    // ── Primary key ──
    id: uuid("id").defaultRandom().primaryKey(),

    // ── Product Identity (core searchable columns) ──
    asin: varchar("asin", { length: 20 }),
    sku: varchar("sku", { length: 100 }),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    marketplace: varchar("marketplace", { length: 50 }),
    country: varchar("country", { length: 10 }),
    status: varchar("status", { length: 50 }),
    parentageLevel: varchar("parentage_level", { length: 20 }),
    parentSku: varchar("parent_sku", { length: 100 }),
    parentAsin: varchar("parent_asin", { length: 20 }),
    childRelationshipType: varchar("child_relationship_type", { length: 20 }),

    // ── Brand & Title ──
    brandName: varchar("brand_name", { length: 255 }),
    itemName: text("item_name"),
    itemHighlight: text("item_highlight"),
    summarizedTitle: text("summarized_title"),
    productType: varchar("product_type", { length: 255 }),

    // ── Pricing ──
    listPrice: varchar("list_price", { length: 50 }),
    costPrice: varchar("cost_price", { length: 50 }),

    // ── Images ──
    mainImageUrl: text("main_image_url"),

    // ── Classification ──
    itemTypeKeyword: varchar("item_type_keyword", { length: 255 }),
    feedProductType: varchar("feed_product_type", { length: 255 }),
    recommendedBrowseNodes: text("recommended_browse_nodes"),
    genericKeywords: text("generic_keywords"),
    platinumKeywords: text("platinum_keywords"),

    // ── Variation grouping (user-defined, not Amazon-sourced) ──
    // Middle tier of the hierarchy: VariationID → VariationGroup → ASIN
    // Assigned via SEO wizard or PATCH /api/products/variation-groups
    variationGroup: varchar("variation_group", { length: 100 }),

    // ── Variation Product flag ──
    // true when this product is the "parent" variation product (VP) in its group.
    // Set by the Variation Builder. Per-product, not per-group.
    isVp: boolean("is_vp").notNull().default(false),

    // ── Variation hierarchy FKs (set by Variation Builder) ──
    variationRef: uuid("variation_ref"),
    groupRef: uuid("group_ref"),

    // ── Listing-level content guidelines (4th tier, overrides group/variation/brand) ──
    contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>(),

    // ── Categorized JSONB blobs ──
    contentSeo: jsonb("content_seo").$type<Record<string, string>>(),
    variations: jsonb("variations").$type<VariationData>(),
    packaging: jsonb("packaging").$type<Record<string, string>>(),
    targetAudience: jsonb("target_audience").$type<Record<string, string>>(),
    fulfillment: jsonb("fulfillment").$type<Record<string, string>>(),
    productAttributes: jsonb("product_attributes").$type<
      Record<string, string>
    >(),
    nutritionSupplements: jsonb("nutrition_supplements").$type<
      Record<string, string>
    >(),
    complianceSafety: jsonb("compliance_safety").$type<
      Record<string, string>
    >(),
    images: jsonb("images").$type<Record<string, string>>(),
    dimensionsWeight: jsonb("dimensions_weight").$type<
      Record<string, string>
    >(),
    otherAttributes: jsonb("other_attributes").$type<
      Record<string, string>
    >(),

    // ── Raw column values (all 972 columns verbatim for zero data loss) ──
    rawColumnValues: jsonb("raw_column_values").$type<
      Record<string, string>
    >(),

    // ── Change tracking ──
    isDirty: boolean("is_dirty").notNull().default(false),
    changeLog: jsonb("change_log")
      .$type<
        Array<{
          field: string;
          oldValue: string | null;
          newValue: string | null;
          changedBy: string;
          changedAt: string;
        }>
      >()
      .default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_products_asin").on(table.asin),
    index("idx_products_sku").on(table.sku),
    index("idx_products_client_id").on(table.clientIdCode),
    index("idx_products_marketplace").on(table.marketplace),
    index("idx_products_country").on(table.country),
    index("idx_products_status").on(table.status),
    index("idx_products_brand").on(table.brandName),
    index("idx_products_parent_sku").on(table.parentSku),
    index("idx_products_is_dirty").on(table.isDirty),
    index("idx_master_is_vp").on(table.isVp),
    unique("uq_master_client_sku").on(table.clientIdCode, table.sku),
  ]
);

// ─── Attributes (renamed from column_attributes) ───────────────────
// Canonical attribute registry: one row per Hub attribute, all label
// variants (SC / VC / BQ / SB / CLR / ALR) as columns, plus per-category
// metadata in category_meta JSONB. See
// docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md.

export type CategoryMetaEntry = {
  requirement: string;
  validValues: string[] | null;
  description: string | null;
  example: string | null;
  isKey: boolean;
  /** Left-to-right column index from the CLR Template tab. */
  sortOrder?: number;
  /** CLR Template tab group (Listing Identity, Images, Product Details, …). */
  groupName?: string | null;
};
export type CategoryMeta = Record<string, Record<string, CategoryMetaEntry>>;

export const attributes = pgTable(
  "attributes",
  {
    id: serial("id").primaryKey(),
    generalLabel: varchar("general_label", { length: 255 }).notNull().unique(),
    description: text("description"),
    scLabel: text("sc_label"),
    scLabelMulti: varchar("sc_label_multi", { length: 20 }),
    vcLabel: text("vc_label"),
    bqLabel: text("bq_label"),
    sbLabel: text("sb_label"),
    clrLabel: text("clr_label"),
    alrLabel: text("alr_label"),
    bqDataType: varchar("bq_data_type", { length: 20 }).default("STRING"),
    labelMaxOptions: varchar("label_max_options", { length: 10 }),
    referenceGroup: varchar("reference_group", { length: 100 }).notNull(),
    subgroup: varchar("subgroup", { length: 100 }).default(""),
    isEssential: boolean("is_essential").notNull().default(false),
    isVpFlag: boolean("is_vp_flag").notNull().default(false),
    hubLabel: varchar("hub_label", { length: 255 }),
    categoryMeta: jsonb("category_meta")
      .$type<CategoryMeta>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("idx_attributes_general_label").on(table.generalLabel),
    index("idx_attributes_reference_group").on(table.referenceGroup),
    index("idx_attributes_subgroup").on(table.subgroup),
    index("idx_attributes_essential").on(table.isEssential),
    index("idx_attributes_alr_label").on(table.alrLabel),
    index("idx_attributes_category_meta").using("gin", table.categoryMeta),
  ]
);

// ─── AAC Clients ─────────────────────────────────────────────────────
// Client metadata imported from BigQuery:
// BQ AAC source (env-driven project/dataset — see bigquery.ts)

export const aac = pgTable(
  "aac",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull().unique(),
    clientStatus: varchar("client_status", { length: 50 }).notNull(),
    clientName: varchar("client_name", { length: 255 }),
    rawData: jsonb("raw_data").$type<Record<string, string>>(),
    clientType: clientTypeEnum("client_type"),
    onboardingDate: timestamp("onboarding_date", { withTimezone: true }),
    offboardingDate: timestamp("offboarding_date", { withTimezone: true }),
    portalTimelineEnabled: boolean("portal_timeline_enabled").notNull().default(false),
    asanaProjectGid: varchar("asana_project_gid", { length: 100 }),
    powerbiEmbedUrl: text("powerbi_embed_url"),
    clientLogoUrl: text("client_logo_url"),
    // Per-client portal section visibility (source of truth for
    // client/prospect roles; admin/editor/viewer still use
    // users.allowed_sections). Keep in sync with DEFAULT_CLIENT_SECTIONS
    // in src/lib/permissions.ts.
    allowedSections: text("allowed_sections")
      .array()
      .notNull()
      .default([
        "timeline","sales","products","seo","design","reports","finances",
        "brandstory","aplus","listing-images","storefront","files","finance-reports",
      ]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_aac_client_id_code").on(table.clientIdCode),
    index("idx_aac_client_status").on(table.clientStatus),
  ]
);

// ─── Publish History ────────────────────────────────────────────────

export const publishHistory = pgTable("publish_history", {
  id: serial("id").primaryKey(),
  publishedBy: varchar("published_by", { length: 255 }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rowsPublished: integer("rows_published").notNull(),
  jobId: varchar("job_id", { length: 255 }),
  dirtyCount: integer("dirty_count").notNull(),
  changes: jsonb("changes")
    .$type<
      Array<{
        asin: string | null;
        sku: string | null;
        edits: Array<{
          field: string;
          oldValue: string | null;
          newValue: string | null;
        }>;
      }>
    >()
    .default([]),
}, (table) => [
  index("idx_publish_history_published_at").on(table.publishedAt),
]);

// ─── Activity Log ───────────────────────────────────────────────────

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }),
    sku: varchar("sku", { length: 100 }),
    clientIdCode: varchar("client_id_code", { length: 50 }),
    itemName: text("item_name"),
    fieldLabel: varchar("field_label", { length: 255 }).notNull(),
    bqName: varchar("bq_name", { length: 255 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: varchar("changed_by", { length: 255 }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editType: varchar("edit_type", { length: 20 }).notNull().default("single"),
  },
  (table) => [
    index("idx_activity_log_changed_at").on(table.changedAt),
    index("idx_activity_log_changed_by").on(table.changedBy),
    index("idx_activity_log_product_id").on(table.productId),
    index("idx_activity_log_client").on(table.clientIdCode),
  ]
);

// ─── Field Comments ────────────────────────────────────────────────

export const fieldComments = pgTable(
  "field_comments",
  {
    id: serial("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    bqName: varchar("bq_name", { length: 255 }).notNull(),
    comment: text("comment").notNull(),
    author: varchar("author", { length: 255 }).notNull(),
    authorName: varchar("author_name", { length: 255 }),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_field_comments_product").on(table.productId),
    index("idx_field_comments_product_field").on(table.productId, table.bqName),
    index("idx_field_comments_resolved").on(table.resolved),
  ]
);

// ─── Amazon Snapshots ──────────────────────────────────────────────
// Stores normalized SP-API data and comparison results per product.

export const amazonSnapshots = pgTable(
  "amazon_snapshots",
  {
    id: serial("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }).notNull(),
    marketplace: varchar("marketplace", { length: 50 }),
    normalizedData: jsonb("normalized_data").notNull(),
    comparisonResult: jsonb("comparison_result"),
    overallMatch: integer("overall_match"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_amazon_snapshots_product").on(table.productId),
    index("idx_amazon_snapshots_asin").on(table.asin),
    index("idx_amazon_snapshots_fetched").on(table.fetchedAt),
  ]
);

// ─── SP-API Credentials ────────────────────────────────────────────
// Per-client SP-API refresh tokens and seller IDs.

export const spApiCredentials = pgTable(
  "sp_api_credentials",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    marketplaceId: varchar("marketplace_id", { length: 50 }).notNull(),
    sellerId: varchar("seller_id", { length: 50 }).notNull(),
    refreshToken: text("refresh_token").notNull(),
    region: varchar("region", { length: 10 }).notNull().default("na"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sp_api_creds_client").on(table.clientIdCode),
    index("idx_sp_api_creds_active").on(table.isActive),
  ]
);

// ─── Category Definitions ─────────────────────────────────────────────
// One row per client + productType + marketplace combination.
// Populated by uploading Category Listing Report XLSM files.

export const categoryDefinitions = pgTable(
  "category_definitions",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productType: varchar("product_type", { length: 255 }).notNull(),
    marketplaceId: varchar("marketplace_id", { length: 50 })
      .notNull()
      .default("ATVPDKIKX0DER"),
    totalAttributes: integer("total_attributes").notNull().default(0),
    requiredCount: integer("required_count").notNull().default(0),
    conditionalCount: integer("conditional_count").notNull().default(0),
    optionalCount: integer("optional_count").notNull().default(0),
    uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Snapshot of product attribute values at upload time: { [productId]: { [bqName]: value } } */
    baselineSnapshot: jsonb("baseline_snapshot").$type<
      Record<string, Record<string, string | null>>
    >(),
  },
  (table) => [
    index("idx_catdef_client").on(table.clientIdCode),
    index("idx_catdef_product_type").on(table.productType),
    index("idx_catdef_client_type").on(table.clientIdCode, table.productType),
  ]
);

// ─── CLR Unmatched Fields ─────────────────────────────────────────────
// Audit log of CLR field names that didn't match any attribute during a
// CLR upload. One row per upload per unmatched field. Replaces the prior
// silent-drop behavior. See spec §Pipeline 2.

export const clrUnmatchedFields = pgTable(
  "clr_unmatched_fields",
  {
    id: serial("id").primaryKey(),
    uploadId: integer("upload_id")
      .notNull()
      .references(() => categoryDefinitions.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_clr_unmatched_upload").on(table.uploadId)]
);

// ─── Onboarding Step 8 staging tables ─────────────────────────────────
// Per-client transient state between substeps 8.2 (CLR) and 8.3 (ALR + merge).
// Rows are wiped on successful merge-to-master and on each re-upload.

export const stagedClrProducts = pgTable(
  "staged_clr_products",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    productType: varchar("product_type", { length: 255 }),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull(),
    requiredComplete: boolean("required_complete").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.clientIdCode, table.sku] }),
  ]
);

export const stagedAlrLinks = pgTable(
  "staged_alr_links",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    asin: varchar("asin", { length: 20 }),
    status: varchar("status", { length: 50 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.clientIdCode, table.sku] }),
  ]
);

export type StagedClrProduct = typeof stagedClrProducts.$inferSelect;
export type NewStagedClrProduct = typeof stagedClrProducts.$inferInsert;
export type StagedAlrLink = typeof stagedAlrLinks.$inferSelect;
export type NewStagedAlrLink = typeof stagedAlrLinks.$inferInsert;

// ─── Product Key Overrides ───────────────────────────────────────────
// Per-product override: editors can flag/unflag specific attributes as key.

export const productKeyOverrides = pgTable(
  "product_key_overrides",
  {
    id: serial("id").primaryKey(),
    productId: uuid("product_id")
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

    // Google Sheets migration (0041)
    googleSheetId: text("google_sheet_id"),
    sheetUrl: text("sheet_url"),
    driveFolderId: text("drive_folder_id"),
    archiveFolderId: text("archive_folder_id"),
    status: text("status").notNull().default("in_progress"),
    // 'in_progress' | 'finalized' | 'reopened' | 'legacy'
    seededSnapshot: jsonb("seeded_snapshot").$type<
      Record<string, Record<string, string | null>>
    >(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedBy: text("finalized_by"),
  },
  (table) => [
    index("idx_atr_client").on(table.clientIdCode),
    index("idx_atr_client_status").on(table.clientIdCode, table.status),
  ]
);

// ─── SEO Projects ────────────────────────────────────────────────────
// Mirrors the seo-manager `projects` table. One project = one brand/ASIN group
// going through the S1-S6 pipeline.

export const seoProjects = pgTable(
  "seo_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Owner
    createdBy: varchar("created_by", { length: 255 }).notNull(), // user email
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    // draft | in_progress | completed | live | deprecated | archived
    currentPhase: varchar("current_phase", { length: 5 }).notNull().default("S1"),
    // S1 | S2 | S3 | S4 | S5 | S6

    // S1 Metadata
    date: varchar("date", { length: 50 }),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    brandName: varchar("brand_name", { length: 255 }).notNull().default(""),
    clientName: varchar("client_name", { length: 255 }),
    clientBibleUrl: text("client_bible_url"),
    // Manually-set go-live date of the optimised listing (YYYY-MM-DD). Splits
    // before/after on the SEO↔PPC status page. Null = not set.
    liveDate: date("live_date", { mode: "string" }),
    brandUrl: text("brand_url"),

    // Competitor context (array of { name, url })
    competitors: jsonb("competitors").$type<Array<{ name: string; url: string }>>().default([]),

    // Variation
    variationTheme: varchar("variation_theme", { length: 100 }),
    sizePresent: boolean("size_present").notNull().default(false),

    // Version number — auto-incremented per variation (V1, V2, V3…)
    version: integer("version").notNull().default(1),

    // Brand Guidelines
    brandGuidelines: text("brand_guidelines").default(""),
    brandGuidelinesLock: jsonb("brand_guidelines_lock").$type<{
      status: "locked" | "not_applicable";
      brand_voice: string | null;
      language_preferences: string | null;
      words_to_avoid: string[];
      audience_notes: string | null;
      positioning: string | null;
      raw_text: string | null;
    }>(),
    brandGuidelinesNotes: text("brand_guidelines_notes"),

    // Variety Pack
    varietyPackDetails: text("variety_pack_details"),

    // Content Rules — per-section customization (shared vs dimension-specific)
    contentRules: jsonb("content_rules").$type<Record<string, { mode: "shared" | "dimension_specific"; dimensions: string[] }>>(),

    // Phase approval timestamps
    s1ApprovedAt: timestamp("s1_approved_at", { withTimezone: true }),
    s2ApprovedAt: timestamp("s2_approved_at", { withTimezone: true }),
    s3ApprovedAt: timestamp("s3_approved_at", { withTimezone: true }),
    s4ApprovedAt: timestamp("s4_approved_at", { withTimezone: true }),
    s5ApprovedAt: timestamp("s5_approved_at", { withTimezone: true }),
    s6ApprovedAt: timestamp("s6_approved_at", { withTimezone: true }),
    s7ApprovedAt: timestamp("s7_approved_at", { withTimezone: true }),
    s8ApprovedAt: timestamp("s8_approved_at", { withTimezone: true }),
    s9ApprovedAt: timestamp("s9_approved_at", { withTimezone: true }),
    s7Skipped: boolean("s7_skipped").notNull().default(false),
    s8Skipped: boolean("s8_skipped").notNull().default(false),

    // Assignee — which team member owns this project
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),

    // Hub integration — link back to a Hub product (populated when launched from product detail)
    linkedProductId: uuid("linked_product_id").references(() => master.id, {
      onDelete: "set null",
    }),

    // Variation integration — link to a locked variation (bulk-created from variation builder)
    variationId: uuid("variation_id").references(() => variations.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_projects_created_by").on(table.createdBy),
    index("idx_seo_projects_client").on(table.clientIdCode),
    index("idx_seo_projects_status").on(table.status),
    index("idx_seo_projects_linked_product").on(table.linkedProductId),
    index("idx_seo_projects_variation").on(table.variationId),
  ]
);

// Per-(project, ASIN) go-live state for the SEO ↔ PPC status page (migration 0121).
// At most one `live` row per (client_id_code, asin) — partial unique index.
export const seoProjectAsinLive = pgTable(
  "seo_project_asin_live",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }).notNull(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    liveDate: date("live_date", { mode: "string" }).notNull(),
    deprecatedDate: date("deprecated_date", { mode: "string" }),
    deprecatedByProjectId: uuid("deprecated_by_project_id").references(() => seoProjects.id, { onDelete: "set null" }),
    versionNumber: integer("version_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_seo_project_asin_live_project_asin").on(t.projectId, t.asin),
    uniqueIndex("uq_seo_project_asin_live_one_live").on(t.clientIdCode, t.asin).where(sql`status = 'live'`),
    index("idx_seo_project_asin_live_client").on(t.clientIdCode),
  ],
);

// ─── SEO revisions (client review rounds) ─────────────────────────────
// One frozen snapshot per review round; see docs/superpowers/specs/2026-10-01-seo-revision-review-design.md.

export const seoRevisions = pgTable(
  "seo_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    /** { [asin]: { [FIELD_MAP key]: string } } — set at submit; PM/AM may edit a field in place (logged as an internal comment). */
    content: jsonb("content").$type<Record<string, Record<string, string>>>().notNull(),
    submittedByEmail: varchar("submitted_by_email", { length: 255 }).notNull(),
    submittedByName: varchar("submitted_by_name", { length: 255 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    finalVia: varchar("final_via", { length: 10 }),
    finalReason: text("final_reason"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_seo_revisions_project_number").on(t.projectId, t.revisionNumber),
    uniqueIndex("uq_seo_revisions_one_open").on(t.projectId).where(sql`status IN ('pm_review', 'am_review', 'client_review')`),
    uniqueIndex("uq_seo_revisions_one_current").on(t.projectId).where(sql`is_current`),
    check("seo_revisions_status_check", sql`${t.status} IN ('pm_review', 'am_review', 'client_review', 'approved', 'changes_requested')`),
    check("seo_revisions_final_via_check", sql`${t.finalVia} IS NULL OR ${t.finalVia} IN ('client', 'am_final')`),
  ],
);

export const seoRevisionEvents = pgTable(
  "seo_revision_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").notNull().references(() => seoRevisions.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 10 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    actorEmail: varchar("actor_email", { length: 255 }).notNull(),
    actorName: varchar("actor_name", { length: 255 }),
    actedAs: varchar("acted_as", { length: 10 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_events_revision").on(t.revisionId),
    check("seo_revision_events_step_check", sql`${t.step} IN ('submit', 'pm', 'am', 'client')`),
    check("seo_revision_events_action_check", sql`${t.action} IN ('submit', 'approve', 'request_changes', 'send_to_client', 'approve_final')`),
    check("seo_revision_events_acted_as_check", sql`${t.actedAs} IN ('assigned', 'override', 'client', 'author')`),
  ],
);

export const seoRevisionComments = pgTable(
  "seo_revision_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").notNull().references(() => seoRevisions.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }).notNull(),
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => seoRevisionComments.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 10 }).notNull(),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    authorName: varchar("author_name", { length: 255 }),
    body: text("body").notNull(),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_comments_revision").on(t.revisionId),
    check("seo_revision_comments_audience_check", sql`${t.audience} IN ('internal', 'client')`),
  ],
);

export const seoRevisionPushes = pgTable(
  "seo_revision_pushes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").references(() => seoRevisions.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => master.id, { onDelete: "cascade" }),
    pushedBy: varchar("pushed_by", { length: 255 }).notNull(),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_pushes_product").on(t.productId),
    check("seo_revision_pushes_source_check", sql`${t.revisionId} IS NOT NULL OR ${t.overrideReason} IS NOT NULL`),
  ],
);

export type SeoRevision = typeof seoRevisions.$inferSelect;
export type SeoRevisionEvent = typeof seoRevisionEvents.$inferSelect;
export type SeoRevisionComment = typeof seoRevisionComments.$inferSelect;

// ─── SEO ASINs ───────────────────────────────────────────────────────
// One row per ASIN within a project (S1 intake grid).

export const seoAsins = pgTable(
  "seo_asins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    asin: varchar("asin", { length: 20 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    amazonUrl: text("amazon_url"),
    websiteUrl: text("website_url"),
    variationId: varchar("variation_id", { length: 100 }),
    variationProduct: varchar("variation_product", { length: 255 }),
    parentageLevel: varchar("parentage_level", { length: 10 }), // Parent | Child
    variationThemeName: varchar("variation_theme_name", { length: 100 }),
    flavor: varchar("flavor", { length: 100 }),
    style: varchar("style", { length: 100 }),
    color: varchar("color", { length: 100 }),
    size: varchar("size", { length: 100 }),
    variationGroup: varchar("variation_group", { length: 100 }),

    // Columns M-AM: existing listing content
    existingContent: jsonb("existing_content")
      .$type<{
        item_name: string | null;
        detailed_bullets: string[];
        product_description: string | null;
        generic_keywords: string[];
        concise_bullets: string[];
        content_bullets: string[];
        key_features: string[];
      }>(),

    // Computed baseline analysis
    baselineAnalysis: jsonb("baseline_analysis").$type<{
      quality_score: number;
      keyword_integration: string;
      compliance_flags: string[];
      top_improvements: string[];
    }>(),

    // S6 generated content
    generatedContent: jsonb("generated_content").$type<{
      title: string;
      detailed_bullets: string[];
      concise_bullets: string[];
      content_bullets: string[];
      key_features: string[];
      description: string;
      search_terms_core: string;
      search_terms_supplement: string;
      search_terms_symptom: string;
      search_terms_audience: string;
      search_terms_longtail: string;
    }>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_asins_project").on(table.projectId),
    index("idx_seo_asins_asin").on(table.asin),
  ]
);

// ─── SEO Keywords ────────────────────────────────────────────────────
// S2 output — keyword research rows per project.

export const seoKeywords = pgTable(
  "seo_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    text: text("text").notNull(),
    searchVolume: integer("search_volume").notNull().default(0),
    priorityTier: varchar("priority_tier", { length: 5 }), // T1 | T2 | T3 | T4
    searchIntent: varchar("search_intent", { length: 100 }),
    primaryUseLocation: varchar("primary_use_location", { length: 100 }),
    matchType: varchar("match_type", { length: 50 }),
    cosmoRelationship: varchar("cosmo_relationship", { length: 100 }),
    buyerStage: varchar("buyer_stage", { length: 20 }), // Awareness | Consideration | Decision
    notes: text("notes").default(""),
    keywordSource: varchar("keyword_source", { length: 100 }).default("Client"),
    semanticGroup: varchar("semantic_group", { length: 100 }),
    cerebroIq: integer("cerebro_iq"),
    competingProducts: integer("competing_products"),
    titleDensity: integer("title_density"),
    cpr: integer("cpr"),
    competitorRankAvg: numeric("competitor_rank_avg"),
    ppcSuggestedBid: numeric("ppc_suggested_bid"),
    ppcSuggestedMinBid: numeric("ppc_suggested_min_bid"),
    ppcSuggestedMaxBid: numeric("ppc_suggested_max_bid"),
    cosmoDomain: varchar("cosmo_domain", { length: 50 }),
    compositeScore: numeric("composite_score"),
    isNegative: boolean("is_negative").notNull().default(false),
    negativeReason: text("negative_reason"),
    isCompetitor: boolean("is_competitor").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_keywords_project").on(table.projectId),
    index("idx_seo_keywords_tier").on(table.priorityTier),
  ]
);

// ─── SEO Reviews ─────────────────────────────────────────────────────
// S3 output — customer review analysis rows per project.

export const seoReviews = pgTable(
  "seo_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    reviewId: varchar("review_id", { length: 100 }),
    date: varchar("date", { length: 50 }),
    reviewerName: varchar("reviewer_name", { length: 255 }),
    asin: varchar("asin", { length: 20 }),
    productVariation: varchar("product_variation", { length: 255 }),
    starRating: integer("star_rating"),
    title: text("title"),
    text: text("text"),
    sentiment: varchar("sentiment", { length: 50 }),
    keyThemes: text("key_themes"),
    usageMentioned: text("usage_mentioned"),
    packagingFeedback: text("packaging_feedback"),
    priceFeedback: text("price_feedback"),
    heatLevelFeedback: text("heat_level_feedback"),
    rufusUsableInsight: text("rufus_usable_insight"),
    bulletMapping: text("bullet_mapping"),
    helpfulVotes: integer("helpful_votes").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_reviews_project").on(table.projectId),
    index("idx_seo_reviews_asin").on(table.asin),
  ]
);

// ─── SEO Alexa for Shopping ───────────────────────────────────────────────────────
// S4 output — one row per project (unique constraint).

export const seoRufus = pgTable("seo_rufus", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => seoProjects.id, { onDelete: "cascade" }),

  phase1Questions: jsonb("phase1_questions")
    .$type<Array<{ id: string; text: string; intent_tier: string; batch_char_count: number }>>()
    .default([]),
  phase1Answers: jsonb("phase1_answers").$type<string[]>().default([]),
  phase2Questions: jsonb("phase2_questions")
    .$type<Array<{ id: string; text: string; intent_tier: string; batch_char_count: number }>>()
    .default([]),
  phase2Answers: jsonb("phase2_answers").$type<string[]>().default([]),
  phase3Questions: jsonb("phase3_questions")
    .$type<Array<{ id: string; text: string; intent_tier: string; batch_char_count: number }>>()
    .default([]),
  phase3Answers: jsonb("phase3_answers").$type<string[]>().default([]),

  // Flat analyzed rows (one object per Q&A pair with all analyzed fields)
  rows: jsonb("rows").$type<Record<string, string>[]>().default([]),

  optimizationSummary: jsonb("optimization_summary").$type<{
    seo_strategy: string;
    listing_plan: string;
    image_strategy: string;
    audience_segmentation: string;
    action_list: string[];
  }>(),

  phase1ApprovedAt: timestamp("phase1_approved_at", { withTimezone: true }),
  phase2ApprovedAt: timestamp("phase2_approved_at", { withTimezone: true }),
  phase3ApprovedAt: timestamp("phase3_approved_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── SEO COSMO Maps ──────────────────────────────────────────────────
// S5 output — one row per project (unique constraint).

export const seoCosmopMaps = pgTable("seo_cosmo_maps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => seoProjects.id, { onDelete: "cascade" }),

  triples: jsonb("triples")
    .$type<Array<{
      id: string;
      entity1: string;
      relationship: string;       // one of 16 v5 §5.3 categories
      entity2: string;
      confidence: number;
      confidence_level: "High" | "Medium" | "Low";
      supporting_keyword_tier: string | null;
    }>>()
    .default([]),

  // Flat analyzed rows from the COSMO generation step (COSMOEntity, COSMORelationType, etc.)
  rows: jsonb("rows").$type<Record<string, string>[]>().default([]),

  keywordCoverage: jsonb("keyword_coverage").$type<Record<string, number>>().default({}),
  competitivePositioning: text("competitive_positioning"),
  relationshipCategoriesEvaluated: jsonb("relationship_categories_evaluated")
    .$type<string[]>()
    .default([]),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── SEO Compliance Reports ──────────────────────────────────────────
// S6 compliance check results per project.

export const seoComplianceReports = pgTable(
  "seo_compliance_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    issues: jsonb("issues")
      .$type<
        Array<{
          id: string;
          asin: string;
          field: string;
          type: string;
          severity: string;
          message: string;
          word?: string;
          position?: number;
          bypassed: boolean;
        }>
      >()
      .default([]),

    status: varchar("status", { length: 20 }).notNull().default("clean"),
    // clean | has_issues | bypassed

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seo_compliance_project").on(table.projectId)]
);

// ─── SEO Listings ────────────────────────────────────────────────────
// S6 output — Amazon flat-file ready, 1 row per ASIN per version.

export const seoListings = pgTable(
  "seo_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 220 }),
    itemHighlight: varchar("item_highlight", { length: 130 }),
    bullets: jsonb("bullets")
      .$type<{
        detailed: string[];      // 5 × 390-400 chars
        concise: string[];       // 5 × 190-200 chars
        content: string[];       // 5 × 90-100 chars
        key_features: string[];  // 5 × 40-50 chars
      }>()
      .default({ detailed: [], concise: [], content: [], key_features: [] }),
    productDescription: text("product_description"),
    backendSearchTerms: text("backend_search_terms"),
    backendCategories: jsonb("backend_categories")
      .$type<{ core: string; supplement: string; symptom: string; audience: string; longtail: string }>()
      .default({ core: "", supplement: "", symptom: "", audience: "", longtail: "" }),
    subjectMatter: text("subject_matter"),
    subjectMatterByteLength: integer("subject_matter_byte_length"),
    byteUsage: jsonb("byte_usage")
      .$type<Record<string, { used: number; max: number; ok: boolean }>>()
      .default({}),
    categoryRequiredAttributes: jsonb("category_required_attributes")
      .$type<Record<string, string>>()
      .default({}),
    complianceViolations: jsonb("compliance_violations")
      .$type<Array<{ field: string; word: string; type: string; auto_corrected_to?: string; bypassed: boolean }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_listings_project").on(table.projectId),
    index("idx_seo_listings_asin").on(table.asinId),
    unique("seo_listings_asin_id_version_key").on(table.asinId, table.version),
  ]
);

export const seoAplusPlans = pgTable(
  "seo_aplus_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    modules: jsonb("modules")
      .$type<Array<{
        position: number;        // 1-7
        module_type: string;     // hero | comparison_table_4cell | image_text | ... | premium_qa
        cosmo_relationship: string | null;
        fields: Record<string, string>;
        images: Array<{
          technical_name: string;
          alt_text: string;
          overlay_text: string;
          ai_prompt: string;
          dimensions: string;
        }>;
      }>>()
      .default([]),
    validationErrors: jsonb("validation_errors")
      .$type<Array<{ position: number; field: string; message: string }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_aplus_project").on(table.projectId),
    unique("seo_aplus_plans_asin_id_version_key").on(table.asinId, table.version),
  ]
);

export const seoImages = pgTable(
  "seo_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    imageNumber: smallint("image_number").notNull(),
    technicalName: varchar("technical_name", { length: 10 }).notNull(),
    imageType: varchar("image_type", { length: 50 }),
    imagePurpose: text("image_purpose"),
    cosmoRelationship: varchar("cosmo_relationship", { length: 50 }),
    buyerStage: varchar("buyer_stage", { length: 20 }),
    fileFormat: varchar("file_format", { length: 10 }).notNull().default("PNG"),
    widthPx: integer("width_px").notNull().default(2000),
    heightPx: integer("height_px").notNull().default(2000),
    colorMode: varchar("color_mode", { length: 10 }).notNull().default("RGB"),
    overlayText: text("overlay_text"),
    overlayTextLength: integer("overlay_text_length"),
    altText: text("alt_text"),
    altTextLength: integer("alt_text_length"),
    imageDirection: text("image_direction"),
    aiImagePrompt: text("ai_image_prompt"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_images_project").on(table.projectId),
    index("idx_seo_images_asin").on(table.asinId),
    unique("seo_images_asin_id_image_number_version_key").on(
      table.asinId,
      table.imageNumber,
      table.version,
    ),
  ]
);

export const seoQa = pgTable(
  "seo_qa",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id").references(() => seoAsins.id, { onDelete: "cascade" }),

    pairs: jsonb("pairs")
      .$type<Array<{
        id: string;
        question: string;
        answer_short: string;
        answer_long: string;
        intent_tier: string;
        source_rufus_question_id: string | null;
        source_review_themes: string[];
      }>>()
      .default([]),
    aplusQaSubset: jsonb("aplus_qa_subset")
      .$type<Array<{ id: string; question: string; answer: string }>>()
      .default([]),
    customerQaExport: jsonb("customer_qa_export")
      .$type<Array<{ id: string; question: string; answer: string }>>()
      .default([]),
    passageMapQa: jsonb("passage_map_qa")
      .$type<Array<{ pair_id: string; rufus_question_ids: string[]; cosmo_triple_ids: string[] }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_qa_project").on(table.projectId),
    index("idx_seo_qa_asin").on(table.asinId),
    unique("seo_qa_asin_id_version_key").on(table.asinId, table.version),
  ]
);

export const seoPassageMap = pgTable(
  "seo_passage_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    passages: jsonb("passages")
      .$type<Array<{
        section: string;
        text: string;
        rufus_question_ids: string[];
        cosmo_triple_ids: string[];
        keywords_used: string[];
      }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_passage_map_asin").on(table.asinId),
    index("idx_seo_passage_map_project").on(table.projectId),
  ]
);

export const seoScores = pgTable(
  "seo_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    rufusCoveragePct: numeric("rufus_coverage_pct").notNull().default("0"),
    rufus5CanonicalCoverage: jsonb("rufus_5_canonical_coverage")
      .$type<Record<string, { covered: boolean; locations: string[] }>>()
      .default({}),
    cosmoCoveragePct: numeric("cosmo_coverage_pct").notNull().default("0"),
    cosmoDensityPer100Words: numeric("cosmo_density_per_100_words").notNull().default("0"),
    cosmoRelationshipCategoriesEvaluated: jsonb("cosmo_relationship_categories_evaluated")
      .$type<string[]>()
      .default([]),
    buyerJourneyAlignment: jsonb("buyer_journey_alignment")
      .$type<Record<string, { expected_stage: string; detected_stage: string; points: number }>>()
      .default({}),
    byteBudgetStatus: jsonb("byte_budget_status")
      .$type<Record<string, { used: number; max: number; ok: boolean }>>()
      .default({}),
    prohibitedWordViolations: jsonb("prohibited_word_violations")
      .$type<Array<{ field: string; word: string }>>()
      .default([]),
    missingRufusQuestions: jsonb("missing_rufus_questions").$type<string[]>().default([]),
    missingCosmoTriples: jsonb("missing_cosmo_triples").$type<string[]>().default([]),
    overallGrade: varchar("overall_grade", { length: 2 }),
    probeTranscript: jsonb("probe_transcript").$type<Array<{ query: string; response: string }>>(),
    rerunCount: smallint("rerun_count").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    scoreVersion: integer("score_version").notNull().default(1),
  },
  (table) => [
    index("idx_seo_scores_project").on(table.projectId),
    index("idx_seo_scores_asin").on(table.asinId),
    unique("seo_scores_asin_id_score_version_key").on(table.asinId, table.scoreVersion),
  ]
);

// ─── SEO Phase Runs ──────────────────────────────────────────────────
// Per-execution audit log + cost tracking + status machine. Plan 2 §D.

export const seoPhaseRuns = pgTable(
  "seo_phase_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    phase: varchar("phase", { length: 5 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    trigger: varchar("trigger", { length: 16 }).notNull(),
    attempt: smallint("attempt").notNull().default(1),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => seoPhaseRuns.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    claudeInputTokens: integer("claude_input_tokens").notNull().default(0),
    claudeOutputTokens: integer("claude_output_tokens").notNull().default(0),
    claudeCostUsd: numeric("claude_cost_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    claudeModel: varchar("claude_model", { length: 64 }),
    outputArtifactVersion: integer("output_artifact_version"),
    validationErrors: jsonb("validation_errors")
      .$type<Array<{ field: string; message: string; expected?: string; got?: string }>>()
      .default([]),
    errorMessage: text("error_message"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_phase_runs_project").on(table.projectId),
    index("idx_seo_phase_runs_phase").on(table.projectId, table.phase, table.startedAt.desc()),
  ]
);

export type SeoPhaseRun = typeof seoPhaseRuns.$inferSelect;
export type NewSeoPhaseRun = typeof seoPhaseRuns.$inferInsert;

// ─── SEO Exports ─────────────────────────────────────────────────────
// Export history per project.

export const seoExports = pgTable(
  "seo_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    type: varchar("type", { length: 20 }).notNull(), // google_doc | csv | tsv
    url: text("url"),
    contentSnapshot: jsonb("content_snapshot"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seo_exports_project").on(table.projectId)]
);

// ─── SEO Quality Scores ─────────────────────────────────────────────
// Append-only audit score log per project. Written by S6 after audit.

export const seoQualityScores = pgTable(
  "seo_quality_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),

    overallScore: integer("overall_score").notNull(),
    complianceScore: integer("compliance_score"),
    keywordCoverage: integer("keyword_coverage"),
    cosmoDensity: integer("cosmo_density"),
    rufusCoverage: integer("rufus_coverage"),
    humanVoice: integer("human_voice"),
    buyerJourney: integer("buyer_journey"),
    variationConsistency: integer("variation_consistency"),
    eeatScore: integer("eeat_score"),
    readabilityScore: integer("readability_score"),
    citabilityScore: integer("citability_score"),
    geoScore: integer("geo_score"),

    findingsCount: integer("findings_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_quality_scores_project").on(table.projectId),
  ]
);

// ─── Amazon Sync: Snapshots ──────────────────────────────────────────
// Stores the raw Rainforest API response per ASIN per sync run.

export const amazonSyncSnapshots = pgTable(
  "amazon_sync_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    asin: text("asin").notNull(),
    amazonDomain: text("amazon_domain").notNull().default("amazon.com"),
    provider: text("provider").notNull().default("rainforest"), // "rainforest" | "firecrawl"
    snapshotData: jsonb("snapshot_data").notNull(),
    creditsUsed: integer("credits_used").default(1),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sync_snapshots_client").on(table.clientIdCode),
    index("idx_sync_snapshots_product").on(table.productId),
    index("idx_sync_snapshots_asin").on(table.asin),
    index("idx_sync_snapshots_fetched").on(table.fetchedAt),
  ]
);

// ─── Amazon Sync: Runs ──────────────────────────────────────────────
// Tracks each sync job (manual or scheduled).

export const amazonSyncRuns = pgTable("amazon_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientIdCode: varchar("client_id_code", { length: 100 }),
  runType: text("run_type").notNull(), // manual | scheduled
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  totalProducts: integer("total_products").default(0),
  completedProducts: integer("completed_products").default(0),
  failedProducts: integer("failed_products").default(0),
  creditsUsed: integer("credits_used").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Amazon Sync: Discrepancies ─────────────────────────────────────
// Field-level differences between catalog and live Amazon data.

export const amazonSyncDiscrepancies = pgTable(
  "amazon_sync_discrepancies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => amazonSyncSnapshots.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    asin: text("asin").notNull(),
    fieldName: text("field_name").notNull(),
    fieldGroup: text("field_group").notNull(),
    catalogValue: text("catalog_value"),
    amazonValue: text("amazon_value"),
    status: text("status").notNull(), // match | mismatch | missing_in_catalog | missing_in_amazon
    resolved: boolean("resolved").default(false),
    resolvedAction: text("resolved_action"), // "update_amazon" | "update_hub"
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sync_disc_product").on(table.productId),
    index("idx_sync_disc_client").on(table.clientIdCode),
    index("idx_sync_disc_status").on(table.status),
    index("idx_sync_disc_resolved").on(table.resolved),
    index("idx_sync_disc_snapshot").on(table.snapshotId),
  ]
);

// ─── A+ Content: Set Config ─────────────────────────────────────────
// One row per product — tracks scope, platform, version for the A+ set.
// Auto-created with defaults (ASIN scope, SC platform, v1) on first access.

export const aplusSets = pgTable(
  "aplus_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .unique()
      .references(() => master.id, { onDelete: "cascade" }),
    scopeType: varchar("scope_type", { length: 4 }).notNull().default("ASIN"),
    scopeIdentifier: varchar("scope_identifier", { length: 100 }).notNull(),
    platform: varchar("platform", { length: 2 }).notNull().default("SC"),
    contentType: varchar("content_type", { length: 3 }).notNull().default("PA+"),
    version: integer("version").notNull().default(1),
    groupNumber: integer("group_number"),
    parentAsin: varchar("parent_asin", { length: 20 }),
    coveredAsins: jsonb("covered_asins").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// ─── A+ Content: Modules ─────────────────────────────────────────────
// One row per A+ module (up to 7 per product). module_number is 1-based.
// 7-module limit is enforced in app logic, not DB constraint.

export const aplusModules = pgTable(
  "aplus_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    moduleNumber: integer("module_number").notNull(),
    moduleType: aplusModuleTypeEnum("module_type").notNull(),
    // Shared nullable text columns — all types may populate any subset
    headlineText: text("headline_text"),
    subheadlineText: text("subheadline_text"),
    bodyText: text("body_text"),
    altText: text("alt_text"),
    overlayText: text("overlay_text"),
    imageDescription: text("image_description"),
    aiImagePrompt: text("ai_image_prompt"),
    cosmoRelationType: varchar("cosmo_relation_type", { length: 100 }),
    // Video tracking (for hasVideo modules: full_video, video_text, video_image_carousel)
    videoDriveFileId: text("video_drive_file_id"),
    videoTitle: text("video_title"),
    videoDescription: text("video_description"),
    // Layout options (background_image_text module)
    textPosition: varchar("text_position", { length: 10 }), // "left" | "right"
    fontColor: varchar("font_color", { length: 10 }), // "light" | "dark"
    // Design tracking
    figmaUrl: text("figma_url"),
    markupUrl: text("markup_url"),
    status: aplusModuleStatusEnum("status").notNull().default("draft"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_aplus_module_position").on(table.productId, table.moduleNumber),
    index("idx_aplus_modules_product").on(table.productId),
    index("idx_aplus_modules_status").on(table.status),
  ]
);

// ─── A+ Content: Module Images ────────────────────────────────────────
// One row per image slot within a module. image_slot is 1-based.
// client_id_code, asin, sku, custom_label form the structured UUID identifier.

export const aplusModuleImages = pgTable(
  "aplus_module_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => aplusModules.id, { onDelete: "cascade" }),
    imageSlot: integer("image_slot").notNull(),
    altText: text("alt_text"),
    imageDescription: text("image_description"),
    aiImagePrompt: text("ai_image_prompt"),
    // Structured UUID: 4 separate columns (not a composite string)
    clientIdCode: varchar("client_id_code", { length: 100 }),
    asin: varchar("asin", { length: 20 }),
    sku: varchar("sku", { length: 100 }),
    customLabel: varchar("custom_label", { length: 100 }),
    driveFileId: text("drive_file_id"),
    mobileDriveFileId: text("mobile_drive_file_id"),
    /** Per-panel text fields for repeatable groups (headline, body, cta_text, asin, etc.) */
    panelData: jsonb("panel_data").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_aplus_image_slot").on(table.moduleId, table.imageSlot),
    index("idx_aplus_module_images_module").on(table.moduleId),
  ]
);

// ─── Brand Story ──────────────────────────────────────────────────────
// Stub schema — full typed columns deferred until Brand Story specs arrive.
// data JSONB is the extensible blob; unique product_id enforces one row per product.

export const brandStory = pgTable(
  "brand_story",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .unique()
      .references(() => master.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_brand_story_product").on(table.productId)]
);

// ─── Drive Folders ────────────────────────────────────────────────────
// Registry of Google Drive folders per client.
// Single source of truth — eliminates runtime Drive traversal.
// parentFolderId is a self-reference (handled by SQL FK, not Drizzle .references())

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    driveFolderId: text("drive_folder_id").notNull(),
    folderType: text("folder_type").notNull(),
    // values include: 'root' | 'content' | 'aplus' | 'listing_images' | 'brand_story'
    // | 'documents' | 'aplus2_version' | 'aplus2_master' | 'brand_story_version'
    // | 'brand_story_master' | 'asin_li' | 'listing_image_master'
    path: text("path").notNull(),
    parentFolderId: uuid("parent_folder_id"),
    // Self-referencing FK (drive_folders_parent_fk, ON DELETE CASCADE) defined
    // in migration 0076 (not here — Drizzle self-ref FK causes circular types).
    // Deleting a folder row cascades to its descendant folder rows.
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_drive_folders_client").on(table.clientIdCode),
    index("idx_drive_folders_type").on(table.folderType),
    index("idx_drive_folders_client_type").on(table.clientIdCode, table.folderType),
    index("idx_drive_folders_parent").on(table.parentFolderId),
  ]
);

// ─── Intentwise Accounts ──────────────────────────────────────────────
// Registry of Intentwise (Redshift) account IDs per client.
// Replaces the hardcoded array in src/lib/report-clients.ts as the source of
// truth for archival. That array stays in place for its existing UI
// consumers — migrating them is a separate refactor (spec §4).
// clientIdCode is nullable: an account discovered in Redshift that we cannot
// attribute must be recordable and visible, not dropped.
// isActive is the capture gate (see "Lifecycle-gated archival"); stoppedAt is
// when capture stopped. Stopping capture never deletes the BigQuery archive.

export const intentwiseAccounts = pgTable(
  "intentwise_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    accountId: varchar("account_id", { length: 50 }).notNull(),
    label: text("label"),
    isActive: boolean("is_active").notNull().default(true),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_intentwise_accounts_account_id").on(table.accountId),
    index("idx_intentwise_accounts_client").on(table.clientIdCode),
    index("idx_intentwise_accounts_active").on(table.isActive),
  ]
);

// ─── Redshift Archive Catalog ─────────────────────────────────────────
// One row per (schema, table) discovered to carry an account_id column.
// Written by scripts/profile-redshift-catalog.ts, never by hand except for
// the `enabled` flag, which is deliberately human-gated: nothing is archived
// until a person turns it on (spec §5).

export const redshiftArchiveCatalog = pgTable(
  "redshift_archive_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schemaName: varchar("schema_name", { length: 128 }).notNull(),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    tableKind: varchar("table_kind", { length: 20 }).notNull()
      .$type<"timeseries" | "snapshot" | "period">(),
    dateColumn: varchar("date_column", { length: 128 }),
    sourceRefreshWindowDays: integer("source_refresh_window_days"),
    repullWindowDays: integer("repull_window_days").notNull().default(14),
    retentionDays: integer("retention_days"),
    enabled: boolean("enabled").notNull().default(false),
    estRows: bigint("est_rows", { mode: "number" }),
    estBytes: bigint("est_bytes", { mode: "number" }),
    columns: jsonb("columns").$type<Array<{ name: string; type: string; bqType: string; mapped: boolean }>>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastProfiledAt: timestamp("last_profiled_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("uq_redshift_archive_catalog_table").on(table.schemaName, table.tableName),
    index("idx_redshift_archive_catalog_enabled").on(table.enabled),
  ]
);

// ─── Redshift Archive Account Stats ───────────────────────────────────
// Per (table × account) profiling output. Measures retention, sizes the
// backfill, and backs the §8.1 zero-row hard failure.

export const redshiftArchiveAccountStats = pgTable(
  "redshift_archive_account_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => redshiftArchiveCatalog.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 50 }).notNull(),
    rowCount: bigint("row_count", { mode: "number" }).notNull(),
    minDate: date("min_date"),
    maxDate: date("max_date"),
    distinctDates: integer("distinct_dates"),
    profiledAt: timestamp("profiled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_redshift_archive_account_stats").on(table.catalogId, table.accountId),
    index("idx_redshift_archive_account_stats_account").on(table.accountId),
  ]
);

// ─── Redshift Archive Runs ─────────────────────────────────────────────
// Work queue: one row per (run_date, run_kind, schema, table, account_id).
// Written by the nightly enqueuer, claimed and updated by the drainer.
// This is what makes "did last night fully complete?" a query, not a guess.

export const redshiftArchiveRuns = pgTable(
  "redshift_archive_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runDate: date("run_date").notNull(),
    runKind: varchar("run_kind", { length: 20 }).notNull()
      .$type<"nightly" | "monthly" | "backfill" | "verify">(),
    schemaName: varchar("schema_name", { length: 128 }).notNull(),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    accountId: varchar("account_id", { length: 50 }).notNull(),
    windowFrom: date("window_from"),
    windowTo: date("window_to"),
    status: varchar("status", { length: 20 }).notNull().default("pending")
      .$type<"pending" | "running" | "done" | "failed">(),
    rowsRead: bigint("rows_read", { mode: "number" }),
    rowsWritten: bigint("rows_written", { mode: "number" }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_redshift_archive_runs_unit").on(
      table.runDate, table.runKind, table.schemaName, table.tableName, table.accountId
    ),
    index("idx_redshift_archive_runs_status_date").on(table.status, table.runDate),
    index("idx_redshift_archive_runs_lookup").on(
      table.runDate, table.schemaName, table.tableName, table.accountId
    ),
  ]
);

export type RedshiftArchiveRun = typeof redshiftArchiveRuns.$inferSelect;
export type NewRedshiftArchiveRun = typeof redshiftArchiveRuns.$inferInsert;

// ─── Drive Files ──────────────────────────────────────────────────────
// Tracks all files uploaded to Drive, with optional entity linkage.
// entityType + entityId = polymorphic FK (e.g. 'product', 'aplus_module').

export const driveFiles = pgTable(
  "drive_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driveFileId: text("drive_file_id").notNull(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => driveFolders.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    displayName: text("display_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_drive_files_folder").on(table.folderId),
    index("idx_drive_files_entity").on(table.entityType, table.entityId),
    index("idx_drive_files_drive_id").on(table.driveFileId),
  ]
);

// ─── Listing Image Slot Status ───────────────────────────────────────
// Per-slot design status for listing image cells.
// product_id is master.id (text, no FK to avoid lock contention).
export const listingImageSlotStatus = pgTable(
  "listing_image_slot_status",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: text("client_id_code").notNull(),
    productId: text("product_id").notNull(),
    slot: text("slot").notNull(),
    status: text("status").notNull().default("not_started"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [
    index("idx_liss_client").on(t.clientIdCode),
    index("idx_liss_product").on(t.productId),
    unique("listing_image_slot_status_product_slot_unique").on(t.productId, t.slot),
  ]
);

export const listingImageSlotVersions = pgTable(
  "listing_image_slot_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: text("client_id_code").notNull(),
    productId: text("product_id").notNull(),
    slot: text("slot").notNull(),
    versionNumber: integer("version_number").notNull(),
    // References drive_files.id (UUID PK), not drive_files.driveFileId (Google Drive string ID).
    driveFileId: uuid("drive_file_id").references(() => driveFiles.id, { onDelete: "set null" }),
    // Per-version design status. Values: 'not_started' | 'in_progress' | 'in_review'
    // | 'approved' | 'live' | 'discontinued'. Editor-selected from the grid cell
    // (latest version) or the version-history Popover (any version).
    status: text("status").notNull().default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => [
    index("idx_lisv_client").on(t.clientIdCode),
    index("idx_lisv_product").on(t.productId),
    unique("lisv_product_slot_version_unique").on(t.productId, t.slot, t.versionNumber),
  ]
);

export type ListingImageSlotVersion = typeof listingImageSlotVersions.$inferSelect;
export type NewListingImageSlotVersion = typeof listingImageSlotVersions.$inferInsert;

// ─── Brand Story per-version editor ──────────────────────────────────
// Per-version editor for Amazon Brand Story content. One brandStoryVersions
// row = one V## of the brand story for a client. Modules are position-ordered
// (1..19); shared text fields live as typed columns on brandStoryModules;
// repeated children (ASINs, Q&A) live in dedicated child tables; image slots
// bind to drive_files via brandStoryAssets.
// Char limits per field are enforced in the API layer (Zod) — the same
// column (body) has different limits per module type, so DB-level CHECK
// constraints would be ugly.

export const brandStoryVersions = pgTable(
  "brand_story_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    // No FK to aac(client_id_code) — matches existing pattern (driveFolders,
    // inventoryRecSettings). Cleanup on client delete handled in app code.
    versionNumber: integer("version_number").notNull(),
    driveFolderId: uuid("drive_folder_id").references(() => driveFolders.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("not_started"),
    // values: 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'live'
    // Surface: editor-selected from the version card header (no implicit transitions).
    desktopBgAlt: text("desktop_bg_alt").notNull().default(""),
    mobileBgAlt: text("mobile_bg_alt").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("brand_story_versions_client_version_key").on(
      table.clientIdCode,
      table.versionNumber
    ),
    index("idx_brand_story_versions_client").on(table.clientIdCode),
  ]
);

export const brandStoryModules = pgTable(
  "brand_story_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => brandStoryVersions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    // values: 'asin-showcase' | 'focus-image' | 'logo-description' | 'qa'
    // Shared text fields (NULL where the type doesn't use them):
    headline: text("headline"),
    body: text("body"),
    imageAlt: text("image_alt"),
    brandStoreId: text("brand_store_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("brand_story_modules_version_position_key").on(
      table.versionId,
      table.position
    ),
    index("idx_brand_story_modules_version").on(table.versionId),
  ]
);

export const brandStoryAsinItems = pgTable(
  "brand_story_asin_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => brandStoryModules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 1..4
    asin: text("asin").notNull().default(""),
    imageAlt: text("image_alt").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("brand_story_asin_items_module_position_key").on(
      table.moduleId,
      table.position
    ),
  ]
);

export const brandStoryQaItems = pgTable(
  "brand_story_qa_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => brandStoryModules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 1..3
    question: text("question").notNull().default(""),
    answer: text("answer").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("brand_story_qa_items_module_position_key").on(
      table.moduleId,
      table.position
    ),
  ]
);

export const brandStoryAssets = pgTable(
  "brand_story_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => brandStoryVersions.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => brandStoryModules.id, {
      onDelete: "cascade",
    }),
    asinItemId: uuid("asin_item_id").references(() => brandStoryAsinItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    // values: 'screenview' | 'bg_desktop' | 'bg_mobile' | 'focus' | 'logo' | 'asin'
    driveFileId: uuid("drive_file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_brand_story_assets_version").on(table.versionId),
    index("idx_brand_story_assets_module").on(table.moduleId),
    index("idx_brand_story_assets_asin").on(table.asinItemId),
    // Partial unique indexes declared in SQL migration (Drizzle can't express WHERE).
  ]
);

// ─── A+ 2.0 (per-version A+ Content editor) ──────────────────────────
// 5 tables mirror the brand-story per-version model. Char limits live in
// Zod (src/lib/aplus2/zod-schemas.ts), not DB CHECKs — same column has
// different caps per module type. Partial unique indexes on aplus2_assets
// are declared in drizzle/migrations/0068_aplus2.sql (Drizzle can't express
// `WHERE`).

export const aplus2Sets = pgTable(
  "aplus2_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    scopeType: varchar("scope_type", { length: 8 }).notNull(),
    // values: 'ASIN' | 'PARENT' | 'GROUP'
    scopeIdentifier: varchar("scope_identifier", { length: 64 }).notNull(),
    marketplace: varchar("marketplace", { length: 5 }).notNull(),
    parentAsin: varchar("parent_asin", { length: 20 }),
    coveredAsins: jsonb("covered_asins").$type<string[]>(),
    platform: varchar("platform", { length: 2 }).notNull().default("SC"),
    // values: 'PA+' | 'BA+'  (CHECK aplus2_sets_content_type_check)
    contentType: varchar("content_type", { length: 3 }).notNull().default("PA+"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_sets_client_marketplace_scope_key").on(
      table.clientIdCode,
      table.marketplace,
      table.scopeIdentifier
    ),
    index("idx_aplus2_sets_client").on(table.clientIdCode),
    index("idx_aplus2_sets_product").on(table.productId),
    check(
      "aplus2_sets_content_type_check",
      sql`${table.contentType} IN ('PA+', 'BA+')`
    ),
  ]
);

export const aplus2Versions = pgTable(
  "aplus2_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setId: uuid("set_id")
      .notNull()
      .references(() => aplus2Sets.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("not_started"),
    // values: 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'live' | 'discontinued'
    // Per-version tier: 'PA+' | 'BA+' — NTA clients ship BA+ as V01, then PA+ as V02+.
    contentType: varchar("content_type", { length: 3 }).notNull().default("PA+"),
    driveFolderId: uuid("drive_folder_id").references(() => driveFolders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_versions_set_version_key").on(table.setId, table.versionNumber),
    index("idx_aplus2_versions_set").on(table.setId),
    check(
      "aplus2_versions_status_check",
      sql`${table.status} IN ('not_started', 'in_progress', 'in_review', 'approved', 'live', 'discontinued')`
    ),
    check(
      "aplus2_versions_content_type_check",
      sql`${table.contentType} IN ('PA+', 'BA+')`
    ),
  ]
);

export const aplus2Modules = pgTable(
  "aplus2_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => aplus2Versions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    moduleType: text("module_type").notNull(),
    status: text("status").notNull().default("draft"),
    // values: 'draft' | 'in_review' | 'approved' | 'uploaded' | 'live'
    headlineText: text("headline_text"),
    subheadlineText: text("subheadline_text"),
    bodyText: text("body_text"),
    overlayText: text("overlay_text"),
    altText: text("alt_text"),
    mobileAltText: text("mobile_alt_text"),
    imageDescription: text("image_description"),
    aiImagePrompt: text("ai_image_prompt"),
    cosmoRelationType: varchar("cosmo_relation_type", { length: 100 }),
    videoDriveFileId: text("video_drive_file_id"),
    videoTitle: text("video_title"),
    videoDescription: text("video_description"),
    textPosition: varchar("text_position", { length: 10 }),
    fontColor: varchar("font_color", { length: 10 }),
    figmaUrl: text("figma_url"),
    markupUrl: text("markup_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_modules_version_position_key").on(table.versionId, table.position),
    index("idx_aplus2_modules_version").on(table.versionId),
    index("idx_aplus2_modules_status").on(table.status),
  ]
);

export const aplus2ModuleItems = pgTable(
  "aplus2_module_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => aplus2Modules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_module_items_module_position_key").on(table.moduleId, table.position),
    index("idx_aplus2_module_items_module").on(table.moduleId),
  ]
);

export const aplus2Assets = pgTable(
  "aplus2_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => aplus2Versions.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => aplus2Modules.id, {
      onDelete: "cascade",
    }),
    moduleItemId: uuid("module_item_id").references(() => aplus2ModuleItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    // values: 'image' | 'video'
    slotKey: text("slot_key").notNull(),
    variant: text("variant").notNull().default("desktop"),
    // values: 'desktop' | 'mobile'
    driveFileId: uuid("drive_file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_aplus2_assets_version").on(table.versionId),
    index("idx_aplus2_assets_module").on(table.moduleId),
    index("idx_aplus2_assets_module_item").on(table.moduleItemId),
    // Partial unique indexes declared in SQL migration (Drizzle can't express WHERE).
  ]
);

// ─── Storefront Design ───────────────────────────────────────────────

export const storefrontModuleTypeEnum = pgEnum("storefront_module_type", [
  "header", "video", "cover_image", "image", "split_section",
]);

export const storefrontVersions = pgTable(
  "storefront_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("not_started"),
    // values: 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'live'
    driveFolderId: uuid("drive_folder_id").references(() => driveFolders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("storefront_versions_client_version_key").on(t.clientIdCode, t.versionNumber),
    index("idx_storefront_versions_client").on(t.clientIdCode),
  ]
);

export const storefrontPages = pgTable("storefront_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientIdCode: text("client_id_code").notNull(),
  versionId: uuid("version_id").references(() => storefrontVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  metaDescription: text("meta_description"),
  isHomepage: boolean("is_homepage").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqVersionSlug: unique().on(t.versionId, t.slug) }));

export const storefrontModules = pgTable("storefront_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").notNull().references(() => storefrontPages.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  moduleType: storefrontModuleTypeEnum("module_type").notNull(),
  title: text("title"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  driveFileId: text("drive_file_id"),
  assetMimeType: text("asset_mime_type"),
  assetFilename: text("asset_filename"),
  containsAiPeople: boolean("contains_ai_people").notNull().default(false),
  sectionLayout: text("section_layout"),
  posterDriveFileId: text("poster_drive_file_id"),
  posterMimeType: text("poster_mime_type"),
  posterFilename: text("poster_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqPagePos: unique().on(t.pageId, t.position) }));

export type StorefrontPage = typeof storefrontPages.$inferSelect;
export type StorefrontModule = typeof storefrontModules.$inferSelect;
export type StorefrontVersion = typeof storefrontVersions.$inferSelect;

export const storefrontModuleTiles = pgTable("storefront_module_tiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id").notNull().references(() => storefrontModules.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  driveFileId: text("drive_file_id"),
  assetMimeType: text("asset_mime_type"),
  assetFilename: text("asset_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqModulePos: unique().on(t.moduleId, t.position) }));

export type StorefrontModuleTile = typeof storefrontModuleTiles.$inferSelect;

// ─── Sales Summary Cache ─────────────────────────────────────────────
// Stores pre-computed sales summary + inventory JSON responses.
// Keyed by cache_type ('summary' | 'inventory') + cache_key (date range + optional account IDs).

export const salesSummaryCache = pgTable(
  "sales_summary_cache",
  {
    id: serial("id").primaryKey(),
    cacheType: varchar("cache_type", { length: 20 }).notNull(),
    cacheKey: text("cache_key").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_sales_cache_type_key").on(table.cacheType, table.cacheKey),
    index("idx_sales_cache_updated").on(table.updatedAt),
  ]
);

// ─── Reports Cache ───────────────────────────────────────────────────
// Stores pre-warmed Redshift responses for /reports section pages
// (excluding Monthly Reports). Keyed by cache_type (report-overview,
// report-keywords, etc.) + cache_key (accountId|start|end variants).

export const reportsCache = pgTable(
  "reports_cache",
  {
    id: serial("id").primaryKey(),
    cacheType: varchar("cache_type", { length: 64 }).notNull(),
    cacheKey: text("cache_key").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_reports_cache_type_key").on(table.cacheType, table.cacheKey),
    index("idx_reports_cache_updated").on(table.updatedAt),
  ]
);

// ─── Type exports ────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof master.$inferSelect;
export type NewProduct = typeof master.$inferInsert;
export type Attribute = typeof attributes.$inferSelect;
export type ColumnAttribute = Attribute; // back-compat alias
export type AacClient = typeof aac.$inferSelect;
export type PublishHistoryEntry = typeof publishHistory.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;
export type FieldComment = typeof fieldComments.$inferSelect;
export type NewFieldComment = typeof fieldComments.$inferInsert;
export type AmazonSnapshot = typeof amazonSnapshots.$inferSelect;
export type NewAmazonSnapshot = typeof amazonSnapshots.$inferInsert;
export type SPAPICredential = typeof spApiCredentials.$inferSelect;
export type NewSPAPICredential = typeof spApiCredentials.$inferInsert;
export type CategoryDefinition = typeof categoryDefinitions.$inferSelect;
export type NewCategoryDefinition = typeof categoryDefinitions.$inferInsert;
export type ProductKeyOverride = typeof productKeyOverrides.$inferSelect;
export type NewProductKeyOverride = typeof productKeyOverrides.$inferInsert;
export type AttributeTemplateRequest = typeof attributeTemplateRequests.$inferSelect;
export type NewAttributeTemplateRequest = typeof attributeTemplateRequests.$inferInsert;
export type SeoProject = typeof seoProjects.$inferSelect;
export type NewSeoProject = typeof seoProjects.$inferInsert;
export type SeoAsin = typeof seoAsins.$inferSelect;
export type NewSeoAsin = typeof seoAsins.$inferInsert;
export type SeoKeyword = typeof seoKeywords.$inferSelect;
export type NewSeoKeyword = typeof seoKeywords.$inferInsert;
export type SeoReview = typeof seoReviews.$inferSelect;
export type NewSeoReview = typeof seoReviews.$inferInsert;
export type SeoRufus = typeof seoRufus.$inferSelect;
export type NewSeoRufus = typeof seoRufus.$inferInsert;
export type SeoCosmoMap = typeof seoCosmopMaps.$inferSelect;
export type NewSeoCosmoMap = typeof seoCosmopMaps.$inferInsert;
export type SeoComplianceReport = typeof seoComplianceReports.$inferSelect;
export type NewSeoComplianceReport = typeof seoComplianceReports.$inferInsert;
export type SeoExport = typeof seoExports.$inferSelect;
export type NewSeoExport = typeof seoExports.$inferInsert;
export type SeoQualityScore = typeof seoQualityScores.$inferSelect;
export type NewSeoQualityScore = typeof seoQualityScores.$inferInsert;
export type AmazonSyncSnapshot = typeof amazonSyncSnapshots.$inferSelect;
export type NewAmazonSyncSnapshot = typeof amazonSyncSnapshots.$inferInsert;
export type AmazonSyncRun = typeof amazonSyncRuns.$inferSelect;
export type NewAmazonSyncRun = typeof amazonSyncRuns.$inferInsert;
export type AmazonSyncDiscrepancy = typeof amazonSyncDiscrepancies.$inferSelect;
export type NewAmazonSyncDiscrepancy = typeof amazonSyncDiscrepancies.$inferInsert;

// ─── SEO Settings (global key-value config) ──────────────────────────

export const seoSettings = pgTable("seo_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 255 }).notNull().default(""),
});

export type SeoSettings = typeof seoSettings.$inferSelect;

// ─── Admin Event Log ────────────────────────────────────────────────
// Generic event log for tracking any action across all sections.
// Especially useful for AI request tracking, auth events, and admin ops.

export const adminEventLog = pgTable(
  "admin_event_log",
  {
    id: serial("id").primaryKey(),

    // Who
    userEmail: varchar("user_email", { length: 255 }),
    userName: varchar("user_name", { length: 255 }),

    // What
    section: varchar("section", { length: 50 }).notNull(), // seo | products | publish | import | export | auth | admin
    action: varchar("action", { length: 100 }).notNull(), // e.g. "claude:keywords", "project:create", "login"
    status: varchar("status", { length: 20 }).notNull().default("success"), // success | error | warning

    // Context
    resourceType: varchar("resource_type", { length: 50 }), // project | product | user | etc.
    resourceId: varchar("resource_id", { length: 255 }), // UUID or identifier
    resourceLabel: varchar("resource_label", { length: 500 }), // human-readable label

    // Details
    message: text("message"), // short summary
    detail: jsonb("detail").$type<Record<string, unknown>>(), // structured metadata (tokens, error stack, params, etc.)
    durationMs: integer("duration_ms"), // how long the action took

    // When
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_admin_event_log_created").on(table.createdAt),
    index("idx_admin_event_log_section").on(table.section),
    index("idx_admin_event_log_status").on(table.status),
    index("idx_admin_event_log_user").on(table.userEmail),
  ]
);

export type AdminEventLogEntry = typeof adminEventLog.$inferSelect;
export type NewAdminEventLogEntry = typeof adminEventLog.$inferInsert;

// ─── Issue Reports ───────────────────────────────────────────────────
export const issueReportStatusEnum = pgEnum("issue_report_status", [
  "pending",
  "in_review",
  "in_progress",
  "resolved",
  "closed",
]);

export const issueReports = pgTable(
  "issue_reports",
  {
    id: serial("id").primaryKey(),
    reportedBy: varchar("reported_by", { length: 255 }).notNull(),
    reportedByName: varchar("reported_by_name", { length: 255 }),
    section: varchar("section", { length: 100 }).notNull(),
    description: text("description").notNull(),
    screenshotUrl: text("screenshot_url"),
    status: issueReportStatusEnum("status").notNull().default("pending"),
    adminNotes: text("admin_notes"),
    notesSeen: boolean("notes_seen").notNull().default(true),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_issue_reports_status").on(table.status),
    index("idx_issue_reports_reported_by").on(table.reportedBy),
    index("idx_issue_reports_created").on(table.createdAt),
  ]
);

// ─── A+ Content: Comments ────────────────────────────────────────────
// Markup.io-style comment threads on A+ module previews.
// Each comment has optional pin coordinates (relative %) for placing on the preview.
// parentCommentId enables threaded replies.

export const aplusCommentStatusEnum = pgEnum("aplus_comment_status", [
  "active",
  "resolved",
]);

export const aplusComments = pgTable(
  "aplus_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .references(() => aplusModules.id, { onDelete: "set null" }),
    parentCommentId: uuid("parent_comment_id")
      .references((): AnyPgColumn => aplusComments.id, { onDelete: "cascade" }),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    authorName: varchar("author_name", { length: 255 }),
    body: text("body").notNull(),
    audience: varchar("audience", { length: 10 }).notNull().default("internal"),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    status: aplusCommentStatusEnum("status").notNull().default("active"),
    pinX: integer("pin_x"), // percentage 0-100, nullable (thread-level comments may not have pins)
    pinY: integer("pin_y"),
    commentNumber: integer("comment_number"), // display number (auto-incremented per product)
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_aplus_comments_product").on(table.productId),
    index("idx_aplus_comments_module").on(table.moduleId),
    index("idx_aplus_comments_status").on(table.status),
    index("idx_aplus_comments_parent").on(table.parentCommentId),
    index("idx_aplus_comments_client").on(table.clientIdCode),
  ]
);

export type AplusComment = typeof aplusComments.$inferSelect;
export type NewAplusComment = typeof aplusComments.$inferInsert;

export type IssueReport = typeof issueReports.$inferSelect;
export type NewIssueReport = typeof issueReports.$inferInsert;
export type AplusSet = typeof aplusSets.$inferSelect;
export type NewAplusSet = typeof aplusSets.$inferInsert;
export type AplusModule = typeof aplusModules.$inferSelect;
export type NewAplusModule = typeof aplusModules.$inferInsert;
export type AplusModuleImage = typeof aplusModuleImages.$inferSelect;
export type NewAplusModuleImage = typeof aplusModuleImages.$inferInsert;
export type BrandStoryEntry = typeof brandStory.$inferSelect;
export type NewBrandStoryEntry = typeof brandStory.$inferInsert;
export type DriveFolder = typeof driveFolders.$inferSelect;
export type NewDriveFolder = typeof driveFolders.$inferInsert;
export type IntentwiseAccount = typeof intentwiseAccounts.$inferSelect;
export type NewIntentwiseAccount = typeof intentwiseAccounts.$inferInsert;
export type RedshiftArchiveCatalogRow = typeof redshiftArchiveCatalog.$inferSelect;
export type NewRedshiftArchiveCatalogRow = typeof redshiftArchiveCatalog.$inferInsert;
export type RedshiftArchiveAccountStat = typeof redshiftArchiveAccountStats.$inferSelect;
export type NewRedshiftArchiveAccountStat = typeof redshiftArchiveAccountStats.$inferInsert;
export type DriveFile = typeof driveFiles.$inferSelect;
export type NewDriveFile = typeof driveFiles.$inferInsert;
export type BrandStoryVersion = typeof brandStoryVersions.$inferSelect;
export type NewBrandStoryVersion = typeof brandStoryVersions.$inferInsert;
export type BrandStoryModule = typeof brandStoryModules.$inferSelect;
export type NewBrandStoryModule = typeof brandStoryModules.$inferInsert;
export type BrandStoryAsinItem = typeof brandStoryAsinItems.$inferSelect;
export type NewBrandStoryAsinItem = typeof brandStoryAsinItems.$inferInsert;
export type BrandStoryQaItem = typeof brandStoryQaItems.$inferSelect;
export type NewBrandStoryQaItem = typeof brandStoryQaItems.$inferInsert;
export type BrandStoryAsset = typeof brandStoryAssets.$inferSelect;
export type NewBrandStoryAsset = typeof brandStoryAssets.$inferInsert;

// ─── Client Onboarding Steps ─────────────────────────────────────────
// Tracks completion of each onboarding step per client.

export const clientOnboardingSteps = pgTable(
  "client_onboarding_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    stepKey: text("step_key").notNull(),
    status: text("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    metadata: jsonb("metadata").default({}),
    assigneeId: uuid("assignee_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_onboarding_client").on(table.clientIdCode),
    index("idx_onboarding_status").on(table.status),
    unique("uq_onboarding_client_step").on(table.clientIdCode, table.stepKey),
  ]
);

export type ClientOnboardingStep = typeof clientOnboardingSteps.$inferSelect;
export type NewClientOnboardingStep = typeof clientOnboardingSteps.$inferInsert;

// ─── Variations (hierarchical product grouping) ─────────────────────
// Top-level variation definition (one per product family per client).
// Approach C from design doc: exclusive groups via FK + cross-cutting tags via junction.

export const variations = pgTable(
  "variations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: varchar("client_id", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    amazonVariationId: varchar("amazon_variation_id", { length: 100 }),
    themeAttributes: jsonb("theme_attributes").$type<string[]>().default([]),
    primaryDimension: varchar("primary_dimension", { length: 50 }),
    description: text("description"),
    contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>(),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | locked
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_variations_client").on(table.clientId),
  ]
);

// Groups within a variation (products can belong to multiple groups via junction table)
export const variationGroups = pgTable(
  "variation_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => variations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    dimension: varchar("dimension", { length: 50 }).notNull(),
    sortOrder: integer("sort_order").default(0),
    isVarietyPack: boolean("is_variety_pack").notNull().default(false),
    varietyPackDetails: jsonb("variety_pack_details").$type<Array<{
      flavor: string;
      size: string;
      color: string;
      style: string;
      units: string;
      customLabel: string;
    }>>(),
    contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_variation_group_name").on(table.variationId, table.name),
    index("idx_variation_groups_variation").on(table.variationId),
  ]
);

// ─── Variety Pack Composition ────────────────────────────────────────
// Links a variety pack product to its included items (other master products or custom entries).
export const varietyPackItems = pgTable(
  "variety_pack_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    packProductId: uuid("pack_product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    // If the included item is another product in catalog
    includedProductId: uuid("included_product_id")
      .references(() => master.id, { onDelete: "set null" }),
    // Attributes (populated from linked product or manually)
    flavor: varchar("flavor", { length: 200 }),
    size: varchar("size", { length: 200 }),
    color: varchar("color", { length: 200 }),
    style: varchar("style", { length: 200 }),
    customLabel: varchar("custom_label", { length: 255 }),
    units: integer("units").notNull().default(1),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [
    index("idx_variety_pack_items_pack").on(table.packProductId),
    index("idx_variety_pack_items_included").on(table.includedProductId),
  ]
);

// Cross-cutting tags (a product can have many tags across many dimensions)
export const variationTags = pgTable(
  "variation_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => variations.id, { onDelete: "cascade" }),
    dimension: varchar("dimension", { length: 50 }).notNull(),
    value: varchar("value", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_variation_tag_value").on(table.variationId, table.dimension, table.value),
    index("idx_variation_tags_variation").on(table.variationId),
  ]
);

// Junction: which products have which tags
export const variationTagAssignments = pgTable(
  "variation_tag_assignments",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => variationTags.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
  },
  (table) => [
    // Composite PK via unique constraint (Drizzle doesn't support composite PK on non-serial)
    unique("pk_variation_tag_assignments").on(table.tagId, table.productId),
    index("idx_variation_tag_assignments_product").on(table.productId),
  ]
);

// Junction: which products belong to which groups (many-to-many)
export const variationGroupAssignments = pgTable(
  "variation_group_assignments",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => variationGroups.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("pk_variation_group_assignments").on(table.groupId, table.productId),
    index("idx_variation_group_assignments_product").on(table.productId),
    index("idx_variation_group_assignments_group").on(table.groupId),
  ]
);

// ─── Content Impact Snapshots ──────────────────────────────────────
// Revenue attribution: captures sales metrics before/after content changes.
// "before" is filled at change time from cached sales data.
// "after" is filled on the next sales dashboard load after the impact window.

// ─── Design Status ──────────────────────────────────────────────────

export const designCategoryEnum = pgEnum("design_category", [
  "brand_story",
  "aplus",
  "listing_images",
  "storefront",
]);

export const designStatusValueEnum = pgEnum("design_status_value", [
  "not_started",
  "in_progress",
  "in_review",
  "approved",
  "live",
]);

export const designStatus = pgTable(
  "design_status",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    category: designCategoryEnum("category").notNull(),
    status: designStatusValueEnum("status").notNull().default("not_started"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: varchar("updated_by", { length: 255 }),
  },
  (table) => [
    unique("uq_design_status_client_category").on(
      table.clientIdCode,
      table.category
    ),
    index("idx_design_status_client").on(table.clientIdCode),
  ]
);

export type DesignStatus = typeof designStatus.$inferSelect;
export type NewDesignStatus = typeof designStatus.$inferInsert;

export const impactSnapshotStatusEnum = pgEnum("impact_snapshot_status", [
  "pending_before",
  "pending_after",
  "complete",
]);

export const contentImpactSnapshots = pgTable(
  "content_impact_snapshots",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productId: uuid("product_id").references(() => master.id, { onDelete: "set null" }),
    asin: varchar("asin", { length: 20 }),

    // What changed
    changeType: varchar("change_type", { length: 30 }).notNull(), // product_edit | aplus_update | bulk_edit
    changeSummary: text("change_summary").notNull(),
    changeCount: integer("change_count").notNull().default(1),
    changedBy: varchar("changed_by", { length: 255 }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),

    // Sales metrics snapshots (account-level from Redshift)
    beforeMetrics: jsonb("before_metrics").$type<Record<string, number>>(),
    afterMetrics: jsonb("after_metrics").$type<Record<string, number>>(),
    beforeSnapshotAt: timestamp("before_snapshot_at", { withTimezone: true }),
    afterSnapshotAt: timestamp("after_snapshot_at", { withTimezone: true }),

    // Config
    impactWindowDays: integer("impact_window_days").notNull().default(14),
    status: impactSnapshotStatusEnum("status").notNull().default("pending_before"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_impact_snapshots_client").on(table.clientIdCode),
    index("idx_impact_snapshots_product").on(table.productId),
    index("idx_impact_snapshots_status").on(table.status),
    index("idx_impact_snapshots_changed_at").on(table.changedAt),
  ]
);

export type ContentImpactSnapshot = typeof contentImpactSnapshots.$inferSelect;
export type NewContentImpactSnapshot = typeof contentImpactSnapshots.$inferInsert;

// ─── Gantt (client onboarding timeline) ─────────────────────────────

export const ganttTemplates = pgTable(
  "gantt_templates",
  {
    id: serial("id").primaryKey(),
    templateType: clientTypeEnum("template_type").notNull(),
    section: varchar("section", { length: 100 }).notNull(),
    wbs: varchar("wbs", { length: 10 }).notNull(),
    taskName: varchar("task_name", { length: 255 }).notNull(),
    subtaskTitle: text("subtask_title"),
    description: text("description"),
    weekStart: integer("week_start").notNull(),
    weekEnd: integer("week_end").notNull(),
    startDay: integer("start_day").notNull().default(1),
    durationDays: integer("duration_days").notNull().default(0),
  },
  (table) => [
    index("idx_gantt_templates_type").on(table.templateType),
    unique("uq_gantt_template_wbs").on(table.templateType, table.wbs),
  ]
);

export const clientGanttTasks = pgTable(
  "client_gantt_tasks",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    templateTaskId: integer("template_task_id").references(() => ganttTemplates.id, { onDelete: "set null" }),
    wbs: varchar("wbs", { length: 10 }).notNull(),
    section: varchar("section", { length: 100 }).notNull(),
    taskName: varchar("task_name", { length: 255 }).notNull(),
    subtaskTitle: text("subtask_title"),
    weekStart: integer("week_start").notNull(),
    weekEnd: integer("week_end").notNull(),
    startDay: integer("start_day").notNull().default(1),
    durationDays: integer("duration_days").notNull().default(0),
    status: ganttTaskStatusEnum("status").notNull().default("pending"),
    completionPct: integer("completion_pct").notNull().default(0),
    assignedTo: varchar("assigned_to", { length: 255 }),
    asanaTaskGid: varchar("asana_task_gid", { length: 100 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    portalHidden: boolean("portal_hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_gantt_tasks_client").on(table.clientIdCode),
    index("idx_gantt_tasks_status").on(table.status),
  ]
);

export type GanttTemplate = typeof ganttTemplates.$inferSelect;
export type NewGanttTemplate = typeof ganttTemplates.$inferInsert;
export type ClientGanttTask = typeof clientGanttTasks.$inferSelect;
export type NewClientGanttTask = typeof clientGanttTasks.$inferInsert;

// ─── Client Forecasts ────────────────────────────────────────────

export const clientForecasts = pgTable(
  "client_forecasts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    month: varchar("month", { length: 7 }).notNull(), // "2026-03"
    metric: varchar("metric", { length: 50 }).notNull(), // "product_sales", "ad_spend"
    forecastValue: numeric("forecast_value", { precision: 14, scale: 2 }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_forecasts_client").on(table.clientIdCode),
    unique("uq_forecast_client_month_metric").on(
      table.clientIdCode,
      table.month,
      table.metric
    ),
  ]
);

export type ClientForecast = typeof clientForecasts.$inferSelect;
export type NewClientForecast = typeof clientForecasts.$inferInsert;

// ─── Inventory Recommendation Settings ──────────────────────────────
// Per-client percentage adjustments for the 3 recommendation columns
// in the Inventory Forecast table. Editable in hub, read-only in portal.

export const inventoryRecSettings = pgTable("inventory_rec_settings", {
  clientIdCode: varchar("client_id_code", { length: 50 }).primaryKey(),
  // Legacy — no longer read since 0126; kept (additive-only rule).
  pct90d: integer("pct_90d").notNull().default(0),
  pctQ1: integer("pct_q1").notNull().default(0),
  pctAvg: integer("pct_avg").notNull().default(0),
  method: text("method").notNull().default("recent"), // 'recent' | 'seasonal' | 'average' | 'greater' (0128); no row => app default 'greater'
  recentDays: integer("recent_days").notNull().default(90),
  seasonalStart: text("seasonal_start"), // YYYY-MM-DD; null => this month + next two, last year
  seasonalEnd: text("seasonal_end"),
  upliftPct: integer("uplift_pct").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 255 }),
});

export type InventoryRecSettings = typeof inventoryRecSettings.$inferSelect;

export const inventoryRecOverrides = pgTable(
  "inventory_rec_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    asin: text("asin").notNull(),
    sku: text("sku").notNull(),
    qty: integer("qty").notNull(),
    note: text("note").notNull().default(""),
    setBy: varchar("set_by", { length: 255 }).notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_rec_overrides_client_sku_uq").on(t.clientIdCode, t.sku)],
);
export type InventoryRecOverride = typeof inventoryRecOverrides.$inferSelect;

// FBA capacity limits typed in from Seller Central's Capacity Monitor (0131).
export const inventoryCapacityLimits = pgTable(
  "inventory_capacity_limits",
  {
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    storageType: text("storage_type").notNull(),
    month: text("month").notNull(), // YYYY-MM
    limitFt3: doublePrecision("limit_ft3").notNull(),
    status: text("status").notNull().default("estimate"), // 'confirmed' | 'estimate' (0132), set by the team
    setBy: varchar("set_by", { length: 255 }).notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "inventory_capacity_limits_pk", columns: [t.clientIdCode, t.storageType, t.month] })],
);

// Per-product safety buffer % on the recommendation basis (0129). No row ⇒ app default 10%.
export const inventoryRecBuffers = pgTable(
  "inventory_rec_buffers",
  {
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    sku: text("sku").notNull(),
    bufferPct: integer("buffer_pct").notNull(),
    setBy: varchar("set_by", { length: 255 }).notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "inventory_rec_buffers_pk", columns: [t.clientIdCode, t.sku] })],
);

export const inventoryRecSnapshots = pgTable(
  "inventory_rec_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    sentBy: varchar("sent_by", { length: 255 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    method: text("method").notNull(),
    recentDays: integer("recent_days").notNull(),
    seasonalStart: text("seasonal_start"),
    seasonalEnd: text("seasonal_end"),
    upliftPct: integer("uplift_pct").notNull(),
    skuCount: integer("sku_count").notNull(),
    unitsToSend: integer("units_to_send").notNull(),
    overstockSkus: integer("overstock_skus").notNull(),
    overstockUnits: integer("overstock_units").notNull(),
  },
  (t) => [index("inventory_rec_snapshots_client_sent_idx").on(t.clientIdCode, t.sentAt)],
);
export type InventoryRecSnapshot = typeof inventoryRecSnapshots.$inferSelect;

export const inventoryRecSnapshotRows = pgTable(
  "inventory_rec_snapshot_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => inventoryRecSnapshots.id, { onDelete: "cascade" }),
    asin: text("asin").notNull(),
    sku: text("sku").notNull(),
    productName: text("product_name").notNull().default(""),
    mainImageUrl: text("main_image_url").notNull().default(""),
    available: integer("available").notNull(),
    inbound: integer("inbound").notNull(),
    reserved: integer("reserved").notNull(),
    awdAvailable: integer("awd_available").notNull().default(0), // 0130
    awdInbound: integer("awd_inbound").notNull().default(0), // 0130
    stockPosition: integer("stock_position").notNull(),
    basisUnits: integer("basis_units").notNull(),
    liveCalc: integer("live_calc").notNull(),
    overrideQty: integer("override_qty"),
    note: text("note").notNull().default(""),
    final: integer("final").notNull(),
  },
  (t) => [index("inventory_rec_snapshot_rows_snapshot_idx").on(t.snapshotId)],
);
export type InventoryRecSnapshotRow = typeof inventoryRecSnapshotRows.$inferSelect;

// ─── PPC Module ──────────────────────────────────────────────────────

export const ppcReportTypeEnum = pgEnum("ppc_report_type", [
  "campaign",
  "keyword",
  "search_term",
  "sqp",
]);

export const ppcApprovalStatusEnum = pgEnum("ppc_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const ppcAlertTypeEnum = pgEnum("ppc_alert_type", [
  "budget",
  "inventory",
  "competitor",
  "trend",
]);

export const ppcAlertSeverityEnum = pgEnum("ppc_alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const ppcSnapshots = pgTable(
  "ppc_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    reportType: ppcReportTypeEnum("report_type").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    data: jsonb("data"),
    summary: jsonb("summary").notNull(),
    deltas: jsonb("deltas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ppc_snap_client_idx").on(t.clientIdCode),
    index("ppc_snap_date_idx").on(t.snapshotDate),
    unique("ppc_snap_unique").on(t.clientIdCode, t.reportType, t.snapshotDate),
  ]
);

export const ppcApprovals = pgTable(
  "ppc_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    approvalType: varchar("approval_type", { length: 100 }).notNull(),
    description: text("description").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    requestedBy: uuid("requested_by").notNull().references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id),
    status: ppcApprovalStatusEnum("status").notNull().default("pending"),
  },
  (t) => [
    index("ppc_appr_client_idx").on(t.clientIdCode),
    index("ppc_appr_status_idx").on(t.status),
  ]
);

export const ppcDecisions = pgTable(
  "ppc_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    decision: text("decision").notNull(),
    expectedOutcome: text("expected_outcome"),
    expectedMetric: varchar("expected_metric", { length: 50 }),
    expectedValue: numeric("expected_value", { precision: 12, scale: 2 }),
    actualOutcome: text("actual_outcome"),
    actualMetric: varchar("actual_metric", { length: 50 }),
    actualValue: numeric("actual_value", { precision: 12, scale: 2 }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").notNull().references(() => users.id),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    snapshotId: uuid("snapshot_id").references(() => ppcSnapshots.id),
  },
  (t) => [
    index("ppc_dec_client_idx").on(t.clientIdCode),
  ]
);

export const ppcAlerts = pgTable(
  "ppc_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    alertType: ppcAlertTypeEnum("alert_type").notNull(),
    severity: ppcAlertSeverityEnum("severity").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  },
  (t) => [
    index("ppc_alert_client_idx").on(t.clientIdCode),
    index("ppc_alert_type_idx").on(t.alertType),
  ]
);

export type PpcSnapshot = typeof ppcSnapshots.$inferSelect;
export type NewPpcSnapshot = typeof ppcSnapshots.$inferInsert;
export type PpcApproval = typeof ppcApprovals.$inferSelect;
export type NewPpcApproval = typeof ppcApprovals.$inferInsert;
export type PpcDecision = typeof ppcDecisions.$inferSelect;
export type NewPpcDecision = typeof ppcDecisions.$inferInsert;
export type PpcAlert = typeof ppcAlerts.$inferSelect;
export type NewPpcAlert = typeof ppcAlerts.$inferInsert;

export type Variation = typeof variations.$inferSelect;
export type NewVariation = typeof variations.$inferInsert;
export type VariationGroup = typeof variationGroups.$inferSelect;
export type NewVariationGroup = typeof variationGroups.$inferInsert;
export type VariationTag = typeof variationTags.$inferSelect;
export type NewVariationTag = typeof variationTags.$inferInsert;

// ─── Forecast Tool ──────────────────────────────────────────────────

export const forecastToolVersions = pgTable(
  "forecast_tool_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(false),
    historicStart: varchar("historic_start", { length: 7 }),
    forecastStart: varchar("forecast_start", { length: 7 }),
    forecastEnd: varchar("forecast_end", { length: 7 }),
    isLocked: boolean("is_locked").notNull().default(false),
    historicalData: jsonb("historical_data").$type<Record<string, Record<string, number>>>(),
    asinHistoricalData: jsonb("asin_historical_data").$type<Record<string, Record<string, Record<string, number>>>>(),
    seasonalityData: jsonb("seasonality_data").$type<{
      keywords: string[];
      coefficients: Record<string, number>;
      rawSearchVolume: Record<string, { date: string; volume: number }[]>;
    }>(),
  },
  (table) => [
    index("idx_ftv_client").on(table.clientIdCode),
  ]
);

export const forecastToolCells = pgTable(
  "forecast_tool_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").notNull().references(() => forecastToolVersions.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    metric: varchar("metric", { length: 50 }).notNull(),
    value: numeric("value", { precision: 14, scale: 6 }),
  },
  (table) => [
    index("idx_ftc_version").on(table.versionId),
    unique("uq_ftc_version_month_metric").on(table.versionId, table.month, table.metric),
  ]
);

export const forecastToolAsins = pgTable(
  "forecast_tool_asins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").notNull().references(() => forecastToolVersions.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }),
    sku: varchar("sku", { length: 100 }),
    productName: varchar("product_name", { length: 300 }).notNull(),
    productPrice: numeric("product_price", { precision: 10, scale: 2 }).notNull(),
    sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
    variationAttributes: jsonb("variation_attributes").$type<Record<string, string>>(),
    isNew: boolean("is_new").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_fta_version").on(table.versionId),
  ]
);

export const forecastToolAsinCells = pgTable(
  "forecast_tool_asin_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    asinId: uuid("asin_id").notNull().references(() => forecastToolAsins.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    metric: varchar("metric", { length: 30 }).notNull(),
    value: numeric("value", { precision: 14, scale: 2 }),
  },
  (table) => [
    index("idx_ftac_asin").on(table.asinId),
    unique("uq_ftac_asin_month_metric").on(table.asinId, table.month, table.metric),
  ]
);

export type ForecastToolVersion = typeof forecastToolVersions.$inferSelect;
export type NewForecastToolVersion = typeof forecastToolVersions.$inferInsert;
export type ForecastToolCell = typeof forecastToolCells.$inferSelect;
export type NewForecastToolCell = typeof forecastToolCells.$inferInsert;
export type ForecastToolAsin = typeof forecastToolAsins.$inferSelect;
export type NewForecastToolAsin = typeof forecastToolAsins.$inferInsert;
export type ForecastToolAsinCell = typeof forecastToolAsinCells.$inferSelect;
export type NewForecastToolAsinCell = typeof forecastToolAsinCells.$inferInsert;

// ─── Support Tickets ────────────────────────────────────────────────

export const supportTicketCategoryEnum = pgEnum("support_ticket_category", [
  "bug",
  "feature_request",
  "account_issue",
  "billing",
  "content",
  "other",
]);

export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "escalated",
  "resolved",
  "closed",
]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    ticketNumber: varchar("ticket_number", { length: 20 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: supportTicketCategoryEnum("category").notNull().default("bug"),
    priority: supportTicketPriorityEnum("priority").notNull().default("medium"),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    reportedBy: varchar("reported_by", { length: 255 }).notNull(),
    reportedByName: varchar("reported_by_name", { length: 255 }),
    screenshotUrl: text("screenshot_url"),
    section: varchar("section", { length: 100 }),
    escalationLevel: integer("escalation_level").notNull().default(0),
    slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
    internalNotes: jsonb("internal_notes")
      .$type<{ author: string; authorName: string | null; text: string; createdAt: string }[]>()
      .notNull()
      .default([]),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_support_tickets_status").on(table.status),
    index("idx_support_tickets_priority").on(table.priority),
    index("idx_support_tickets_assigned").on(table.assignedTo),
    index("idx_support_tickets_created").on(table.createdAt),
    index("idx_support_tickets_sla").on(table.slaDeadline),
  ]
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

// ─── Monthly report section config ────────────────────────────────────
// scope='global' with scope_key='default' for global defaults.
// scope='client' with scope_key=<clientIdCode like '2348430'> for per-client.

export const reportSectionConfig = pgTable(
  "report_section_config",
  {
    scope: text("scope").notNull(),           // 'global' | 'client'
    scopeKey: text("scope_key").notNull(),    // 'default' | clientIdCode
    sectionKey: text("section_key").notNull(),// 'products' | 'b2b' | ...
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK enforced via unique index; Drizzle table-scope PK API is awkward,
    // so we enforce in the SQL migration (see 0042_monthly_report_config.sql).
    index("idx_rsc_scope").on(table.scope, table.scopeKey),
  ],
);


// ─── Folder Tree Config ───────────────────────────────────────────
// Single-row table (id = 1) storing the editable Drive folder tree
// used by client onboarding. JSON shape: FolderNode[] — see
// src/lib/onboarding/folder-tree.ts for the FolderNode type.

export const folderTreeConfig = pgTable("folder_tree_config", {
  id: integer("id").primaryKey().default(1),
  tree: jsonb("tree").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});

// ─── Client Brand Guidelines ─────────────────────────────────────────
// Per-client brand book + structured summary + dated team notes.
// Synthetic uuid PK on client_brand_guidelines so polymorphic
// drive_files.entityId (uuid) can reference logo uploads.

export const clientBrandGuidelines = pgTable(
  "client_brand_guidelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    activeVersionId: uuid("active_version_id"),

    summaryLogo: jsonb("summary_logo").$type<{
      primary_description: string | null;
      secondary_description: string | null;
      monochrome_description: string | null;
      clearspace_notes: string | null;
      misuse_notes: string | null;
      primary_url: string | null;
      secondary_url: string | null;
      monochrome_url: string | null;
    }>().default({
      primary_description: null,
      secondary_description: null,
      monochrome_description: null,
      clearspace_notes: null,
      misuse_notes: null,
      primary_url: null,
      secondary_url: null,
      monochrome_url: null,
    }),

    summaryColors: jsonb("summary_colors").$type<Array<{
      role: "primary" | "secondary" | "accent" | "neutral";
      tier?: string | null;
      name: string;
      hex: string;
      rgb: string | null;
      cmyk: string | null;
    }>>().default([]),

    summaryTypography: jsonb("summary_typography").$type<{
      primary: { family: string; weights: string[]; fallback: string | null } | null;
      secondary: { family: string; weights: string[]; fallback: string | null } | null;
    }>().default({ primary: null, secondary: null }),

    summaryVoice: jsonb("summary_voice").$type<{
      attributes: string[];
      dos: string[];
      donts: string[];
      sample_copy: string | null;
    }>().default({ attributes: [], dos: [], donts: [], sample_copy: null }),

    extractionStatus: varchar("extraction_status", { length: 20 }).notNull().default("idle"),
    // 'idle' | 'extracting' | 'failed'
    extractionStage: text("extraction_stage"),
    // Sub-stage while extracting: 'parsing_pdf' | 'extracting_md' | 'extracting_summary' | 'saving'. NULL when idle/failed.
    lastExtractedAt: timestamp("last_extracted_at", { withTimezone: true }),
    lastExtractionModel: text("last_extraction_model"),
    lastExtractionError: text("last_extraction_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_cbg_client").on(t.clientIdCode),
    index("idx_cbg_client").on(t.clientIdCode),
  ]
);

export const clientBrandGuidelineVersions = pgTable(
  "client_brand_guideline_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    driveFileId: text("drive_file_id").notNull(),
    originalFilename: text("original_filename").notNull(),
    byteSize: integer("byte_size"),
    pageCount: integer("page_count"),
    extractedMd: text("extracted_md"),
    aiPreviewMd: text("ai_preview_md"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cbgv_client").on(t.clientIdCode),
    index("idx_cbgv_active").on(t.clientIdCode, t.archivedAt),
    unique("uq_cbgv_client_version").on(t.clientIdCode, t.versionNumber),
  ]
);

export const clientBrandGuidelineNotes = pgTable(
  "client_brand_guideline_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    bodyMd: text("body_md").notNull(),
    authorEmail: text("author_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cbgn_client").on(t.clientIdCode),
    index("idx_cbgn_created").on(t.clientIdCode, t.createdAt),
  ]
);

// ─── Case Studies ─────────────────────────────────────────────────────

export const caseStudyStatusEnum = pgEnum("case_study_status", ["draft", "published"]); // legacy, dropped after deploy
export const caseStudyFormatEnum = pgEnum("case_study_format", ["high_level", "detailed"]);
export const caseStudyStageEnum = pgEnum("case_study_stage", ["drafting", "in_review", "approved", "sent"]);

export const caseStudies = pgTable(
  "case_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    format: caseStudyFormatEnum("format").notNull().default("detailed"),
    title: text("title").notNull(),
    dateRangeStart: date("date_range_start").notNull(),
    dateRangeEnd: date("date_range_end").notNull(),
    sectionsEnabled: text("sections_enabled").array().notNull(),
    status: caseStudyStatusEnum("status").notNull().default("draft"), // legacy
    stage: caseStudyStageEnum("stage").notNull().default("drafting"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    metrics: jsonb("metrics").notNull().default({}).$type<Record<string, unknown>>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    clientSector: text("client_sector").notNull().default(""),
    contactEmail: text("contact_email").notNull().default("hello@marketfoundry.com"),
    officeLocations: text("office_locations").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cs_client").on(t.clientIdCode),
    index("idx_cs_status").on(t.status),
    index("idx_cs_stage").on(t.stage),
    uniqueIndex("case_studies_client_format_key").on(t.clientIdCode, t.format),
  ]
);

export const caseStudySections = pgTable(
  "case_study_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseStudyId: uuid("case_study_id")
      .notNull()
      .references(() => caseStudies.id, { onDelete: "cascade" }),
    sectionType: text("section_type").notNull(),
    sortOrder: integer("sort_order").notNull(),
    content: jsonb("content").notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_css_case_study").on(t.caseStudyId),
  ]
);

export type CaseStudy = typeof caseStudies.$inferSelect;
export type NewCaseStudy = typeof caseStudies.$inferInsert;
export type CaseStudySection = typeof caseStudySections.$inferSelect;
export type NewCaseStudySection = typeof caseStudySections.$inferInsert;

// ─── Hub Status Tracker ──────────────────────────────────────────────
export const hubFeatures = pgTable(
  "hub_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
    status: hubFeatureStatusEnum("status").notNull(),
    progress: integer("progress").notNull().default(0),
    domain: varchar("domain", { length: 50 }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_hub_features_status").on(t.status),
    index("idx_hub_features_domain").on(t.domain),
  ]
);

export type HubFeature = typeof hubFeatures.$inferSelect;
export type NewHubFeature = typeof hubFeatures.$inferInsert;

// ─── Calendar Events ─────────────────────────────────────────────────
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 50 }).unique(),
    title: varchar("title", { length: 200 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    type: calendarEventTypeEnum("type").notNull(),
    memberName: varchar("member_name", { length: 100 }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_calendar_events_start_date").on(t.startDate),
    index("idx_calendar_events_type").on(t.type),
    index("idx_calendar_events_range").on(t.startDate, t.endDate),
  ]
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

// ─── Time Off Requests ───────────────────────────────────────────────
// One row per request. Approval: admins and above — the requester's assigned
// approver (users.time_off_approver_id; owners / super admins as backup), or
// any admin when nobody is assigned. `workingDays` is a SNAPSHOT taken at
// submission: correcting a holiday date later must not silently rewrite an
// already-decided request, and it makes days-taken a cheap SUM. Whole days
// only — no half days.
// `user_id` stays ON DELETE no action: a person's leave history must
// survive them, never cascade away. `decided_by` is ON DELETE set null:
// a blocked delete on an approver's own account is worse than losing the
// attribution. Note that with two approvers a null `decided_by` is now
// genuinely ambiguous rather than trivially recoverable — an accepted cost
// of the D2 revision, not an oversight.
// SQL-only, no Drizzle mirror: the migration also adds an EXCLUDE USING
// gist constraint named `time_off_no_overlap_per_user` (user_id WITH =,
// daterange(start_date, end_date, '[]') WITH &&, filtered to
// pending/approved) to close a read-then-write race that no amount of
// application code can — two concurrent POSTs both reading an empty
// conflict set before either writes. It cannot be expressed here:
// drizzle-orm@0.45's pg-core ships checks.js and unique-constraint.js but
// has no exclusion-constraint module. Route-level validation in
// src/app/api/time-off/route.ts stays as the fast path with a friendly
// error; this constraint is only the backstop for the race the fast path
// cannot see.
export const timeOffRequests = pgTable(
  "time_off_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason").notNull(),
    status: timeOffStatusEnum("status").notNull().default("pending"),
    workingDays: integer("working_days").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    // "hub" = requested here; "gusto" = mirrored from Gusto (read-only here).
    source: varchar("source", { length: 10 }).notNull().default("hub"),
    // The Gusto time off request uuid when source = "gusto".
    externalId: text("external_id"),
    // vacation / sick (Gusto's policy type); null for hub requests.
    kind: varchar("kind", { length: 20 }),
    // The event this request was published as on the shared time off calendar.
    googleEventId: text("google_event_id"),
  },
  (t) => [
    uniqueIndex("uq_time_off_source_external").on(t.source, t.externalId),
    index("idx_time_off_user_start").on(t.userId, t.startDate),
    index("idx_time_off_status").on(t.status),
    index("idx_time_off_range").on(t.startDate, t.endDate),
    check("time_off_dates_ordered", sql`${t.endDate} >= ${t.startDate}`),
    check("time_off_reason_not_blank", sql`length(btrim(${t.reason})) > 0`),
    check("time_off_working_days_non_negative", sql`${t.workingDays} >= 0`),
  ]
);

export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;

// ─── Public Holidays ─────────────────────────────────────────────────
// Country-scoped reference data and the ONLY source of truth for "is this
// a non-working day". Distinct from calendar_events rows of type
// 'holiday', which are observances (Valentine's, Halloween) kept for
// content planning and which never affect day counts (spec D12).
export const publicHolidays = pgTable(
  "public_holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    holidayDate: date("holiday_date").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("public_holidays_unique").on(t.countryCode, t.holidayDate),
    index("idx_public_holidays_date").on(t.holidayDate),
  ]
);

export type PublicHoliday = typeof publicHolidays.$inferSelect;
export type NewPublicHoliday = typeof publicHolidays.$inferInsert;

// ═══ SQL-ONLY CONSTRAINTS ON THIS BRANCH — READ BEFORE "FIXING" DRIFT ═══
// drizzle-orm@0.45's pg-core ships checks.js and unique-constraint.js but has
// NO exclusion-constraint module, so two EXCLUDE USING gist constraints exist
// in SQL with no Drizzle mirror. Neither is drift. Both are deliberate:
//   1. `time_off_no_overlap_per_user` on time_off_requests (migration 0087) —
//      see the note above the timeOffRequests definition.
//   2. `user_pay_periods_no_overlap` on user_pay_periods (migration 0090) —
//      see the note on userPayPeriods below.
// A schema-drift checker that compares Drizzle to the database WILL flag both.
// ═══════════════════════════════════════════════════════════════════════

// ─── User Profiles (tier 1) ──────────────────────────────────────────
// 1:1 with users. Readable and writable by SELF and SUPER-ADMIN only —
// ordinary admins cannot see it (spec §3.2).
//
// `addressCountry` is deliberately NOT called `country_code`. That name is
// taken on `users` and means something completely different: a POLICY
// assignment of which holiday calendar this person gets (a Manila-based
// person working US hours is assigned 'US'). This column is where they
// physically live. Conflating the two silently changes someone's leave
// allowance, which is why they have different names and visibly different
// UI labels — "Holiday calendar" vs "Country of residence".
//
// GDPR note: date_of_birth and the address are personal data for ES/PT/FI
// staff. Gated to self + super-admin and audited, but NOT encrypted — a
// deliberate proportionality call, unlike the bank/tax identifiers below.
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  personalEmail: varchar("personal_email", { length: 255 }),
  addressLine1: varchar("address_line1", { length: 200 }),
  addressLine2: varchar("address_line2", { length: 200 }),
  city: varchar("city", { length: 120 }),
  postcode: varchar("postcode", { length: 20 }),
  addressCountry: char("address_country", { length: 2 }),
  dateOfBirth: date("date_of_birth"),
  emergencyContactName: varchar("emergency_contact_name", { length: 120 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 40 }),
  emergencyContactRelation: varchar("emergency_contact_relation", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

// ─── User Pay Periods (tier 2) ───────────────────────────────────────
// 1:N and effective-dated. Super-admin only, read AND write.
// `effectiveTo` NULL means "currently in force".
//
// SQL-only, no Drizzle mirror: migration 0090 also adds
//   EXCLUDE USING gist (user_id WITH =,
//                       daterange(effective_from, effective_to, '[]') WITH &&)
// named `user_pay_periods_no_overlap`. It is what makes "the rate in force on
// date X" a well-defined question rather than a guess between two overlapping
// rows. drizzle-orm 0.45 cannot express it (see the banner above). The
// route-level overlaps() pre-check in the pay-periods handler is the friendly
// fast path; this constraint is the backstop for the read-then-write race that
// no amount of application code can close.
//
// The bound style is INCLUSIVE '[]' with a bare effective_to. '[)' would make
// effective_to exclusive and would let effective_to = effective_from form an
// EMPTY range, which never overlaps and would defeat the constraint.
//
// `rateAmount` is numeric(12,2), which the postgres driver returns as a
// STRING. Keep it a string across every module boundary — parsing to a float
// for display is the UI's job and must never round-trip back into the column.
export const userPayPeriods = pgTable(
  "user_pay_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    contractType: contractTypeEnum("contract_type").notNull(),
    rateAmount: numeric("rate_amount", { precision: 12, scale: 2 }).notNull(),
    rateCurrency: char("rate_currency", { length: 3 }).notNull(),
    ratePeriod: ratePeriodEnum("rate_period").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("idx_user_pay_periods_user_from").on(t.userId, t.effectiveFrom),
    check(
      "pay_period_dates_ordered",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    check("pay_period_rate_non_negative", sql`${t.rateAmount} >= 0`),
  ]
);

export type UserPayPeriod = typeof userPayPeriods.$inferSelect;
export type NewUserPayPeriod = typeof userPayPeriods.$inferInsert;

// ─── User Payment Details (tier 3) ───────────────────────────────────
// 1:1. Super-admin only, read AND write.
//
// The bank account identifier and the tax ID are encrypted app-side with
// AES-256-GCM (src/lib/crypto/pii.ts) because Supabase has no per-column
// encryption and this repo has already shipped one SQL-injection read bug.
// Accepted cost: these two fields can never be searched or sorted.
//
// The `last4` columns are PLAINTEXT on purpose so the masked display
// (••••4821) never needs to decrypt — decryption happens only on an explicit,
// audited POST to the reveal route. `keyVersion` exists so the key can be
// rotated without a schema change.
//
// Ciphertext must NEVER reach the browser. A route test asserts no response
// body contains a `*_ciphertext` key.
export const userPaymentDetails = pgTable("user_payment_details", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paymentMethod: paymentMethodEnum("payment_method"),
  paymentCadence: paymentCadenceEnum("payment_cadence"),
  invoicesRequired: boolean("invoices_required").notNull().default(false),
  payeeName: varchar("payee_name", { length: 200 }),
  bankName: varchar("bank_name", { length: 120 }),
  bankCountry: char("bank_country", { length: 2 }),
  accountIdentifierCiphertext: text("account_identifier_ciphertext"),
  accountIdentifierLast4: varchar("account_identifier_last4", { length: 4 }),
  taxIdCiphertext: text("tax_id_ciphertext"),
  taxIdLast4: varchar("tax_id_last4", { length: 4 }),
  /**
   * Wise receive-QR at rest: AES-GCM ciphertext (same format as account /
   * tax identifiers). Legacy plaintext data URLs may still exist until the
   * next save. Null when not Wise / cleared.
   */
  wiseQrUrl: text("wise_qr_url"),
  keyVersion: smallint("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type UserPaymentDetail = typeof userPaymentDetails.$inferSelect;
export type NewUserPaymentDetail = typeof userPaymentDetails.$inferInsert;

// ─── Attributes Master (canonical registry) ──────────────────────────
// Existing Supabase table (1,179 rows, 94 cols). Quoted CamelCase names.
// First-wins canonical: immutable after seed via uploads; admin promote
// is the only post-seed mutation path. See docs/superpowers/specs/
// 2026-05-26-attributes-category-first-design.md.
//
// Live column is `Attributes_source`. The JS identifier `attibutesSource`
// keeps the historical typo to avoid a wider rename — call sites are unaffected.

export const attributesMaster = pgTable("attributes_master", {
  uuid: uuid("UUID").primaryKey(),
  attributesHubLabel: text("Attributes_HubLabel"),
  attributesReferenceGroup: text("Attributes_ReferenceGroup"),
  attributesReferenceSubgroup: text("Attributes_ReferenceSubgroup"),
  attributesDescription: text("Attributes_Description"),
  attributesClrLabel: text("Attributes_CLRLabel"),
  attributesAlrLabel: text("Attributes_ALRLabel"),
  attributesRequirement: text("Attributes_Requirement"),
  attibutesSource: text("Attributes_source"),
  attributesFormat: text("Attributes_format"),
  pgAttributesType: text("PG_Attributes_Type"),
  bqAttributesType: text("BQ_Attributes_Type"),
  attributesValidValues: text("Attributes_ValidValues"),
  attributesPdpCardName: text("Attributes_PDPCardName"),
  attributesPdpSubcardName: text("Attributes_PDPSubcardName"),
  attributesPdpCardOrder: text("Attributes_PDPCardOrder"),
  attributesPdpSubcardOrder: text("Attributes_PDPSubcardOrder"),
  attributesClientSummaryCardName: text("Attributes_ClientSummaryCardName"),
  attributesClientSummaryCardOrder: text("Attributes_ClientSummaryCardOrder"),
  // ~80 table-presence pivot columns intentionally omitted from the Drizzle
  // type; they are read raw via sql`` when needed. Out of scope for this phase.
});

export type AttributeMaster = typeof attributesMaster.$inferSelect;
export type NewAttributeMaster = typeof attributesMaster.$inferInsert;

// ─── Attribute Category Index ────────────────────────────────────────
// One row per (product_type, marketplace_id, attribute_uuid).
// Drives the category-first list at /admin/attributes.

export const attributeCategoryIndex = pgTable(
  "attribute_category_index",
  {
    productType: text("product_type").notNull(),
    marketplaceId: text("marketplace_id").notNull(),
    attributeUuid: uuid("attribute_uuid")
      .notNull()
      .references(() => attributesMaster.uuid, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    firstSeenClientIdCode: text("first_seen_client_id_code").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productType, t.marketplaceId, t.attributeUuid] }),
    index("idx_aci_attr").on(t.attributeUuid),
    index("idx_aci_category").on(t.productType, t.marketplaceId),
  ]
);

export type AttributeCategoryIndex = typeof attributeCategoryIndex.$inferSelect;
export type NewAttributeCategoryIndex = typeof attributeCategoryIndex.$inferInsert;

// ─── Attribute Client Provenance ─────────────────────────────────────
// One row per (attribute_uuid, client_id_code, product_type, marketplace_id).
// NULL client_* cols = matches canonical. Non-NULL = divergence.

export const attributeClientProvenance = pgTable(
  "attribute_client_provenance",
  {
    attributeUuid: uuid("attribute_uuid")
      .notNull()
      .references(() => attributesMaster.uuid, { onDelete: "cascade" }),
    clientIdCode: text("client_id_code").notNull(),
    productType: text("product_type").notNull(),
    marketplaceId: text("marketplace_id").notNull(),
    sourceUploadId: integer("source_upload_id")
      .notNull()
      .references(() => categoryDefinitions.id, { onDelete: "cascade" }),
    firstUploadedAt: timestamp("first_uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUploadedAt: timestamp("last_uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    clientRequirement: text("client_requirement"),
    clientValidValues: jsonb("client_valid_values").$type<string[] | null>(),
    clientDescription: text("client_description"),
  },
  (t) => [
    primaryKey({
      columns: [t.attributeUuid, t.clientIdCode, t.productType, t.marketplaceId],
    }),
    index("idx_acp_client").on(t.clientIdCode),
    index("idx_acp_category").on(t.productType, t.marketplaceId),
  ]
);

export type AttributeClientProvenance = typeof attributeClientProvenance.$inferSelect;
export type NewAttributeClientProvenance = typeof attributeClientProvenance.$inferInsert;

// ─── Monthly Reports ──────────────────────────────────────────────────
// One row per (client, YYYY-MM). JSON is the generate payload; Drive URLs
// are the internal archive. Status starts at `generated` and later slices
// walk pm_review → am_review → jake_review → ready → sent.

export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("generated"),
    report: jsonb("report"),
    skipped: jsonb("skipped").$type<string[]>().default([]),
    driveUrl: text("drive_url"),
    htmlUrl: text("html_url"),
    dataThrough: date("data_through"),
    reviewNote: text("review_note"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentTo: jsonb("sent_to").$type<string[]>().default([]),
    emailHtml: text("email_html"),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    sendError: text("send_error"),
    resendEmailId: varchar("resend_email_id", { length: 80 }),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_monthly_reports_client_period").on(t.clientIdCode, t.period),
    index("idx_monthly_reports_period").on(t.period),
    index("idx_monthly_reports_status").on(t.status),
  ],
);

export type MonthlyReportRow = typeof monthlyReports.$inferSelect;
export type NewMonthlyReportRow = typeof monthlyReports.$inferInsert;

// ─── Monthly report ↔ Asana (Hub creates + drives the period task; see spec 2026-10-07) ───
export type AsanaLinkSubtask = {
  gid: string;
  url: string;
  stage: "pm" | "am" | "ceo";
  email: string;
  name: string;
  dueOn: string; // YYYY-MM-DD
  completed: boolean;
};

export const monthlyReportAsanaLinks = pgTable("monthly_report_asana_links", {
  period: varchar("period", { length: 7 }).primaryKey(),
  parentGid: varchar("parent_gid", { length: 32 }).notNull(),
  parentUrl: text("parent_url").notNull(),
  parentCompleted: boolean("parent_completed").notNull().default(false),
  subtasks: jsonb("subtasks").$type<AsanaLinkSubtask[]>().notNull().default([]),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monthlyReportGenerateFailures = pgTable(
  "monthly_report_generate_failures",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clientIdCode, t.period] })],
);

// Short lease per period so ensure/sync never interleave; a row, not a held connection.
export const monthlyReportAsanaLocks = pgTable("monthly_report_asana_locks", {
  period: varchar("period", { length: 7 }).primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
  owner: text("owner").notNull(),
});

// Encrypted OAuth state; HELIUM10_CONNECTION_OWNER_ID selects the shared Hub connection.
export const helium10Connections = pgTable("helium10_connections", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Shared team logins (Helium 10, ExpressVPN, Claude, etc.).
// Password is AES-256-GCM ciphertext. List routes never return it —
// only the audited reveal endpoint decrypts. Usernames, plans, activation
// codes, subscription IDs, user limits, and notes stay plaintext so they
// remain on the card.
export const sharedLogins = pgTable(
  "shared_logins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    category: varchar("category", { length: 40 }).notNull().default("other"),
    url: text("url"),
    username: varchar("username", { length: 255 }),
    usernames: jsonb("usernames").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    activationCode: varchar("activation_code", { length: 255 }),
    subscriptionId: varchar("subscription_id", { length: 255 }),
    subscriptionIds: jsonb("subscription_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    userLimit: integer("user_limit"),
    subscriptions: jsonb("subscriptions")
      .$type<
        {
          username: string;
          subscriptions: {
            subscriptionId: string;
            plan: string | null;
            activationCode: string | null;
            userLimit: number | null;
            assignedUsers: { userId: string; enabled: boolean }[];
          }[];
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    secretCiphertext: text("secret_ciphertext"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_shared_logins_category").on(t.category),
    index("idx_shared_logins_name").on(t.name),
  ]
);

export type SharedLoginRow = typeof sharedLogins.$inferSelect;
export type NewSharedLoginRow = typeof sharedLogins.$inferInsert;

export const sharedLoginUsers = pgTable(
  "shared_login_users",
  {
    loginId: uuid("login_id")
      .notNull()
      .references(() => sharedLogins.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.loginId, t.userId] }),
    index("idx_shared_login_users_user").on(t.userId),
  ]
);

export type SharedLoginUserRow = typeof sharedLoginUsers.$inferSelect;

// ─── Q4 holiday deal planning (PBDD / BFCM) ──────────────────────────
// src/lib/holiday-deals/calendar.ts (Amazon Services email, Jul 7 2026).
export const holidayDealPlans = pgTable(
  "holiday_deal_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productId: uuid("product_id").references(() => master.id, {
      onDelete: "set null",
    }),
    asin: varchar("asin", { length: 20 }),
    sku: varchar("sku", { length: 100 }),
    itemName: text("item_name"),
    event: varchar("event", { length: 32 }).notNull(),
    dealType: varchar("deal_type", { length: 40 }),
    discountPercent: numeric("discount_percent", { precision: 6, scale: 2 }),
    promoPrice: numeric("promo_price", { precision: 12, scale: 2 }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    adBudget: numeric("ad_budget", { precision: 12, scale: 2 }),
    estimatedUnits: integer("estimated_units"),
    inboundMethod: varchar("inbound_method", { length: 32 })
      .notNull()
      .default("fba_optimized"),
    submissionStatus: varchar("submission_status", { length: 32 })
      .notNull()
      .default("not_started"),
    inboundStatus: varchar("inbound_status", { length: 32 })
      .notNull()
      .default("not_planned"),
    submittedAt: date("submitted_at"),
    clientTalked: boolean("client_talked").notNull().default(false),
    clientTalkedAt: date("client_talked_at"),
    clientAgreement: varchar("client_agreement", { length: 32 })
      .notNull()
      .default("unset"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_holiday_deal_plans_client").on(t.clientIdCode),
    index("idx_holiday_deal_plans_event").on(t.event),
    index("idx_holiday_deal_plans_status").on(t.submissionStatus),
    uniqueIndex("uq_holiday_deal_plans_client_event_asin")
      .on(t.clientIdCode, t.event, t.asin)
      .where(sql`${t.asin} is not null`),
    uniqueIndex("uq_holiday_deal_plans_client_event_sku")
      .on(t.clientIdCode, t.event, t.sku)
      .where(sql`${t.asin} is null and ${t.sku} is not null`),
  ]
);

export type HolidayDealPlanRow = typeof holidayDealPlans.$inferSelect;
export type NewHolidayDealPlanRow = typeof holidayDealPlans.$inferInsert;

// ── Order Geography snapshot ────────────────────────────────────────────────
// Local mirror of Seller Central order lines, because the Redshift source is
// an untunable external datashare where a 365-day COUNT(*) alone costs ~72s.
// See drizzle/migrations/0113_order_geography_snapshot.sql for the full
// rationale. Grain: one row per (order, ship-to, ASIN) so distinct order
// counts stay exact at every rollup grain.

export const orderGeographyLines = pgTable(
  "order_geography_lines",
  {
    accountId: varchar("account_id", { length: 64 }).notNull(),
    orderId: varchar("order_id", { length: 64 }).notNull(),
    purchaseDay: date("purchase_day").notNull(),
    shipState: varchar("ship_state", { length: 64 }),
    shipCity: varchar("ship_city", { length: 128 }),
    shipCountry: varchar("ship_country", { length: 8 }).notNull().default("US"),
    asin: varchar("asin", { length: 32 }).notNull(),
    units: integer("units").notNull().default(0),
    revenue: numeric("revenue", { precision: 14, scale: 2 }).notNull().default("0"),
    promo: numeric("promo", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (table) => [index("order_geography_lines_account_day_idx").on(table.accountId, table.purchaseDay)],
);

export const orderGeographySnapshots = pgTable("order_geography_snapshots", {
  accountId: varchar("account_id", { length: 64 }).primaryKey(),
  coveredStart: date("covered_start").notNull(),
  coveredEnd: date("covered_end").notNull(),
  lineCount: integer("line_count").notNull().default(0),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderGeographyLineRow = typeof orderGeographyLines.$inferSelect;
export type NewOrderGeographyLineRow = typeof orderGeographyLines.$inferInsert;
export type OrderGeographySnapshotRow = typeof orderGeographySnapshots.$inferSelect;

// ─── Fulfillment centers ────────────────────────────────────────────
// Amazon facility directory (US + Canada) that places FC codes on the FBA
// inventory map. Seeded from AMZ Prep's "Amazon FBA Locations 2025" list by
// scripts/_import-fulfillment-centers.ts. `region` is the state/province parsed
// from the ADDRESS (the sheet's own state column is wrong in ~11 rows).
// lat/lon are NULL until geocoded; the map falls back to FC_METROS for points.
export const fulfillmentCenters = pgTable(
  "fulfillment_centers",
  {
    code: varchar("code", { length: 16 }).primaryKey(),
    country: char("country", { length: 2 }).notNull(),
    region: char("region", { length: 2 }).notNull(),
    city: text("city"),
    postalCode: varchar("postal_code", { length: 16 }),
    address: text("address"),
    facilityType: text("facility_type"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    source: text("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fulfillment_centers_country_region_idx").on(t.country, t.region)],
);

export type FulfillmentCenterRow = typeof fulfillmentCenters.$inferSelect;

// ─── Product Reviews ────────────────────────────────────────────────
// Amazon customer reviews for Hub products, keyed by ASIN so every section
// (SEO S3, A+ QA, portal, reports) reads one store instead of re-scraping.
//
// Two channels feed it:
//   - Individual review text: Rainforest `type=reviews` (primary scraper),
//     Firecrawl product-page extraction (fallback), CSV upload (manual).
//   - Amazon Customer Feedback topic analysis + rating history: the shared
//     Helium 10 MCP connection (`get_asin_review_analysis`,
//     `get_asin_reviews_history`). Amazon refreshes topics weekly.
//
// `product_reviews` is append/upsert by (asin, external_id): re-syncs never
// duplicate a review and never drop one Amazon stopped serving.

export type ReviewTopicSubtopic = { name: string; mentions: number; occurrencePct: number };
export type ReviewTopic = {
  topic: string;
  mentions: number;
  occurrencePct: number;
  starImpact: number | null;
  snippets: string[];
  subtopics: ReviewTopicSubtopic[];
  parent: { mentions: number; occurrencePct: number; starImpact: number | null } | null;
  category: { occurrencePct: number | null; starImpact: number | null } | null;
};
export type ReviewTopicTrendPoint = { start: string; end: string; asinPct: number; parentPct: number | null; categoryPct: number | null };
export type ReviewTopicTrend = { topic: string; points: ReviewTopicTrendPoint[] };
export type ReviewRatingBreakdown = Record<"five_star" | "four_star" | "three_star" | "two_star" | "one_star", { count: number; percentage: number }>;

export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    asin: varchar("asin", { length: 20 }).notNull(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    marketplace: varchar("marketplace", { length: 10 }).notNull().default("US"),
    /** rainforest | firecrawl | csv | manual */
    source: varchar("source", { length: 20 }).notNull(),
    /** Amazon review id (R...), or a content hash when the source has none. */
    externalId: varchar("external_id", { length: 100 }).notNull(),
    title: text("title"),
    body: text("body"),
    rating: smallint("rating"),
    reviewerName: varchar("reviewer_name", { length: 255 }),
    reviewDate: date("review_date"),
    reviewDateRaw: varchar("review_date_raw", { length: 100 }),
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),
    isVine: boolean("is_vine").notNull().default(false),
    helpfulVotes: integer("helpful_votes").notNull().default(0),
    /** Flattened variant attributes, e.g. "Size: 5 lb | Color: Black". */
    variation: text("variation"),
    images: jsonb("images").$type<string[]>(),
    reviewCountry: varchar("review_country", { length: 10 }),
    link: text("link"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    // Optional AI enrichment (filled by the SEO S3 analysis when run).
    sentiment: varchar("sentiment", { length: 20 }),
    keyThemes: text("key_themes"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_product_reviews_asin_external").on(table.asin, table.externalId),
    index("idx_product_reviews_asin").on(table.asin),
    index("idx_product_reviews_client").on(table.clientIdCode),
    index("idx_product_reviews_date").on(table.reviewDate),
    index("idx_product_reviews_rating").on(table.rating),
  ],
);

// One row per ASIN: Amazon-level rating summary plus sync bookkeeping, so the
// UI can show "4.6 ★ · 15,686 ratings · synced 2h ago" without touching the
// review rows, and the cron can pick the stalest ASINs first.
export const reviewAsinStatus = pgTable(
  "review_asin_status",
  {
    asin: varchar("asin", { length: 20 }).primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    marketplace: varchar("marketplace", { length: 10 }).notNull().default("US"),
    itemName: text("item_name"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    ratingsTotal: integer("ratings_total"),
    reviewsTotal: integer("reviews_total"),
    ratingBreakdown: jsonb("rating_breakdown").$type<ReviewRatingBreakdown>(),
    storedReviews: integer("stored_reviews").notNull().default(0),
    lastReviewsFetchAt: timestamp("last_reviews_fetch_at", { withTimezone: true }),
    lastTopicsFetchAt: timestamp("last_topics_fetch_at", { withTimezone: true }),
    lastHistoryFetchAt: timestamp("last_history_fetch_at", { withTimezone: true }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_review_asin_status_client").on(table.clientIdCode)],
);

// Amazon Customer Feedback topic analysis per ASIN (via Helium 10 MCP).
// Snapshots are kept, not replaced, so theme drift is visible over time.
export const reviewTopicSnapshots = pgTable(
  "review_topic_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    asin: varchar("asin", { length: 20 }).notNull(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    marketplace: varchar("marketplace", { length: 10 }).notNull().default("US"),
    source: varchar("source", { length: 20 }).notNull().default("helium10"),
    itemName: text("item_name"),
    rangeStart: date("range_start"),
    rangeEnd: date("range_end"),
    positiveTopics: jsonb("positive_topics").$type<ReviewTopic[]>().notNull().default([]),
    negativeTopics: jsonb("negative_topics").$type<ReviewTopic[]>().notNull().default([]),
    trends: jsonb("trends").$type<{ positive: ReviewTopicTrend[]; negative: ReviewTopicTrend[] }>(),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_review_topic_snapshots_asin_fetched").on(table.asin, table.fetchedAt),
    index("idx_review_topic_snapshots_client").on(table.clientIdCode),
  ],
);

// Daily review count + rating per ASIN (Helium 10 `get_asin_reviews_history`).
export const reviewRatingHistory = pgTable(
  "review_rating_history",
  {
    asin: varchar("asin", { length: 20 }).notNull(),
    day: date("day").notNull(),
    reviewCount: integer("review_count"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    source: varchar("source", { length: 20 }).notNull().default("helium10"),
  },
  (table) => [primaryKey({ columns: [table.asin, table.day] })],
);

export type ReviewSyncError = { asin: string; provider: string; message: string };
export const reviewSyncRuns = pgTable(
  "review_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    /** manual | cron */
    trigger: varchar("trigger", { length: 20 }).notNull().default("manual"),
    triggeredBy: varchar("triggered_by", { length: 255 }),
    /** running | completed | failed */
    status: varchar("status", { length: 20 }).notNull().default("running"),
    providers: jsonb("providers").$type<string[]>().notNull().default([]),
    asinsTotal: integer("asins_total").notNull().default(0),
    asinsDone: integer("asins_done").notNull().default(0),
    asinsFailed: integer("asins_failed").notNull().default(0),
    reviewsAdded: integer("reviews_added").notNull().default(0),
    topicsRefreshed: integer("topics_refreshed").notNull().default(0),
    errors: jsonb("errors").$type<ReviewSyncError[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_review_sync_runs_client_started").on(table.clientIdCode, table.startedAt)],
);

export type ProductReview = typeof productReviews.$inferSelect;
export type NewProductReview = typeof productReviews.$inferInsert;
export type ReviewAsinStatus = typeof reviewAsinStatus.$inferSelect;
export type ReviewTopicSnapshot = typeof reviewTopicSnapshots.$inferSelect;
export type ReviewSyncRun = typeof reviewSyncRuns.$inferSelect;

// ─── Team member dashboard: Asana task mirror (read-only copy of project 1216052535915202) ───
export const asanaTasks = pgTable(
  "asana_tasks",
  {
    gid: varchar("gid", { length: 32 }).primaryKey(),
    name: text("name").notNull(),
    assigneeEmail: varchar("assignee_email", { length: 255 }),
    assigneeName: varchar("assignee_name", { length: 255 }),
    dueOn: date("due_on", { mode: "string" }),
    completed: boolean("completed").notNull().default(false),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    originProjectName: text("origin_project_name"),
    taskStatus: varchar("task_status", { length: 100 }),
    priority: varchar("priority", { length: 100 }),
    permalinkUrl: text("permalink_url").notNull(),
    asanaModifiedAt: timestamp("asana_modified_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    // ── 1o8 time tracking (0136) ──
    // "1o8 Internal ID" custom field (INT-8132) → Project Number MSN08132.
    internalId: varchar("internal_id", { length: 40 }),
    // Department tags from 1o8 team projects ("1o8 | Internal Paid Media Team" → "Paid Media").
    serviceTags: text("service_tags").array().notNull().default([]),
    projectNames: text("project_names").array().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // "Go Live Date" custom field (0137): when an email task is sent.
    goLiveDate: date("go_live_date", { mode: "string" }),
  },
  (t) => [index("idx_asana_tasks_client").on(t.clientIdCode), index("idx_asana_tasks_go_live").on(t.goLiveDate)]
);

export const asanaSyncState = pgTable("asana_sync_state", {
  id: integer("id").primaryKey().default(1),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  openCount: integer("open_count"),
});

export type AsanaTaskDbRow = typeof asanaTasks.$inferSelect;

// ─── Client Brand Voice (0133) ───────────────────────────────────────
// One row per client: the brand voice + SEO writing context that the 1o8
// SEO blog tool (seo-writer) keeps per client in brand.md / keywords.md /
// product-facts.md / internal-links.md. Field shapes and validation live in
// src/lib/brand-voice/types.ts (brandVoiceSchema). Soft reference to
// aac.client_id_code, like every other client_* table.
export const clientBrandVoice = pgTable(
  "client_brand_voice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    blogUrl: text("blog_url").notNull().default(""),
    platform: text("platform").notNull().default(""),
    valueProp: text("value_prop").notNull().default(""),
    whyExists: text("why_exists").notNull().default(""),
    tone: text("tone").notNull().default(""),
    personality: text("personality").array().notNull().default([]),
    audience: jsonb("audience")
      .$type<{ floor: string; middle: string; ceiling: string }>()
      .notNull()
      .default({ floor: "", middle: "", ceiling: "" }),
    voiceExamples: jsonb("voice_examples").$type<{ offBrand: string; onBrand: string }[]>().notNull().default([]),
    signaturePhrases: text("signature_phrases").array().notNull().default([]),
    bannedPhrases: text("banned_phrases").array().notNull().default([]),
    competitors: jsonb("competitors").$type<{ name: string; url: string }[]>().notNull().default([]),
    referencePosts: text("reference_posts").array().notNull().default([]),
    keywords: jsonb("keywords")
      .$type<{ keyword: string; volume: number | null; kd: number | null; intent: string; priority: string }[]>()
      .notNull()
      .default([]),
    productFacts: text("product_facts").notNull().default(""),
    productFactsScannedUrls: text("product_facts_scanned_urls").array().notNull().default([]),
    internalLinks: jsonb("internal_links").$type<{ title: string; url: string; keyword: string }[]>().notNull().default([]),
    // "hub" when edited here; "seo-writer:<slug>" when imported from the blog tool.
    source: varchar("source", { length: 120 }).notNull().default("hub"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_client_brand_voice_client").on(t.clientIdCode)]
);

export type ClientBrandVoiceRow = typeof clientBrandVoice.$inferSelect;

// ─── Team Directory Profiles (0134) ──────────────────────────────────
// 1o8's employee directory: the non-sensitive "where / when / what" facts the
// 1o8_Performance_Team sheet tracks per person. Tier 0 (visible to every hub
// user, editable by admins), kept off `users` like the other person-data
// tables. Seeded by `npm run sync:team`; afterwards the hub is the source of
// truth (admins add people here, and remove them by setting
// users.employment_status = 'alumni').
export const teamDirectoryProfiles = pgTable("team_directory_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  company: varchar("company", { length: 120 }),
  expertise: varchar("expertise", { length: 120 }),
  // "Full Time Employee" | "Independent Contractor" | "Owner" | "CEO" … (free text, as in the sheet)
  employmentType: varchar("employment_type", { length: 80 }),
  location: varchar("location", { length: 160 }),
  // Display label from the sheet, e.g. "CST (UTC-6)", "PHT (UTC+8)".
  timeZone: varchar("time_zone", { length: 60 }),
  // Lower-case weekday keys the person works: ["mon","tue","wed","thu","fri"].
  workDays: text("work_days").array().notNull().default([]),
  workStartLocal: varchar("work_start_local", { length: 12 }),
  workEndLocal: varchar("work_end_local", { length: 12 }),
  workStartChicago: varchar("work_start_chicago", { length: 12 }),
  workEndChicago: varchar("work_end_chicago", { length: 12 }),
  // "sheet" = last written by the team-sheet sync; "hub" = added/edited in the hub.
  source: varchar("source", { length: 20 }).notNull().default("hub"),
  sheetSyncedAt: timestamp("sheet_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamDirectoryProfile = typeof teamDirectoryProfiles.$inferSelect;

// ─── Org Chart Positions (0135) ──────────────────────────────────────
// 1o8's org chart as SEATS, mirroring the "2026 Org Chart" sheet tab: a seat
// has a title, the seat it reports to, and the person in it — or nobody
// ("Open"). Sibling seats with the same title under the same parent render as
// one group ("Account Managers: Open, Paulina, Alejandro, Open").
// `area` tags the top-level column a seat belongs to (accounts, creative, …).
export const orgPositions = pgTable(
  "org_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),
    area: varchar("area", { length: 40 }),
    parentId: uuid("parent_id").references((): AnyPgColumn => orgPositions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_org_positions_parent").on(t.parentId)]
);

export type OrgPosition = typeof orgPositions.$inferSelect;


// ─── Time Logs (0136) ────────────────────────────────────────────────
// 1o8 time tracking ("Time Tracking 2.0"): decimal hours per day against a
// client, a department / type of work, and a Project Number — CLIENT CODE +
// the 5 digits of the Asana task's 1o8 Internal ID (MSN08132), CODE00000 for
// general account work, or a 1O8 internal code (1O890001 = PTO …). Rules and
// lists live in src/lib/time-logs/catalog.ts. Replaces MF's start/end-time
// `time_entries` tracker for 1o8 (that table is left untouched).
export const timeLogs = pgTable(
  "time_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    department: varchar("department", { length: 60 }).notNull(),
    projectNumber: varchar("project_number", { length: 24 }).notNull(),
    // The Asana task behind the Project Number (null for CODE00000 / internal codes).
    asanaTaskGid: varchar("asana_task_gid", { length: 32 }),
    // Snapshot so reports keep the name even after the task is renamed or archived.
    projectName: text("project_name").notNull(),
    billingType: varchar("billing_type", { length: 40 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_time_logs_user_date").on(t.userId, t.entryDate),
    index("idx_time_logs_client_date").on(t.clientIdCode, t.entryDate),
    check("time_logs_hours_check", sql`${t.hours} > 0 AND ${t.hours} <= 24`),
  ]
);

export type TimeLog = typeof timeLogs.$inferSelect;

// ─── Holiday Calendar Settings (0138) ────────────────────────────────
// Per-country switch admins flip in the Content Calendar: a hidden calendar's
// holidays disappear from the general calendar for everyone. Visibility only —
// it never changes the time-off maths of people assigned to that calendar
// (users.country_code / getHolidayDates). A country with no row is visible.
export const holidayCalendarSettings = pgTable("holiday_calendar_settings", {
  countryCode: char("country_code", { length: 2 }).primaryKey(),
  visible: boolean("visible").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Readiness (0139) ────────────────────────────────────────────────
// Live "Readiness" board (the 1o8 Agency Dashboard sheet's Readiness tab):
// open / due-today / overdue Asana tasks per person and department, with a
// daily morning snapshot for comparisons over time.

// ─── Service Providers (0140) ────────────────────────────────────────
// Agencies and freelancers 1o8 contracts (e.g. WODO for web dev) who are NOT
// employees: they never appear in the team directory, org chart or people
// pickers, but their Asana work counts on the Readiness board, tagged as a
// provider. Managed by admins in Admin → Service providers.
export const serviceProviders = pgTable("service_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  // "agency" | "freelancer"
  kind: varchar("kind", { length: 20 }).notNull().default("agency"),
  contactName: varchar("contact_name", { length: 255 }),
  // Readiness department label they work for (AM, Creative, Email, Paid, Web, Ops).
  department: varchar("department", { length: 40 }),
  services: text("services"),
  // Emails they use (incl. their Asana login) — how Asana tasks are matched to them.
  emails: text("emails").array().notNull().default([]),
  website: text("website"),
  location: varchar("location", { length: 160 }),
  timeZone: varchar("time_zone", { length: 60 }),
  // "active" | "inactive"
  status: varchar("status", { length: 20 }).notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProvider = typeof serviceProviders.$inferSelect;

// Asana assignee → team member / department / excluded. Keyed by the
// assignee's lower-cased email (or name when Asana has no email). Seeded from
// the sheet's Department + Exclude columns; admins edit it on the board.
export const asanaAssigneeMap = pgTable("asana_assignee_map", {
  assigneeKey: varchar("assignee_key", { length: 255 }).primaryKey(),
  assigneeName: varchar("assignee_name", { length: 255 }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Set instead of userId when the assignee is a contracted service provider (0140).
  providerId: uuid("provider_id").references(() => serviceProviders.id, { onDelete: "set null" }),
  // Readiness department label (AM, Creative, Email, Paid, Web …); null = derive from the person's departments.
  department: varchar("department", { length: 40 }),
  // Client contacts and other non-team assignees don't count toward readiness.
  excluded: boolean("excluded").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readinessSnapshots = pgTable(
  "readiness_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    // "total" | "department" | "person"
    scope: varchar("scope", { length: 20 }).notNull(),
    // "all" | department label | assignee key
    key: varchar("key", { length: 255 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    department: varchar("department", { length: 40 }),
    userId: uuid("user_id"),
    providerId: uuid("provider_id"),
    open: integer("open").notNull(),
    dueToday: integer("due_today").notNull(),
    overdue: integer("overdue").notNull(),
  },
  (t) => [
    unique("uq_readiness_snapshot").on(t.snapshotDate, t.scope, t.key),
    index("idx_readiness_snapshot_date").on(t.snapshotDate),
  ]
);

export type ReadinessSnapshot = typeof readinessSnapshots.$inferSelect;

// ─── AAC sheet two-way sync (0141) ───────────────────────────────────
// Last value the hub and the "AAC 1o8" sheet agreed on, per client and column
// key, so a sync knows which side changed (see src/lib/aac-sync/merge.ts).
export const aacSheetBaseline = pgTable("aac_sheet_baseline", {
  clientIdCode: varchar("client_id_code", { length: 100 }).primaryKey(),
  values: jsonb("values").$type<Record<string, string>>().notNull().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per sync run (manual, sheet edit hook, hub edit, daily), with what it changed.
export const aacSyncRuns = pgTable("aac_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: varchar("trigger", { length: 40 }).notNull(),
  dryRun: boolean("dry_run").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  report: jsonb("report").$type<Record<string, unknown>>(),
  error: text("error"),
});

/** PTO / sick balances per person and policy, as last read from Gusto. */
export const timeOffBalances = pgTable(
  "time_off_balances",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyName: text("policy_name").notNull(),
    policyType: varchar("policy_type", { length: 20 }),
    balanceHours: numeric("balance_hours", { precision: 8, scale: 2 }),
    source: varchar("source", { length: 10 }).notNull().default("gusto"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.policyName] })],
);

/**
 * Events people put straight on the shared "1o8 Time off (PTO/OOO/Sick)"
 * Google Calendar (not the ones the hub publishes there), cached for the hub
 * calendar and the who's out view.
 */
export const teamCalendarEvents = pgTable(
  "team_calendar_events",
  {
    googleEventId: text("google_event_id").primaryKey(),
    summary: text("summary").notNull(),
    allDay: boolean("all_day").notNull(),
    /** Inclusive local dates the event covers. */
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Exact times for part-day events. */
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    timeZone: text("time_zone"),
    creatorEmail: text("creator_email"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_team_calendar_range").on(t.startDate, t.endDate)],
);

/** OAuth tokens for company-level integrations (Gusto), sealed at rest. */
export const integrationTokens = pgTable("integration_tokens", {
  provider: varchar("provider", { length: 40 }).primaryKey(),
  sealed: text("sealed").notNull(),
  keyVersion: integer("key_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Time off sync runs (Gusto import, shared calendar push/pull). */
export const timeOffSyncRuns = pgTable("time_off_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: varchar("trigger", { length: 40 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  report: jsonb("report").$type<Record<string, unknown>>(),
  error: text("error"),
});

/**
 * Daily KPI inputs per client and source (GA4 now; Shopify, Meta, Klaviyo
 * next): one row per client × source × metric × day. Main KPIs are computed
 * from these (src/lib/kpi/values.ts).
 */
export const kpiDaily = pgTable(
  "kpi_daily",
  {
    clientIdCode: varchar("client_id_code", { length: 20 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    metric: varchar("metric", { length: 60 }).notNull(),
    day: date("day").notNull(),
    value: doublePrecision("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientIdCode, t.source, t.metric, t.day] }),
    index("idx_kpi_daily_client_day").on(t.clientIdCode, t.day),
  ],
);

/** KPI data sync runs (per source pulls into kpi_daily). */
export const kpiSyncRuns = pgTable("kpi_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: varchar("trigger", { length: 40 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  report: jsonb("report").$type<Record<string, unknown>>(),
  error: text("error"),
});
