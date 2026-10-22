-- Add 'client' to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client';

-- Add client_id_code column to users table (links client users to their AAC client)
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id_code VARCHAR(100);

-- Index for looking up users by client
CREATE INDEX IF NOT EXISTS idx_users_client_id_code ON users(client_id_code);
