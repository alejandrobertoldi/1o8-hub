-- Support Tickets: enums + table + indexes

DO $$ BEGIN
  CREATE TYPE "support_ticket_category" AS ENUM ('bug', 'feature_request', 'account_issue', 'billing', 'content', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "support_ticket_priority" AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "support_ticket_status" AS ENUM ('open', 'in_progress', 'waiting', 'escalated', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_number" varchar(20) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "category" "support_ticket_category" DEFAULT 'bug' NOT NULL,
  "priority" "support_ticket_priority" DEFAULT 'medium' NOT NULL,
  "status" "support_ticket_status" DEFAULT 'open' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assigned_to" uuid,
  "reported_by" varchar(255) NOT NULL,
  "reported_by_name" varchar(255),
  "screenshot_url" text,
  "section" varchar(100),
  "escalation_level" integer DEFAULT 0 NOT NULL,
  "sla_deadline" timestamp with time zone,
  "internal_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resolved_by" varchar(255),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk"
    FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_support_tickets_status" ON "support_tickets" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_priority" ON "support_tickets" USING btree ("priority");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_assigned" ON "support_tickets" USING btree ("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_created" ON "support_tickets" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_sla" ON "support_tickets" USING btree ("sla_deadline");

-- Migrate existing issue_reports data
INSERT INTO support_tickets (
  ticket_number, title, description, category, priority, status,
  tags, reported_by, reported_by_name, screenshot_url, section,
  escalation_level, internal_notes, resolved_by, resolved_at,
  created_at, updated_at
)
SELECT
  'SUP-' || LPAD(id::text, 4, '0'),
  LEFT(description, 80),
  description,
  'bug'::support_ticket_category,
  'medium'::support_ticket_priority,
  CASE
    WHEN status IN ('pending', 'in_review') THEN 'open'
    WHEN status = 'in_progress' THEN 'in_progress'
    WHEN status = 'resolved' THEN 'resolved'
    WHEN status = 'closed' THEN 'closed'
    ELSE 'open'
  END::support_ticket_status,
  '[]'::jsonb,
  reported_by,
  reported_by_name,
  screenshot_url,
  section,
  0,
  CASE
    WHEN admin_notes IS NOT NULL AND admin_notes != ''
    THEN jsonb_build_array(jsonb_build_object(
      'author', COALESCE(resolved_by, 'admin'),
      'authorName', NULL::text,
      'text', admin_notes,
      'createdAt', updated_at::text
    ))
    ELSE '[]'::jsonb
  END,
  resolved_by,
  resolved_at,
  created_at,
  updated_at
FROM issue_reports
WHERE NOT EXISTS (SELECT 1 FROM support_tickets LIMIT 1)
ORDER BY id;
