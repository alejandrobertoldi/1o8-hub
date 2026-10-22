ALTER TABLE shared_logins
  ADD COLUMN IF NOT EXISTS activation_code varchar(255),
  ADD COLUMN IF NOT EXISTS subscription_id varchar(255),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS shared_login_users (
  login_id uuid NOT NULL REFERENCES shared_logins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (login_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_login_users_user ON shared_login_users (user_id);

ALTER TABLE shared_login_users ENABLE ROW LEVEL SECURITY;
