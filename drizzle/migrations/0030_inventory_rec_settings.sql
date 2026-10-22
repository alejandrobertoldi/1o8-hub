CREATE TABLE IF NOT EXISTS "inventory_rec_settings" (
	"client_id_code" varchar(50) PRIMARY KEY NOT NULL,
	"pct_90d" integer DEFAULT 0 NOT NULL,
	"pct_q1" integer DEFAULT 0 NOT NULL,
	"pct_avg" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(255)
);
