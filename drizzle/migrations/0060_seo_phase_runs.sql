-- drizzle/migrations/0060_seo_phase_runs.sql
-- Per-execution audit log + cost tracking + status machine for the
-- 9-phase SEO pipeline runner.

BEGIN;

CREATE TABLE seo_phase_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  phase varchar(5) NOT NULL,            -- 'S1'..'S9' (plus 'S4P1','S4P2','S4P3')
  status varchar(24) NOT NULL,          -- queued | running | paused_user_input |
                                        -- success | validation_failed | error | cancelled
  trigger varchar(16) NOT NULL,         -- manual | auto_run | cascade_rerun | s9_auto_rerun
  attempt smallint NOT NULL DEFAULT 1,
  parent_run_id uuid REFERENCES seo_phase_runs(id) ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,

  claude_input_tokens integer NOT NULL DEFAULT 0,
  claude_output_tokens integer NOT NULL DEFAULT 0,
  claude_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  claude_model varchar(64),

  output_artifact_version integer,
  validation_errors jsonb DEFAULT '[]'::jsonb,
  error_message text,

  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_phase_runs_project ON seo_phase_runs(project_id);
CREATE INDEX idx_seo_phase_runs_phase ON seo_phase_runs(project_id, phase, started_at DESC);
CREATE INDEX idx_seo_phase_runs_status ON seo_phase_runs(status)
  WHERE status IN ('queued','running','paused_user_input');

COMMIT;
