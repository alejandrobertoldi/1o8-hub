-- Additive, non-destructive. Run manually against PROD ONLY after explicit approval.
-- Do NOT run via drizzle-migrate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Bootstrap the first super admin (separate approval):
-- UPDATE users SET is_super_admin = true WHERE email = 'amazon.seo@1o8.agency';
