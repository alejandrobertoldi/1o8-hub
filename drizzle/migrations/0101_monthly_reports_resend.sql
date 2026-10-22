-- 0101: Resend id for monthly report client letters
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "resend_email_id" varchar(80);
