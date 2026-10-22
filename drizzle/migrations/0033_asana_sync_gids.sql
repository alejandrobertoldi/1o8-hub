-- Add Asana GID columns for bidirectional sync
ALTER TABLE "aac" ADD COLUMN "asana_project_gid" varchar(100);
ALTER TABLE "client_gantt_tasks" ADD COLUMN "asana_task_gid" varchar(100);
