CREATE TABLE IF NOT EXISTS helium10_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helium10_connections ENABLE ROW LEVEL SECURITY;
-- No public policies: access is through the Hub's server-side database connection.
