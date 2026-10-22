CREATE TYPE "public"."user_role" AS ENUM('viewer', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE "aac_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id_code" varchar(100) NOT NULL,
	"client_status" varchar(50) NOT NULL,
	"client_name" varchar(255),
	"raw_data" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aac_clients_client_id_code_unique" UNIQUE("client_id_code")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"asin" varchar(20),
	"sku" varchar(100),
	"client_id_code" varchar(50),
	"item_name" text,
	"field_label" varchar(255) NOT NULL,
	"bq_name" varchar(255) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" varchar(255) NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edit_type" varchar(20) DEFAULT 'single' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"asin" varchar(20) NOT NULL,
	"marketplace" varchar(50),
	"normalized_data" jsonb NOT NULL,
	"comparison_result" jsonb,
	"overall_match" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"definition_id" integer NOT NULL,
	"amazon_field_name" varchar(500) NOT NULL,
	"local_label" varchar(255) NOT NULL,
	"group_name" varchar(100) NOT NULL,
	"description" text,
	"example" text,
	"requirement" varchar(30) NOT NULL,
	"valid_values" jsonb,
	"bible_field_match" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id_code" varchar(100) NOT NULL,
	"product_type" varchar(255) NOT NULL,
	"marketplace_id" varchar(50) DEFAULT 'ATVPDKIKX0DER' NOT NULL,
	"total_attributes" integer DEFAULT 0 NOT NULL,
	"required_count" integer DEFAULT 0 NOT NULL,
	"conditional_count" integer DEFAULT 0 NOT NULL,
	"optional_count" integer DEFAULT 0 NOT NULL,
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "column_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_row" integer NOT NULL,
	"general_label" varchar(255) NOT NULL,
	"specific_label" text,
	"bigquery_label" text,
	"bq_data_type" varchar(20) DEFAULT 'STRING',
	"label_details" text,
	"label_max_options" varchar(10),
	"reference_group" varchar(100) NOT NULL,
	"subgroup" varchar(100) DEFAULT '',
	"is_essential" boolean DEFAULT false NOT NULL,
	"client_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "column_attributes_general_label_unique" UNIQUE("general_label")
);
--> statement-breakpoint
CREATE TABLE "field_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"bq_name" varchar(255) NOT NULL,
	"comment" text NOT NULL,
	"author" varchar(255) NOT NULL,
	"author_name" varchar(255),
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" varchar(255),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asin" varchar(20),
	"sku" varchar(100),
	"client_id_code" varchar(100),
	"marketplace" varchar(50),
	"country" varchar(10),
	"status" varchar(50),
	"parentage_level" varchar(20),
	"parent_sku" varchar(100),
	"parent_asin" varchar(20),
	"brand_name" varchar(255),
	"item_name" text,
	"summarized_title" text,
	"product_type" varchar(255),
	"list_price" varchar(50),
	"cost_price" varchar(50),
	"main_image_url" text,
	"item_type_keyword" varchar(255),
	"feed_product_type" varchar(255),
	"recommended_browse_nodes" text,
	"generic_keywords" text,
	"platinum_keywords" text,
	"content_seo" jsonb,
	"variations" jsonb,
	"packaging" jsonb,
	"target_audience" jsonb,
	"fulfillment" jsonb,
	"product_attributes" jsonb,
	"nutrition_supplements" jsonb,
	"compliance_safety" jsonb,
	"images" jsonb,
	"dimensions_weight" jsonb,
	"other_attributes" jsonb,
	"raw_column_values" jsonb,
	"is_dirty" boolean DEFAULT false NOT NULL,
	"change_log" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"published_by" varchar(255) NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rows_published" integer NOT NULL,
	"job_id" varchar(255),
	"dirty_count" integer NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "seo_asins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"asin" varchar(20) NOT NULL,
	"sku" varchar(100) NOT NULL,
	"amazon_url" text,
	"website_url" text,
	"variation_id" varchar(100),
	"variation_product" varchar(255),
	"parentage_level" varchar(10),
	"variation_theme_name" varchar(100),
	"flavor" varchar(100),
	"style" varchar(100),
	"color" varchar(100),
	"size" varchar(100),
	"existing_content" jsonb DEFAULT '{}'::jsonb,
	"baseline_analysis" jsonb,
	"generated_content" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_compliance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'clean' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_cosmo_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"triples" jsonb DEFAULT '[]'::jsonb,
	"keyword_coverage" jsonb DEFAULT '{}'::jsonb,
	"competitive_positioning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_cosmo_maps_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "seo_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"url" text,
	"content_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"search_volume" integer DEFAULT 0 NOT NULL,
	"priority_tier" varchar(5),
	"search_intent" varchar(100),
	"primary_use_location" varchar(100),
	"match_type" varchar(50),
	"cosmo_relationship" varchar(100),
	"buyer_stage" varchar(20),
	"notes" text DEFAULT '',
	"keyword_source" varchar(100) DEFAULT 'Client',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"current_phase" varchar(5) DEFAULT 'S1' NOT NULL,
	"date" varchar(50),
	"client_id_code" varchar(100),
	"brand_name" varchar(255) DEFAULT '' NOT NULL,
	"client_name" varchar(255),
	"client_bible_url" text,
	"brand_url" text,
	"competitors" jsonb DEFAULT '[]'::jsonb,
	"variation_theme" varchar(100),
	"size_present" boolean DEFAULT false NOT NULL,
	"brand_guidelines" text DEFAULT '',
	"brand_guidelines_lock" jsonb,
	"variety_pack_details" text,
	"s1_approved_at" timestamp with time zone,
	"s2_approved_at" timestamp with time zone,
	"s3_approved_at" timestamp with time zone,
	"s4_approved_at" timestamp with time zone,
	"s5_approved_at" timestamp with time zone,
	"s6_approved_at" timestamp with time zone,
	"linked_product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"review_id" varchar(100),
	"date" varchar(50),
	"reviewer_name" varchar(255),
	"asin" varchar(20),
	"product_variation" varchar(255),
	"star_rating" integer,
	"title" text,
	"text" text,
	"sentiment" varchar(50),
	"key_themes" text,
	"usage_mentioned" text,
	"packaging_feedback" text,
	"price_feedback" text,
	"heat_level_feedback" text,
	"rufus_usable_insight" text,
	"bullet_mapping" text,
	"helpful_votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_rufus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase1_questions" jsonb DEFAULT '[]'::jsonb,
	"phase1_answers" jsonb DEFAULT '[]'::jsonb,
	"phase2_questions" jsonb DEFAULT '[]'::jsonb,
	"phase2_answers" jsonb DEFAULT '[]'::jsonb,
	"phase3_questions" jsonb DEFAULT '[]'::jsonb,
	"phase3_answers" jsonb DEFAULT '[]'::jsonb,
	"optimization_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_rufus_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "sp_api_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id_code" varchar(50) NOT NULL,
	"marketplace_id" varchar(50) NOT NULL,
	"seller_id" varchar(50) NOT NULL,
	"refresh_token" text NOT NULL,
	"region" varchar(10) DEFAULT 'na' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"image" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_snapshots" ADD CONSTRAINT "amazon_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_definition_id_category_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."category_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_comments" ADD CONSTRAINT "field_comments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_asins" ADD CONSTRAINT "seo_asins_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_compliance_reports" ADD CONSTRAINT "seo_compliance_reports_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_cosmo_maps" ADD CONSTRAINT "seo_cosmo_maps_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_exports" ADD CONSTRAINT "seo_exports_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_keywords" ADD CONSTRAINT "seo_keywords_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_projects" ADD CONSTRAINT "seo_projects_linked_product_id_products_id_fk" FOREIGN KEY ("linked_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_reviews" ADD CONSTRAINT "seo_reviews_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rufus" ADD CONSTRAINT "seo_rufus_project_id_seo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."seo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aac_client_id_code" ON "aac_clients" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_aac_client_status" ON "aac_clients" USING btree ("client_status");--> statement-breakpoint
CREATE INDEX "idx_activity_log_changed_at" ON "activity_log" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "idx_activity_log_changed_by" ON "activity_log" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "idx_activity_log_product_id" ON "activity_log" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_activity_log_client" ON "activity_log" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_amazon_snapshots_product" ON "amazon_snapshots" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_amazon_snapshots_asin" ON "amazon_snapshots" USING btree ("asin");--> statement-breakpoint
CREATE INDEX "idx_amazon_snapshots_fetched" ON "amazon_snapshots" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_catattr_definition" ON "category_attributes" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_catattr_group" ON "category_attributes" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "idx_catattr_requirement" ON "category_attributes" USING btree ("requirement");--> statement-breakpoint
CREATE INDEX "idx_catattr_bible_match" ON "category_attributes" USING btree ("bible_field_match");--> statement-breakpoint
CREATE INDEX "idx_catdef_client" ON "category_definitions" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_catdef_product_type" ON "category_definitions" USING btree ("product_type");--> statement-breakpoint
CREATE INDEX "idx_catdef_client_type" ON "category_definitions" USING btree ("client_id_code","product_type");--> statement-breakpoint
CREATE INDEX "idx_col_attr_general_label" ON "column_attributes" USING btree ("general_label");--> statement-breakpoint
CREATE INDEX "idx_col_attr_reference_group" ON "column_attributes" USING btree ("reference_group");--> statement-breakpoint
CREATE INDEX "idx_col_attr_subgroup" ON "column_attributes" USING btree ("subgroup");--> statement-breakpoint
CREATE INDEX "idx_col_attr_essential" ON "column_attributes" USING btree ("is_essential");--> statement-breakpoint
CREATE INDEX "idx_field_comments_product" ON "field_comments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_field_comments_product_field" ON "field_comments" USING btree ("product_id","bq_name");--> statement-breakpoint
CREATE INDEX "idx_field_comments_resolved" ON "field_comments" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_products_asin" ON "products" USING btree ("asin");--> statement-breakpoint
CREATE INDEX "idx_products_sku" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_products_client_id" ON "products" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_products_marketplace" ON "products" USING btree ("marketplace");--> statement-breakpoint
CREATE INDEX "idx_products_country" ON "products" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_products_status" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_products_brand" ON "products" USING btree ("brand_name");--> statement-breakpoint
CREATE INDEX "idx_products_parent_sku" ON "products" USING btree ("parent_sku");--> statement-breakpoint
CREATE INDEX "idx_products_is_dirty" ON "products" USING btree ("is_dirty");--> statement-breakpoint
CREATE INDEX "idx_seo_asins_project" ON "seo_asins" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_seo_asins_asin" ON "seo_asins" USING btree ("asin");--> statement-breakpoint
CREATE INDEX "idx_seo_compliance_project" ON "seo_compliance_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_seo_exports_project" ON "seo_exports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_seo_keywords_project" ON "seo_keywords" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_seo_keywords_tier" ON "seo_keywords" USING btree ("priority_tier");--> statement-breakpoint
CREATE INDEX "idx_seo_projects_created_by" ON "seo_projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_seo_projects_client" ON "seo_projects" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_seo_projects_status" ON "seo_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_seo_projects_linked_product" ON "seo_projects" USING btree ("linked_product_id");--> statement-breakpoint
CREATE INDEX "idx_seo_reviews_project" ON "seo_reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_seo_reviews_asin" ON "seo_reviews" USING btree ("asin");--> statement-breakpoint
CREATE INDEX "idx_sp_api_creds_client" ON "sp_api_credentials" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_sp_api_creds_active" ON "sp_api_credentials" USING btree ("is_active");