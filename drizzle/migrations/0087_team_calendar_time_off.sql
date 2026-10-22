CREATE TYPE "public"."time_off_status" AS ENUM('pending', 'approved', 'denied', 'cancelled');
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "time_off_status" DEFAULT 'pending' NOT NULL,
	"working_days" integer NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "time_off_dates_ordered" CHECK ("time_off_requests"."end_date" >= "time_off_requests"."start_date"),
	CONSTRAINT "time_off_reason_not_blank" CHECK (length(btrim("time_off_requests"."reason")) > 0),
	CONSTRAINT "time_off_working_days_non_negative" CHECK ("time_off_requests"."working_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_holidays_unique" UNIQUE("country_code","holiday_date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_code" char(2);
--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_time_off_user_start" ON "time_off_requests" USING btree ("user_id","start_date");
--> statement-breakpoint
CREATE INDEX "idx_time_off_status" ON "time_off_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_time_off_range" ON "time_off_requests" USING btree ("start_date","end_date");
--> statement-breakpoint
CREATE INDEX "idx_public_holidays_date" ON "public_holidays" USING btree ("holiday_date");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "time_off_requests"
  ADD CONSTRAINT "time_off_no_overlap_per_user"
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('pending','approved'));
