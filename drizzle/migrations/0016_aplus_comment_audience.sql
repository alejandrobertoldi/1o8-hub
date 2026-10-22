-- Add audience + clientIdCode to aplus_comments for client portal review
-- audience: 'internal' (default, team-only) or 'client' (visible to client + team)
-- client_id_code: links client comments to a specific client group

ALTER TABLE "aplus_comments" ADD COLUMN "audience" varchar(10) NOT NULL DEFAULT 'internal';
ALTER TABLE "aplus_comments" ADD COLUMN "client_id_code" varchar(100);
CREATE INDEX "idx_aplus_comments_audience" ON "aplus_comments" ("audience");
CREATE INDEX "idx_aplus_comments_client" ON "aplus_comments" ("client_id_code");
