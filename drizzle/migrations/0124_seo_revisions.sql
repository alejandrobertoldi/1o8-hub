-- 0124_seo_revisions.sql
--
-- Additive only. SEO content review rounds: frozen revisions, their decision log,
-- per-field comments, and a record of which revision was pushed to which product.
-- Spec: docs/superpowers/specs/2026-10-01-seo-revision-review-design.md

CREATE TABLE IF NOT EXISTS "seo_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "seo_projects"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "content" jsonb NOT NULL,
  "submitted_by_email" varchar(255) NOT NULL,
  "submitted_by_name" varchar(255),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "final_via" varchar(10),
  "final_reason" text,
  "is_current" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revisions_status_check" CHECK ("status" IN ('pm_review', 'am_review', 'client_review', 'approved', 'changes_requested')),
  CONSTRAINT "seo_revisions_final_via_check" CHECK ("final_via" IS NULL OR "final_via" IN ('client', 'am_final'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_project_number" ON "seo_revisions" ("project_id", "revision_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_one_open" ON "seo_revisions" ("project_id") WHERE status IN ('pm_review', 'am_review', 'client_review');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_one_current" ON "seo_revisions" ("project_id") WHERE is_current;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid NOT NULL REFERENCES "seo_revisions"("id") ON DELETE CASCADE,
  "step" varchar(10) NOT NULL,
  "action" varchar(20) NOT NULL,
  "actor_email" varchar(255) NOT NULL,
  "actor_name" varchar(255),
  "acted_as" varchar(10) NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_events_step_check" CHECK ("step" IN ('submit', 'pm', 'am', 'client')),
  CONSTRAINT "seo_revision_events_action_check" CHECK ("action" IN ('submit', 'approve', 'request_changes', 'send_to_client', 'approve_final')),
  CONSTRAINT "seo_revision_events_acted_as_check" CHECK ("acted_as" IN ('assigned', 'override', 'client', 'author'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_events_revision" ON "seo_revision_events" ("revision_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid NOT NULL REFERENCES "seo_revisions"("id") ON DELETE CASCADE,
  "asin" varchar(20) NOT NULL,
  "field_key" varchar(64) NOT NULL,
  "parent_comment_id" uuid REFERENCES "seo_revision_comments"("id") ON DELETE CASCADE,
  "audience" varchar(10) NOT NULL,
  "author_email" varchar(255) NOT NULL,
  "author_name" varchar(255),
  "body" text NOT NULL,
  "resolved_by" varchar(255),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_comments_audience_check" CHECK ("audience" IN ('internal', 'client'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_comments_revision" ON "seo_revision_comments" ("revision_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_pushes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid REFERENCES "seo_revisions"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "seo_projects"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "master"("id") ON DELETE CASCADE,
  "pushed_by" varchar(255) NOT NULL,
  "override_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_pushes_source_check" CHECK ("revision_id" IS NOT NULL OR "override_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_pushes_product" ON "seo_revision_pushes" ("product_id");
