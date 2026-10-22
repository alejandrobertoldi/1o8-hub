-- 0099: send-back note on monthly report review
ALTER TABLE "monthly_reports" ADD COLUMN IF NOT EXISTS "review_note" text;
