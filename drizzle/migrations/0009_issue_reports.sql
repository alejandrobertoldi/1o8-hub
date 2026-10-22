-- Issue Reports table
DO $$ BEGIN
  CREATE TYPE issue_report_status AS ENUM ('pending', 'in_review', 'in_progress', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS issue_reports (
  id SERIAL PRIMARY KEY,
  reported_by VARCHAR(255) NOT NULL,
  reported_by_name VARCHAR(255),
  section VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  status issue_report_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports (status);
CREATE INDEX IF NOT EXISTS idx_issue_reports_reported_by ON issue_reports (reported_by);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created ON issue_reports (created_at);
