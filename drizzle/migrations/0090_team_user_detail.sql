-- 0090_team_user_detail.sql
--
-- Additive only. Nothing is dropped, renamed or deleted, and the calendar
-- events table is untouched. Hand-written: `npm run db:generate` is unusable
-- on this branch (0084-0088 are absent from _journal.json and it emits huge
-- drift), so the house pattern is one bespoke scripts/_apply-00NN.ts per
-- migration.
--
-- STATEMENT ORDER IS LOAD-BEARING:
--   1. CREATE TYPE x5 — takes no lock on "users" at all.
--   2. ONE combined ALTER on "users" adding all five tier-0 columns,
--      combined into a single statement so the ACCESS EXCLUSIVE lock on
--      "users" is acquired exactly once, and placed before the CREATE
--      TABLEs because each new table's FOREIGN KEY to users(id) takes SHARE
--      ROW EXCLUSIVE — arriving at those first would mean UPGRADING to
--      ACCESS EXCLUSIVE later, and a lock upgrade can deadlock against a
--      concurrent reader. Taking the strongest lock once, first, removes
--      that path.
--      Adding a NOT NULL column with a CONSTANT default does not rewrite the
--      table on PG11+ (the default is stored in pg_attribute.attmissingval), so
--      this is metadata-only and finishes in microseconds once the lock is won.
--   3. The three new tables, their foreign keys, the index and the EXCLUDE.
--
-- The whole file runs as ONE implicit transaction: _apply-0090.ts sends zero
-- bind parameters, which selects the simple query protocol, so a failure at any
-- point rolls back all of it. There is no half-applied state to clean up.

CREATE TYPE "public"."employment_status" AS ENUM('active', 'inactive', 'alumni');
--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('hourly', 'salaried', 'contractor');
--> statement-breakpoint
CREATE TYPE "public"."rate_period" AS ENUM('hour', 'month', 'year');
--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'wise', 'payoneer', 'paypal', 'other');
--> statement-breakpoint
CREATE TYPE "public"."payment_cadence" AS ENUM('monthly', 'biweekly', 'weekly', 'per_invoice');
--> statement-breakpoint
ALTER TABLE "users"
	ADD COLUMN "phone" varchar(40),
	ADD COLUMN "slack_handle" varchar(80),
	ADD COLUMN "job_title" varchar(120),
	ADD COLUMN "start_date" date,
	ADD COLUMN "employment_status" "public"."employment_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"personal_email" varchar(255),
	"address_line1" varchar(200),
	"address_line2" varchar(200),
	"city" varchar(120),
	"postcode" varchar(20),
	"address_country" char(2),
	"date_of_birth" date,
	"emergency_contact_name" varchar(120),
	"emergency_contact_phone" varchar(40),
	"emergency_contact_relation" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"contract_type" "public"."contract_type" NOT NULL,
	"rate_amount" numeric(12, 2) NOT NULL,
	"rate_currency" char(3) NOT NULL,
	"rate_period" "public"."rate_period" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "pay_period_dates_ordered" CHECK ("user_pay_periods"."effective_to" IS NULL OR "user_pay_periods"."effective_to" >= "user_pay_periods"."effective_from"),
	CONSTRAINT "pay_period_rate_non_negative" CHECK ("user_pay_periods"."rate_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_payment_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payment_method" "public"."payment_method",
	"payment_cadence" "public"."payment_cadence",
	"invoices_required" boolean DEFAULT false NOT NULL,
	"payee_name" varchar(200),
	"bank_name" varchar(120),
	"bank_country" char(2),
	"account_identifier_ciphertext" text,
	"account_identifier_last4" varchar(4),
	"tax_id_ciphertext" text,
	"tax_id_last4" varchar(4),
	"key_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_pay_periods" ADD CONSTRAINT "user_pay_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_pay_periods" ADD CONSTRAINT "user_pay_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_payment_details" ADD CONSTRAINT "user_payment_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_payment_details" ADD CONSTRAINT "user_payment_details_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_user_pay_periods_user_from" ON "user_pay_periods" USING btree ("user_id","effective_from");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Ruling F4: '[]' (inclusive) with a BARE effective_to.
--   * An exclusive-upper-bound range would make effective_to exclusive, so
--     "this rate ran until June 30" would stop applying on June 29.
--   * Worse, under an exclusive-upper-bound range a period with
--     effective_to = effective_from — which pay_period_dates_ordered
--     permits — is an EMPTY range, and empty ranges never overlap anything,
--     so a zero-length period would slip straight past the one constraint
--     this design exists for.
--   * A NULL upper bound is natively unbounded in Postgres, so no coalesce
--     wrapper substituting a sentinel maximum date is needed — and under
--     '[]' such a wrapper would ask Postgres to canonicalise an inclusive
--     unbounded upper value.
-- This matches Thread E's time_off_no_overlap_per_user in 0087 exactly.
ALTER TABLE "user_pay_periods"
	ADD CONSTRAINT "user_pay_periods_no_overlap"
	EXCLUDE USING gist (
		user_id WITH =,
		daterange(effective_from, effective_to, '[]') WITH &&
	);
