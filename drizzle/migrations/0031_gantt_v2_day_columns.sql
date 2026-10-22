-- Add subtask_title, start_day, duration_days to gantt_templates
ALTER TABLE "gantt_templates" ADD COLUMN IF NOT EXISTS "subtask_title" text;
ALTER TABLE "gantt_templates" ADD COLUMN IF NOT EXISTS "start_day" integer NOT NULL DEFAULT 1;
ALTER TABLE "gantt_templates" ADD COLUMN IF NOT EXISTS "duration_days" integer NOT NULL DEFAULT 0;

-- Add subtask_title, start_day, duration_days to client_gantt_tasks
ALTER TABLE "client_gantt_tasks" ADD COLUMN IF NOT EXISTS "subtask_title" text;
ALTER TABLE "client_gantt_tasks" ADD COLUMN IF NOT EXISTS "start_day" integer NOT NULL DEFAULT 1;
ALTER TABLE "client_gantt_tasks" ADD COLUMN IF NOT EXISTS "duration_days" integer NOT NULL DEFAULT 0;

-- Backfill existing client_gantt_tasks from week-based to day-based
UPDATE "client_gantt_tasks"
SET start_day = (week_start - 1) * 7 + 1,
    duration_days = (week_end - week_start + 1) * 7
WHERE start_day = 1 AND duration_days = 0 AND week_start > 0;

-- Backfill existing gantt_templates
UPDATE "gantt_templates"
SET start_day = (week_start - 1) * 7 + 1,
    duration_days = (week_end - week_start + 1) * 7
WHERE start_day = 1 AND duration_days = 0 AND week_start > 0;
