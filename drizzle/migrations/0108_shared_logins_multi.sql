ALTER TABLE shared_logins
  ADD COLUMN IF NOT EXISTS usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subscription_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS user_limit integer;

UPDATE shared_logins
SET usernames = jsonb_build_array(username)
WHERE username IS NOT NULL
  AND btrim(username) <> ''
  AND (usernames IS NULL OR usernames = '[]'::jsonb);

UPDATE shared_logins
SET subscription_ids = jsonb_build_array(subscription_id)
WHERE subscription_id IS NOT NULL
  AND btrim(subscription_id) <> ''
  AND (subscription_ids IS NULL OR subscription_ids = '[]'::jsonb);
