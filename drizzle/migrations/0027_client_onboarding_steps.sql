-- Track onboarding step completion per client.
-- Each row = one step for one client.
CREATE TABLE IF NOT EXISTS client_onboarding_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id_code VARCHAR(100) NOT NULL,
  step_key TEXT NOT NULL,          -- e.g. 'drive_folders', 'sp_api_credentials', ...
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed' | 'failed'
  completed_at TIMESTAMPTZ,
  completed_by TEXT,               -- email of user who completed the step
  metadata JSONB DEFAULT '{}'::jsonb,  -- step-specific data (e.g. folder count, error message)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id_code, step_key)
);

CREATE INDEX idx_onboarding_client ON client_onboarding_steps(client_id_code);
CREATE INDEX idx_onboarding_status ON client_onboarding_steps(status);
