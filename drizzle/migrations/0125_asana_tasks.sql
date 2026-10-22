CREATE TABLE IF NOT EXISTS asana_tasks (
  gid varchar(32) PRIMARY KEY,
  name text NOT NULL,
  assignee_email varchar(255),
  assignee_name varchar(255),
  due_on date,
  completed boolean NOT NULL DEFAULT false,
  client_id_code varchar(100),
  origin_project_name text,
  task_status varchar(100),
  priority varchar(100),
  permalink_url text NOT NULL,
  asana_modified_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asana_tasks_assignee_open ON asana_tasks (lower(assignee_email)) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_asana_tasks_client ON asana_tasks (client_id_code);

CREATE TABLE IF NOT EXISTS asana_sync_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  open_count integer
);
