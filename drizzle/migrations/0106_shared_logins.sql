CREATE TABLE IF NOT EXISTS shared_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  category varchar(40) NOT NULL DEFAULT 'other',
  url text,
  username varchar(255),
  secret_ciphertext text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_logins_category ON shared_logins (category);
CREATE INDEX IF NOT EXISTS idx_shared_logins_name ON shared_logins (name);

ALTER TABLE shared_logins ENABLE ROW LEVEL SECURITY;
-- No public policies: access is through the Hub's server-side database connection.
