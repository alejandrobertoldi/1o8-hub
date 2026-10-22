CREATE TABLE IF NOT EXISTS monthly_report_asana_links (
  period varchar(7) PRIMARY KEY,
  parent_gid varchar(32) NOT NULL,
  parent_url text NOT NULL,
  parent_completed boolean NOT NULL DEFAULT false,
  subtasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_report_generate_failures (
  client_id_code varchar(100) NOT NULL,
  period varchar(7) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id_code, period)
);

CREATE TABLE IF NOT EXISTS monthly_report_asana_locks (
  period varchar(7) PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  owner text NOT NULL
);
