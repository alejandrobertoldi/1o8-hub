-- 0091_payment_wise_qr.sql
--
-- Additive: stores a Wise receive-QR image (data URL or https URL) on
-- user_payment_details. Shown only when payment_method = 'wise'.
-- Hand-applied via scripts/_apply-0091.ts (same pattern as 0090).

ALTER TABLE "user_payment_details"
	ADD COLUMN IF NOT EXISTS "wise_qr_url" text;
