-- A+ Content: Comments table
-- Markup.io-style comment threads on A+ module previews.
-- Apply via Supabase SQL editor (NOT drizzle-kit push)

CREATE TYPE "public"."aplus_comment_status" AS ENUM('active', 'resolved');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "aplus_comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "module_id" UUID REFERENCES "aplus_modules"("id") ON DELETE SET NULL,
  "parent_comment_id" UUID,
  "author_email" VARCHAR(255) NOT NULL,
  "author_name" VARCHAR(255),
  "body" TEXT NOT NULL,
  "status" "aplus_comment_status" NOT NULL DEFAULT 'active',
  "pin_x" INT,
  "pin_y" INT,
  "comment_number" INT,
  "resolved_by" VARCHAR(255),
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_comments_product" ON "aplus_comments"("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_comments_module" ON "aplus_comments"("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_comments_status" ON "aplus_comments"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_comments_parent" ON "aplus_comments"("parent_comment_id");
