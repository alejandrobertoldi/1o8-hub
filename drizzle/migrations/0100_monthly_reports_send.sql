-- 0100: send log for monthly report client letter
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "sent_to" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "email_html" text;
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "sent_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "send_error" text;
