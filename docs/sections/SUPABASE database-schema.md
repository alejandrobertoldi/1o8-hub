# Database Schema Reference

> Auto-generated from `src/lib/db/schema.ts`. Drizzle ORM + PostgreSQL (Supabase).

---

## Enums

| Enum Name                     | Values                                                                                                                                                                                                                                                              |
|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `user_role`                   | `viewer`, `editor`, `admin`, `client`, `pending`, `prospect`                                                                                                                                                                                                        |
| `aplus_module_type`           | `background_image_text`, `comparison_table_1`, `comparison_table_2`, `comparison_table_3`, `dual_images_text`, `four_images_text`, `full_image`, `full_video`, `hotspots_1`, `hotspots_2`, `navigation_carousel`, `qa`, `regimen_carousel`, `simple_image_carousel`, `single_image_text`, `technical_specifications`, `text`, `video_image_carousel`, `video_text` |
| `aplus_module_status`         | `draft`, `in_review`, `approved`, `uploaded`, `live`                                                                                                                                                                                                                |
| `client_type`                 | `AIA`, `NTA`                                                                                                                                                                                                                                                        |
| `gantt_task_status`           | `pending`, `in_progress`, `completed`                                                                                                                                                                                                                               |
| `issue_report_status`         | `pending`, `in_review`, `in_progress`, `resolved`, `closed`                                                                                                                                                                                                         |
| `aplus_comment_status`        | `active`, `resolved`                                                                                                                                                                                                                                                |
| `design_category`             | `brand_story`, `aplus`, `listing_images`, `storefront`                                                                                                                                                                                                              |
| `design_status_value`         | `not_started`, `in_progress`, `in_review`, `approved`, `live`                                                                                                                                                                                                       |
| `impact_snapshot_status`      | `pending_before`, `pending_after`, `complete`                                                                                                                                                                                                                       |
| `ppc_report_type`             | `campaign`, `keyword`, `search_term`, `sqp`                                                                                                                                                                                                                         |
| `ppc_approval_status`         | `pending`, `approved`, `rejected`                                                                                                                                                                                                                                   |
| `ppc_alert_type`              | `budget`, `inventory`, `competitor`, `trend`                                                                                                                                                                                                                        |
| `ppc_alert_severity`          | `info`, `warning`, `critical`                                                                                                                                                                                                                                       |
| `support_ticket_category`     | `bug`, `feature_request`, `account_issue`, `billing`, `content`, `other`                                                                                                                                                                                            |
| `support_ticket_priority`     | `low`, `medium`, `high`, `urgent`                                                                                                                                                                                                                                   |
| `support_ticket_status`       | `open`, `in_progress`, `waiting`, `escalated`, `resolved`, `closed`                                                                                                                                                                                                 |

---

## Users & Auth

### users

| Column           | Type                   | Constraints                          |
|------------------|------------------------|--------------------------------------|
| id               | uuid                   | PK, default random                   |
| email            | varchar(255)           | NOT NULL, UNIQUE                     |
| name             | varchar(255)           |                                      |
| image            | text                   |                                      |
| role             | user_role              | NOT NULL, default `'viewer'`         |
| allowed_sections | jsonb (string[])       | NOT NULL, default `[]`               |
| client_id_code   | text                   |                                      |
| asana_email      | varchar(255)           |                                      |
| last_login_at    | timestamptz            |                                      |
| created_at       | timestamptz            | NOT NULL, default now()              |
| updated_at       | timestamptz            |                                      |

**Indexes:** idx_users_client_id_code(client_id_code)

---

## Products & Catalog

### master

Hybrid schema: ~30 indexed core columns + categorized JSONB blobs for ~940 remaining columns + `raw_column_values` JSONB for zero-data-loss.

| Column                 | Type                       | Constraints                          |
|------------------------|----------------------------|--------------------------------------|
| id                     | uuid                       | PK, default random                   |
| asin                   | varchar(20)                |                                      |
| sku                    | varchar(100)               |                                      |
| client_id_code         | varchar(100)               |                                      |
| marketplace            | varchar(50)                |                                      |
| country                | varchar(10)                |                                      |
| status                 | varchar(50)                |                                      |
| parentage_level        | varchar(20)                |                                      |
| parent_sku             | varchar(100)               |                                      |
| parent_asin            | varchar(20)                |                                      |
| brand_name             | varchar(255)               |                                      |
| item_name              | text                       |                                      |
| summarized_title       | text                       |                                      |
| product_type           | varchar(255)               |                                      |
| list_price             | varchar(50)                |                                      |
| cost_price             | varchar(50)                |                                      |
| main_image_url         | text                       |                                      |
| item_type_keyword      | varchar(255)               |                                      |
| feed_product_type      | varchar(255)               |                                      |
| recommended_browse_nodes | text                     |                                      |
| generic_keywords       | text                       |                                      |
| platinum_keywords      | text                       |                                      |
| variation_group        | varchar(100)               |                                      |
| variation_ref          | uuid                       |                                      |
| group_ref              | uuid                       |                                      |
| content_seo            | jsonb (Record<string,string>) |                                   |
| variations             | jsonb (VariationData)      |                                      |
| packaging              | jsonb (Record<string,string>) |                                   |
| target_audience        | jsonb (Record<string,string>) |                                   |
| fulfillment            | jsonb (Record<string,string>) |                                   |
| product_attributes     | jsonb (Record<string,string>) |                                   |
| nutrition_supplements  | jsonb (Record<string,string>) |                                   |
| compliance_safety      | jsonb (Record<string,string>) |                                   |
| images                 | jsonb (Record<string,string>) |                                   |
| dimensions_weight      | jsonb (Record<string,string>) |                                   |
| other_attributes       | jsonb (Record<string,string>) |                                   |
| raw_column_values      | jsonb (Record<string,string>) |                                   |
| is_dirty               | boolean                    | NOT NULL, default false              |
| change_log             | jsonb (array of edits)     | default `[]`                         |
| updated_at             | timestamptz                | NOT NULL, default now()              |
| last_published_at      | timestamptz                |                                      |
| created_at             | timestamptz                | NOT NULL, default now()              |

**Indexes:** idx_products_asin(asin), idx_products_sku(sku), idx_products_client_id(client_id_code), idx_products_marketplace(marketplace), idx_products_country(country), idx_products_status(status), idx_products_brand(brand_name), idx_products_parent_sku(parent_sku), idx_products_is_dirty(is_dirty)

### column_attributes

Metadata for each of the 972 Hub columns (imported from BigQuery).

| Column              | Type         | Constraints                          |
|---------------------|--------------|--------------------------------------|
| id                  | serial       | PK                                   |
| master_row          | integer      | NOT NULL                             |
| general_label       | varchar(255) | NOT NULL, UNIQUE                     |
| specific_label      | text         |                                      |
| bigquery_label      | text         |                                      |
| bq_data_type        | varchar(20)  | default `'STRING'`                   |
| label_details       | text         |                                      |
| label_max_options   | varchar(10)  |                                      |
| reference_group     | varchar(100) | NOT NULL                             |
| subgroup            | varchar(100) | default `''`                         |
| is_essential        | boolean      | NOT NULL, default false              |
| client_requirements | jsonb (Record<string,string>) | NOT NULL, default `{}`  |

**Indexes:** idx_col_attr_general_label(general_label), idx_col_attr_reference_group(reference_group), idx_col_attr_subgroup(subgroup), idx_col_attr_essential(is_essential)

### category_definitions

One row per client + productType + marketplace combination (from Category Listing Report).

| Column             | Type         | Constraints                          |
|--------------------|--------------|--------------------------------------|
| id                 | serial       | PK                                   |
| client_id_code     | varchar(100) | NOT NULL                             |
| product_type       | varchar(255) | NOT NULL                             |
| marketplace_id     | varchar(50)  | NOT NULL, default `'ATVPDKIKX0DER'`  |
| total_attributes   | integer      | NOT NULL, default 0                  |
| required_count     | integer      | NOT NULL, default 0                  |
| conditional_count  | integer      | NOT NULL, default 0                  |
| optional_count     | integer      | NOT NULL, default 0                  |
| uploaded_by        | varchar(255) | NOT NULL                             |
| uploaded_at        | timestamptz  | NOT NULL, default now()              |
| baseline_snapshot  | jsonb        |                                      |

**Indexes:** idx_catdef_client(client_id_code), idx_catdef_product_type(product_type), idx_catdef_client_type(client_id_code, product_type)

### category_attributes

All attributes for a given category definition.

| Column              | Type         | Constraints                                        |
|---------------------|--------------|----------------------------------------------------|
| id                  | serial       | PK                                                 |
| definition_id       | integer      | NOT NULL, FK -> category_definitions.id ON DELETE CASCADE |
| amazon_field_name   | varchar(500) | NOT NULL                                           |
| local_label         | varchar(255) | NOT NULL                                           |
| group_name          | varchar(100) | NOT NULL                                           |
| description         | text         |                                                    |
| example             | text         |                                                    |
| requirement         | varchar(30)  | NOT NULL                                           |
| valid_values        | jsonb (string[]) |                                                |
| bible_field_match   | varchar(255) |                                                    |
| sort_order          | integer      | NOT NULL, default 0                                |
| is_key              | boolean      | NOT NULL, default false                            |
| hide_from_template  | boolean      | NOT NULL, default false                            |

**Indexes:** idx_catattr_definition(definition_id), idx_catattr_group(group_name), idx_catattr_requirement(requirement), idx_catattr_bible_match(bible_field_match)

### product_key_overrides

Per-product override: editors can flag/unflag specific attributes as key.

| Column                  | Type         | Constraints                                             |
|-------------------------|--------------|---------------------------------------------------------|
| id                      | serial       | PK                                                      |
| product_id              | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE              |
| attribute_name          | text         | NOT NULL                                                |
| category_definition_id  | integer      | FK -> category_definitions.id ON DELETE CASCADE          |
| is_key                  | boolean      | NOT NULL, default true                                  |
| created_by              | text         | NOT NULL                                                |
| created_at              | timestamptz  | NOT NULL, default now()                                 |

**Indexes:** idx_pko_product(product_id), idx_pko_definition(category_definition_id)
**Unique:** uq_pko_product_attr(product_id, attribute_name)

### attribute_template_requests

Records template generation events for portal links (Google Sheets attribute templates).

| Column           | Type           | Constraints                          |
|------------------|----------------|--------------------------------------|
| id               | uuid           | PK, default random                   |
| client_id_code   | text           | NOT NULL                             |
| product_type     | text           | NOT NULL                             |
| scope            | text           | NOT NULL (gaps / all / new)          |
| levels           | text[]         | NOT NULL                             |
| product_ids      | text[]         |                                      |
| created_by       | text           | NOT NULL                             |
| created_at       | timestamptz    | NOT NULL, default now()              |
| completed_at     | timestamptz    |                                      |
| google_sheet_id  | text           |                                      |
| sheet_url        | text           |                                      |
| drive_folder_id  | text           |                                      |
| archive_folder_id| text           |                                      |
| status           | text           | NOT NULL, default `'in_progress'`    |
| seeded_snapshot  | jsonb          |                                      |
| finalized_at     | timestamptz    |                                      |
| finalized_by     | text           |                                      |

**Indexes:** idx_atr_client(client_id_code), idx_atr_client_status(client_id_code, status)

---

## Clients

### aac

Client metadata imported from BigQuery (AAC table).

| Column                   | Type         | Constraints                          |
|--------------------------|--------------|--------------------------------------|
| id                       | serial       | PK                                   |
| client_id_code           | varchar(100) | NOT NULL, UNIQUE                     |
| client_status            | varchar(50)  | NOT NULL                             |
| client_name              | varchar(255) |                                      |
| raw_data                 | jsonb (Record<string,string>) |                         |
| client_type              | client_type  |                                      |
| onboarding_date          | timestamptz  |                                      |
| portal_timeline_enabled  | boolean      | NOT NULL, default false              |
| asana_project_gid        | varchar(100) |                                      |
| powerbi_embed_url        | text         |                                      |
| updated_at               | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_aac_client_id_code(client_id_code), idx_aac_client_status(client_status)

### client_onboarding_steps

Tracks completion of each onboarding step per client.

| Column         | Type         | Constraints                                             |
|----------------|--------------|---------------------------------------------------------|
| id             | uuid         | PK, default random                                      |
| client_id_code | varchar(100) | NOT NULL                                                |
| step_key       | text         | NOT NULL                                                |
| status         | text         | NOT NULL, default `'pending'`                           |
| completed_at   | timestamptz  |                                                         |
| completed_by   | text         |                                                         |
| metadata       | jsonb        | default `{}`                                            |
| assignee_id    | uuid         |                                                         |
| created_at     | timestamptz  | NOT NULL, default now()                                 |
| updated_at     | timestamptz  | NOT NULL, default now()                                 |

**Indexes:** idx_onboarding_client(client_id_code), idx_onboarding_status(status)
**Unique:** uq_onboarding_client_step(client_id_code, step_key)

### client_forecasts

| Column         | Type            | Constraints                                             |
|----------------|-----------------|---------------------------------------------------------|
| id             | uuid            | PK, default random                                      |
| client_id_code | varchar(100)    | NOT NULL                                                |
| month          | varchar(7)      | NOT NULL (e.g. `"2026-03"`)                             |
| metric         | varchar(50)     | NOT NULL (e.g. `"product_sales"`, `"ad_spend"`)         |
| forecast_value | numeric(14,2)   |                                                         |
| updated_by     | uuid            | FK -> users.id ON DELETE SET NULL                       |
| updated_at     | timestamptz     | NOT NULL, default now()                                 |

**Indexes:** idx_forecasts_client(client_id_code)
**Unique:** uq_forecast_client_month_metric(client_id_code, month, metric)

### inventory_rec_settings

Per-client percentage adjustments for inventory forecast recommendation columns.

| Column         | Type         | Constraints                          |
|----------------|--------------|--------------------------------------|
| client_id_code | varchar(50)  | PK                                   |
| pct_90d        | integer      | NOT NULL, default 0                  |
| pct_q1         | integer      | NOT NULL, default 0                  |
| pct_avg        | integer      | NOT NULL, default 0                  |
| updated_at     | timestamptz  | NOT NULL, default now()              |
| updated_by     | varchar(255) |                                      |

---

## Publishing & Activity

### publish_history

| Column         | Type         | Constraints                          |
|----------------|--------------|--------------------------------------|
| id             | serial       | PK                                   |
| published_by   | varchar(255) | NOT NULL                             |
| published_at   | timestamptz  | NOT NULL, default now()              |
| rows_published | integer      | NOT NULL                             |
| job_id         | varchar(255) |                                      |
| dirty_count    | integer      | NOT NULL                             |
| changes        | jsonb (array of edits) | default `[]`                 |

**Indexes:** idx_publish_history_published_at(published_at)

### activity_log

| Column         | Type         | Constraints                                        |
|----------------|--------------|----------------------------------------------------|
| id             | serial       | PK                                                 |
| product_id     | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| asin           | varchar(20)  |                                                    |
| sku            | varchar(100) |                                                    |
| client_id_code | varchar(50)  |                                                    |
| item_name      | text         |                                                    |
| field_label    | varchar(255) | NOT NULL                                           |
| bq_name        | varchar(255) | NOT NULL                                           |
| old_value      | text         |                                                    |
| new_value      | text         |                                                    |
| changed_by     | varchar(255) | NOT NULL                                           |
| changed_at     | timestamptz  | NOT NULL, default now()                            |
| edit_type      | varchar(20)  | NOT NULL, default `'single'`                       |

**Indexes:** idx_activity_log_changed_at(changed_at), idx_activity_log_changed_by(changed_by), idx_activity_log_product_id(product_id), idx_activity_log_client(client_id_code)

### field_comments

| Column      | Type         | Constraints                                        |
|-------------|--------------|----------------------------------------------------|
| id          | serial       | PK                                                 |
| product_id  | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| bq_name     | varchar(255) | NOT NULL                                           |
| comment     | text         | NOT NULL                                           |
| author      | varchar(255) | NOT NULL                                           |
| author_name | varchar(255) |                                                    |
| resolved    | boolean      | NOT NULL, default false                            |
| resolved_by | varchar(255) |                                                    |
| resolved_at | timestamptz  |                                                    |
| created_at  | timestamptz  | NOT NULL, default now()                            |
| updated_at  | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_field_comments_product(product_id), idx_field_comments_product_field(product_id, bq_name), idx_field_comments_resolved(resolved)

---

## Amazon Sync

### amazon_snapshots

Normalized SP-API data and comparison results per product.

| Column            | Type         | Constraints                                        |
|-------------------|--------------|----------------------------------------------------|
| id                | serial       | PK                                                 |
| product_id        | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| asin              | varchar(20)  | NOT NULL                                           |
| marketplace       | varchar(50)  |                                                    |
| normalized_data   | jsonb        | NOT NULL                                           |
| comparison_result | jsonb        |                                                    |
| overall_match     | integer      |                                                    |
| fetched_at        | timestamptz  | NOT NULL, default now()                            |
| created_at        | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_amazon_snapshots_product(product_id), idx_amazon_snapshots_asin(asin), idx_amazon_snapshots_fetched(fetched_at)

### sp_api_credentials

Per-client SP-API refresh tokens and seller IDs.

| Column          | Type         | Constraints                          |
|-----------------|--------------|--------------------------------------|
| id              | serial       | PK                                   |
| client_id_code  | varchar(50)  | NOT NULL                             |
| marketplace_id  | varchar(50)  | NOT NULL                             |
| seller_id       | varchar(50)  | NOT NULL                             |
| refresh_token   | text         | NOT NULL                             |
| region          | varchar(10)  | NOT NULL, default `'na'`             |
| is_active       | boolean      | NOT NULL, default true               |
| last_sync_at    | timestamptz  |                                      |
| created_at      | timestamptz  | NOT NULL, default now()              |
| updated_at      | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_sp_api_creds_client(client_id_code), idx_sp_api_creds_active(is_active)

### amazon_sync_snapshots

Raw Rainforest/Firecrawl API response per ASIN per sync run.

| Column          | Type         | Constraints                                        |
|-----------------|--------------|----------------------------------------------------|
| id              | uuid         | PK, default random                                 |
| client_id_code  | varchar(100) | NOT NULL                                           |
| product_id      | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| asin            | text         | NOT NULL                                           |
| amazon_domain   | text         | NOT NULL, default `'amazon.com'`                   |
| provider        | text         | NOT NULL, default `'rainforest'`                   |
| snapshot_data   | jsonb        | NOT NULL                                           |
| credits_used    | integer      | default 1                                          |
| fetched_at      | timestamptz  | NOT NULL, default now()                            |
| created_at      | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_sync_snapshots_client(client_id_code), idx_sync_snapshots_product(product_id), idx_sync_snapshots_asin(asin), idx_sync_snapshots_fetched(fetched_at)

### amazon_sync_runs

Tracks each sync job (manual or scheduled).

| Column              | Type         | Constraints                          |
|---------------------|--------------|--------------------------------------|
| id                  | uuid         | PK, default random                   |
| client_id_code      | varchar(100) |                                      |
| run_type            | text         | NOT NULL (manual / scheduled)        |
| status              | text         | NOT NULL, default `'pending'`        |
| total_products      | integer      | default 0                            |
| completed_products  | integer      | default 0                            |
| failed_products     | integer      | default 0                            |
| credits_used        | integer      | default 0                            |
| started_at          | timestamptz  |                                      |
| completed_at        | timestamptz  |                                      |
| error_message       | text         |                                      |
| created_at          | timestamptz  | NOT NULL, default now()              |

### amazon_sync_discrepancies

Field-level differences between catalog and live Amazon data.

| Column           | Type         | Constraints                                             |
|------------------|--------------|---------------------------------------------------------|
| id               | uuid         | PK, default random                                      |
| snapshot_id      | uuid         | NOT NULL, FK -> amazon_sync_snapshots.id ON DELETE CASCADE |
| product_id       | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE              |
| client_id_code   | varchar(100) | NOT NULL                                                |
| asin             | text         | NOT NULL                                                |
| field_name       | text         | NOT NULL                                                |
| field_group      | text         | NOT NULL                                                |
| catalog_value    | text         |                                                         |
| amazon_value     | text         |                                                         |
| status           | text         | NOT NULL (match / mismatch / missing_in_catalog / missing_in_amazon) |
| resolved         | boolean      | default false                                           |
| resolved_action  | text         |                                                         |
| resolved_at      | timestamptz  |                                                         |
| resolved_by      | text         |                                                         |
| created_at       | timestamptz  | NOT NULL, default now()                                 |

**Indexes:** idx_sync_disc_product(product_id), idx_sync_disc_client(client_id_code), idx_sync_disc_status(status), idx_sync_disc_resolved(resolved), idx_sync_disc_snapshot(snapshot_id)

---

## SEO Pipeline

### seo_projects

One project = one brand/ASIN group going through the S1-S6 pipeline.

| Column                | Type         | Constraints                                             |
|-----------------------|--------------|---------------------------------------------------------|
| id                    | uuid         | PK, default random                                      |
| created_by            | varchar(255) | NOT NULL                                                |
| name                  | varchar(255) | NOT NULL                                                |
| status                | varchar(20)  | NOT NULL, default `'draft'`                             |
| current_phase         | varchar(5)   | NOT NULL, default `'S1'`                                |
| date                  | varchar(50)  |                                                         |
| client_id_code        | varchar(100) |                                                         |
| brand_name            | varchar(255) | NOT NULL, default `''`                                  |
| client_name           | varchar(255) |                                                         |
| client_bible_url      | text         |                                                         |
| brand_url             | text         |                                                         |
| competitors           | jsonb (array of {name,url}) | default `[]`                             |
| variation_theme       | varchar(100) |                                                         |
| size_present          | boolean      | NOT NULL, default false                                 |
| version               | integer      | NOT NULL, default 1                                     |
| brand_guidelines      | text         | default `''`                                            |
| brand_guidelines_lock | jsonb        |                                                         |
| variety_pack_details  | text         |                                                         |
| content_rules         | jsonb        |                                                         |
| s1_approved_at        | timestamptz  |                                                         |
| s2_approved_at        | timestamptz  |                                                         |
| s3_approved_at        | timestamptz  |                                                         |
| s4_approved_at        | timestamptz  |                                                         |
| s5_approved_at        | timestamptz  |                                                         |
| s6_approved_at        | timestamptz  |                                                         |
| assigned_to           | uuid         | FK -> users.id ON DELETE SET NULL                       |
| linked_product_id     | uuid         | FK -> master.id ON DELETE SET NULL                      |
| variation_id          | uuid         | FK -> variations.id ON DELETE SET NULL                  |
| created_at            | timestamptz  | NOT NULL, default now()                                 |
| updated_at            | timestamptz  | NOT NULL, default now()                                 |

**Indexes:** idx_seo_projects_created_by(created_by), idx_seo_projects_client(client_id_code), idx_seo_projects_status(status), idx_seo_projects_linked_product(linked_product_id), idx_seo_projects_variation(variation_id)

### seo_asins

One row per ASIN within a project (S1 intake grid).

| Column                | Type         | Constraints                                        |
|-----------------------|--------------|----------------------------------------------------|
| id                    | uuid         | PK, default random                                 |
| project_id            | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| asin                  | varchar(20)  | NOT NULL                                           |
| sku                   | varchar(100) | NOT NULL                                           |
| amazon_url            | text         |                                                    |
| website_url           | text         |                                                    |
| variation_id          | varchar(100) |                                                    |
| variation_product     | varchar(255) |                                                    |
| parentage_level       | varchar(10)  |                                                    |
| variation_theme_name  | varchar(100) |                                                    |
| flavor                | varchar(100) |                                                    |
| style                 | varchar(100) |                                                    |
| color                 | varchar(100) |                                                    |
| size                  | varchar(100) |                                                    |
| variation_group       | varchar(100) |                                                    |
| existing_content      | jsonb        |                                                    |
| baseline_analysis     | jsonb        |                                                    |
| generated_content     | jsonb        |                                                    |
| created_at            | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_asins_project(project_id), idx_seo_asins_asin(asin)

### seo_keywords

S2 output -- keyword research rows per project.

| Column               | Type         | Constraints                                        |
|----------------------|--------------|----------------------------------------------------|
| id                   | uuid         | PK, default random                                 |
| project_id           | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| text                 | text         | NOT NULL                                           |
| search_volume        | integer      | NOT NULL, default 0                                |
| priority_tier        | varchar(5)   | (T1 / T2 / T3 / T4)                               |
| search_intent        | varchar(100) |                                                    |
| primary_use_location | varchar(100) |                                                    |
| match_type           | varchar(50)  |                                                    |
| cosmo_relationship   | varchar(100) |                                                    |
| buyer_stage          | varchar(20)  | (Awareness / Consideration / Decision)             |
| notes                | text         | default `''`                                       |
| keyword_source       | varchar(100) | default `'Client'`                                 |
| created_at           | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_keywords_project(project_id), idx_seo_keywords_tier(priority_tier)

### seo_reviews

S3 output -- customer review analysis rows per project.

| Column               | Type         | Constraints                                        |
|----------------------|--------------|----------------------------------------------------|
| id                   | uuid         | PK, default random                                 |
| project_id           | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| review_id            | varchar(100) |                                                    |
| date                 | varchar(50)  |                                                    |
| reviewer_name        | varchar(255) |                                                    |
| asin                 | varchar(20)  |                                                    |
| product_variation    | varchar(255) |                                                    |
| star_rating          | integer      |                                                    |
| title                | text         |                                                    |
| text                 | text         |                                                    |
| sentiment            | varchar(50)  |                                                    |
| key_themes           | text         |                                                    |
| usage_mentioned      | text         |                                                    |
| packaging_feedback   | text         |                                                    |
| price_feedback       | text         |                                                    |
| heat_level_feedback  | text         |                                                    |
| rufus_usable_insight | text         |                                                    |
| bullet_mapping       | text         |                                                    |
| helpful_votes        | integer      | NOT NULL, default 0                                |
| created_at           | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_reviews_project(project_id), idx_seo_reviews_asin(asin)

### seo_rufus

S4 output -- one row per project (Rufus Q&A analysis).

| Column                | Type         | Constraints                                        |
|-----------------------|--------------|----------------------------------------------------|
| id                    | uuid         | PK, default random                                 |
| project_id            | uuid         | NOT NULL, UNIQUE, FK -> seo_projects.id ON DELETE CASCADE |
| phase1_questions      | jsonb (string[]) | default `[]`                                   |
| phase1_answers        | jsonb (string[]) | default `[]`                                   |
| phase2_questions      | jsonb (string[]) | default `[]`                                   |
| phase2_answers        | jsonb (string[]) | default `[]`                                   |
| phase3_questions      | jsonb (string[]) | default `[]`                                   |
| phase3_answers        | jsonb (string[]) | default `[]`                                   |
| rows                  | jsonb (Record<string,string>[]) | default `[]`                      |
| optimization_summary  | jsonb        |                                                    |
| created_at            | timestamptz  | NOT NULL, default now()                            |
| updated_at            | timestamptz  | NOT NULL, default now()                            |

### seo_cosmo_maps

S5 output -- COSMO relationship maps per project.

| Column                   | Type         | Constraints                                        |
|--------------------------|--------------|----------------------------------------------------|
| id                       | uuid         | PK, default random                                 |
| project_id               | uuid         | NOT NULL, UNIQUE, FK -> seo_projects.id ON DELETE CASCADE |
| triples                  | jsonb (array of triples) | default `[]`                          |
| rows                     | jsonb (Record<string,string>[]) | default `[]`                      |
| keyword_coverage         | jsonb (Record<string,number>) | default `{}`                        |
| competitive_positioning  | text         |                                                    |
| created_at               | timestamptz  | NOT NULL, default now()                            |
| updated_at               | timestamptz  | NOT NULL, default now()                            |

### seo_compliance_reports

S6 compliance check results per project.

| Column     | Type         | Constraints                                        |
|------------|--------------|----------------------------------------------------|
| id         | uuid         | PK, default random                                 |
| project_id | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| issues     | jsonb (array of issues) | default `[]`                            |
| status     | varchar(20)  | NOT NULL, default `'clean'`                        |
| created_at | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_compliance_project(project_id)

### seo_exports

Export history per project.

| Column           | Type         | Constraints                                        |
|------------------|--------------|----------------------------------------------------|
| id               | uuid         | PK, default random                                 |
| project_id       | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| type             | varchar(20)  | NOT NULL (google_doc / csv / tsv)                  |
| url              | text         |                                                    |
| content_snapshot | jsonb        |                                                    |
| created_at       | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_exports_project(project_id)

### seo_quality_scores

Append-only audit score log per project.

| Column                  | Type         | Constraints                                        |
|-------------------------|--------------|----------------------------------------------------|
| id                      | uuid         | PK, default random                                 |
| project_id              | uuid         | NOT NULL, FK -> seo_projects.id ON DELETE CASCADE   |
| overall_score           | integer      | NOT NULL                                           |
| compliance_score        | integer      |                                                    |
| keyword_coverage        | integer      |                                                    |
| cosmo_density           | integer      |                                                    |
| rufus_coverage          | integer      |                                                    |
| human_voice             | integer      |                                                    |
| buyer_journey           | integer      |                                                    |
| variation_consistency   | integer      |                                                    |
| eeat_score              | integer      |                                                    |
| readability_score       | integer      |                                                    |
| citability_score        | integer      |                                                    |
| geo_score               | integer      |                                                    |
| findings_count          | integer      | NOT NULL, default 0                                |
| created_at              | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_seo_quality_scores_project(project_id)

### seo_settings

Global key-value config for the SEO module.

| Column     | Type         | Constraints                          |
|------------|--------------|--------------------------------------|
| key        | varchar(100) | PK                                   |
| value      | text         | NOT NULL, default `''`               |
| updated_at | timestamptz  | NOT NULL, default now()              |
| updated_by | varchar(255) | NOT NULL, default `''`               |

---

## A+ Content

### aplus_sets

One row per product -- tracks scope, platform, version for the A+ set.

| Column           | Type         | Constraints                                        |
|------------------|--------------|----------------------------------------------------|
| id               | uuid         | PK, default random                                 |
| product_id       | uuid         | NOT NULL, UNIQUE, FK -> master.id ON DELETE CASCADE  |
| scope_type       | varchar(4)   | NOT NULL, default `'ASIN'`                         |
| scope_identifier | varchar(100) | NOT NULL                                           |
| platform         | varchar(2)   | NOT NULL, default `'SC'`                           |
| content_type     | varchar(3)   | NOT NULL, default `'PA+'`                          |
| version          | integer      | NOT NULL, default 1                                |
| group_number     | integer      |                                                    |
| parent_asin      | varchar(20)  |                                                    |
| covered_asins    | jsonb (string[]) |                                                |
| created_at       | timestamptz  | NOT NULL, default now()                            |
| updated_at       | timestamptz  | NOT NULL, default now()                            |

### aplus_modules

One row per A+ module (up to 7 per product).

| Column             | Type                  | Constraints                                        |
|--------------------|-----------------------|----------------------------------------------------|
| id                 | uuid                  | PK, default random                                 |
| product_id         | uuid                  | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| module_number      | integer               | NOT NULL                                           |
| module_type        | aplus_module_type     | NOT NULL                                           |
| headline_text      | text                  |                                                    |
| subheadline_text   | text                  |                                                    |
| body_text          | text                  |                                                    |
| alt_text           | text                  |                                                    |
| overlay_text       | text                  |                                                    |
| image_description  | text                  |                                                    |
| ai_image_prompt    | text                  |                                                    |
| cosmo_relation_type| varchar(100)          |                                                    |
| video_drive_file_id| text                  |                                                    |
| video_title        | text                  |                                                    |
| video_description  | text                  |                                                    |
| text_position      | varchar(10)           | (left / right)                                     |
| font_color         | varchar(10)           | (light / dark)                                     |
| figma_url          | text                  |                                                    |
| markup_url         | text                  |                                                    |
| status             | aplus_module_status   | NOT NULL, default `'draft'`                        |
| imported_at        | timestamptz           |                                                    |
| created_at         | timestamptz           | NOT NULL, default now()                            |
| updated_at         | timestamptz           | NOT NULL, default now()                            |

**Indexes:** idx_aplus_modules_product(product_id), idx_aplus_modules_status(status)
**Unique:** uq_aplus_module_position(product_id, module_number)

### aplus_module_images

One row per image slot within a module.

| Column              | Type         | Constraints                                        |
|---------------------|--------------|----------------------------------------------------|
| id                  | uuid         | PK, default random                                 |
| module_id           | uuid         | NOT NULL, FK -> aplus_modules.id ON DELETE CASCADE  |
| image_slot          | integer      | NOT NULL                                           |
| alt_text            | text         |                                                    |
| image_description   | text         |                                                    |
| ai_image_prompt     | text         |                                                    |
| client_id_code      | varchar(100) |                                                    |
| asin                | varchar(20)  |                                                    |
| sku                 | varchar(100) |                                                    |
| custom_label        | varchar(100) |                                                    |
| drive_file_id       | text         |                                                    |
| mobile_drive_file_id| text         |                                                    |
| panel_data          | jsonb (Record<string,string>) |                                   |
| created_at          | timestamptz  | NOT NULL, default now()                            |
| updated_at          | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_aplus_module_images_module(module_id)
**Unique:** uq_aplus_image_slot(module_id, image_slot)

### aplus_comments

Markup.io-style comment threads on A+ module previews.

| Column            | Type                   | Constraints                                             |
|-------------------|------------------------|---------------------------------------------------------|
| id                | uuid                   | PK, default random                                      |
| product_id        | uuid                   | NOT NULL, FK -> master.id ON DELETE CASCADE              |
| module_id         | uuid                   | FK -> aplus_modules.id ON DELETE SET NULL                |
| parent_comment_id | uuid                   | FK -> aplus_comments.id ON DELETE CASCADE (self-ref)     |
| author_email      | varchar(255)           | NOT NULL                                                |
| author_name       | varchar(255)           |                                                         |
| body              | text                   | NOT NULL                                                |
| audience          | varchar(10)            | NOT NULL, default `'internal'`                          |
| client_id_code    | varchar(100)           |                                                         |
| status            | aplus_comment_status   | NOT NULL, default `'active'`                            |
| pin_x             | integer                | (0-100 percentage)                                      |
| pin_y             | integer                | (0-100 percentage)                                      |
| comment_number    | integer                |                                                         |
| resolved_by       | varchar(255)           |                                                         |
| resolved_at       | timestamptz            |                                                         |
| created_at        | timestamptz            | NOT NULL, default now()                                 |
| updated_at        | timestamptz            | NOT NULL, default now()                                 |

**Indexes:** idx_aplus_comments_product(product_id), idx_aplus_comments_module(module_id), idx_aplus_comments_status(status), idx_aplus_comments_parent(parent_comment_id), idx_aplus_comments_client(client_id_code)

### brand_story

Stub schema -- extensible JSONB blob, one row per product.

| Column      | Type         | Constraints                                        |
|-------------|--------------|----------------------------------------------------|
| id          | uuid         | PK, default random                                 |
| product_id  | uuid         | NOT NULL, UNIQUE, FK -> master.id ON DELETE CASCADE  |
| data        | jsonb        | default `{}`                                       |
| imported_at | timestamptz  |                                                    |
| created_at  | timestamptz  | NOT NULL, default now()                            |
| updated_at  | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_brand_story_product(product_id)

---

## Variations

### variations

Top-level variation definition (one per product family per client).

| Column               | Type         | Constraints                          |
|----------------------|--------------|--------------------------------------|
| id                   | uuid         | PK, default random                   |
| client_id            | varchar(20)  | NOT NULL                             |
| name                 | varchar(200) | NOT NULL                             |
| code                 | varchar(50)  | NOT NULL, UNIQUE                     |
| amazon_variation_id  | varchar(100) |                                      |
| theme_attributes     | jsonb (string[]) | default `[]`                     |
| primary_dimension    | varchar(50)  |                                      |
| description          | text         |                                      |
| status               | varchar(20)  | NOT NULL, default `'draft'`          |
| locked_at            | timestamptz  |                                      |
| created_at           | timestamptz  | NOT NULL, default now()              |
| updated_at           | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_variations_client(client_id)

### variation_groups

Groups within a variation.

| Column              | Type         | Constraints                                        |
|---------------------|--------------|----------------------------------------------------|
| id                  | uuid         | PK, default random                                 |
| variation_id        | uuid         | NOT NULL, FK -> variations.id ON DELETE CASCADE     |
| name                | varchar(200) | NOT NULL                                           |
| dimension           | varchar(50)  | NOT NULL                                           |
| sort_order          | integer      | default 0                                          |
| is_variety_pack     | boolean      | NOT NULL, default false                            |
| variety_pack_details| jsonb (array of pack detail objects) |                               |
| created_at          | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_variation_groups_variation(variation_id)
**Unique:** uq_variation_group_name(variation_id, name)

### variety_pack_items

Links a variety pack product to its included items.

| Column              | Type         | Constraints                                        |
|---------------------|--------------|----------------------------------------------------|
| id                  | uuid         | PK, default random                                 |
| pack_product_id     | uuid         | NOT NULL, FK -> master.id ON DELETE CASCADE         |
| included_product_id | uuid         | FK -> master.id ON DELETE SET NULL                  |
| flavor              | varchar(200) |                                                    |
| size                | varchar(200) |                                                    |
| color               | varchar(200) |                                                    |
| style               | varchar(200) |                                                    |
| custom_label        | varchar(255) |                                                    |
| units               | integer      | NOT NULL, default 1                                |
| sort_order          | integer      | default 0                                          |

**Indexes:** idx_variety_pack_items_pack(pack_product_id), idx_variety_pack_items_included(included_product_id)

### variation_tags

Cross-cutting tags (a product can have many tags across many dimensions).

| Column       | Type         | Constraints                                        |
|--------------|--------------|----------------------------------------------------|
| id           | uuid         | PK, default random                                 |
| variation_id | uuid         | NOT NULL, FK -> variations.id ON DELETE CASCADE     |
| dimension    | varchar(50)  | NOT NULL                                           |
| value        | varchar(200) | NOT NULL                                           |
| sort_order   | integer      | default 0                                          |
| created_at   | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_variation_tags_variation(variation_id)
**Unique:** uq_variation_tag_value(variation_id, dimension, value)

### variation_tag_assignments

Junction: which products have which tags.

| Column     | Type | Constraints                                        |
|------------|------|----------------------------------------------------|
| tag_id     | uuid | NOT NULL, FK -> variation_tags.id ON DELETE CASCADE  |
| product_id | uuid | NOT NULL, FK -> master.id ON DELETE CASCADE          |

**Indexes:** idx_variation_tag_assignments_product(product_id)
**Unique (composite PK):** pk_variation_tag_assignments(tag_id, product_id)

### variation_group_assignments

Junction: which products belong to which groups (many-to-many).

| Column     | Type        | Constraints                                             |
|------------|-------------|---------------------------------------------------------|
| group_id   | uuid        | NOT NULL, FK -> variation_groups.id ON DELETE CASCADE     |
| product_id | uuid        | NOT NULL, FK -> master.id ON DELETE CASCADE               |
| created_at | timestamptz | NOT NULL, default now()                                  |

**Indexes:** idx_variation_group_assignments_product(product_id), idx_variation_group_assignments_group(group_id)
**Unique (composite PK):** pk_variation_group_assignments(group_id, product_id)

---

## Google Drive

### drive_folders

Registry of Google Drive folders per client.

| Column           | Type         | Constraints                          |
|------------------|--------------|--------------------------------------|
| id               | uuid         | PK, default random                   |
| client_id_code   | varchar(100) | NOT NULL                             |
| drive_folder_id  | text         | NOT NULL                             |
| folder_type      | text         | NOT NULL (root / content / aplus / listing_images / brand_story / documents) |
| path             | text         | NOT NULL                             |
| parent_folder_id | uuid         | (self-referencing FK via SQL migration) |
| name             | text         | NOT NULL                             |
| created_at       | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_drive_folders_client(client_id_code), idx_drive_folders_type(folder_type), idx_drive_folders_client_type(client_id_code, folder_type), idx_drive_folders_parent(parent_folder_id)

### drive_files

Tracks all files uploaded to Drive, with optional entity linkage.

| Column        | Type         | Constraints                                        |
|---------------|--------------|----------------------------------------------------|
| id            | uuid         | PK, default random                                 |
| drive_file_id | text         | NOT NULL                                           |
| folder_id     | uuid         | NOT NULL, FK -> drive_folders.id ON DELETE CASCADE   |
| original_name | text         | NOT NULL                                           |
| display_name  | text         | NOT NULL                                           |
| mime_type     | text         | NOT NULL                                           |
| size_bytes    | integer      |                                                    |
| entity_type   | text         |                                                    |
| entity_id     | uuid         |                                                    |
| uploaded_by   | text         | NOT NULL                                           |
| created_at    | timestamptz  | NOT NULL, default now()                            |

**Indexes:** idx_drive_files_folder(folder_id), idx_drive_files_entity(entity_type, entity_id), idx_drive_files_drive_id(drive_file_id)

---

## Sales & Finance

### sales_summary_cache

Pre-computed sales summary + inventory JSON responses.

| Column     | Type         | Constraints                          |
|------------|--------------|--------------------------------------|
| id         | serial       | PK                                   |
| cache_type | varchar(20)  | NOT NULL                             |
| cache_key  | text         | NOT NULL                             |
| data       | jsonb        | NOT NULL                             |
| created_at | timestamptz  | NOT NULL, default now()              |
| updated_at | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_sales_cache_updated(updated_at)
**Unique:** uq_sales_cache_type_key(cache_type, cache_key)

### content_impact_snapshots

Revenue attribution: captures sales metrics before/after content changes.

| Column              | Type                     | Constraints                                        |
|---------------------|--------------------------|----------------------------------------------------|
| id                  | serial                   | PK                                                 |
| client_id_code      | varchar(100)             | NOT NULL                                           |
| product_id          | uuid                     | FK -> master.id ON DELETE SET NULL                  |
| asin                | varchar(20)              |                                                    |
| change_type         | varchar(30)              | NOT NULL (product_edit / aplus_update / bulk_edit)  |
| change_summary      | text                     | NOT NULL                                           |
| change_count        | integer                  | NOT NULL, default 1                                |
| changed_by          | varchar(255)             | NOT NULL                                           |
| changed_at          | timestamptz              | NOT NULL, default now()                            |
| before_metrics      | jsonb (Record<string,number>) |                                               |
| after_metrics       | jsonb (Record<string,number>) |                                               |
| before_snapshot_at  | timestamptz              |                                                    |
| after_snapshot_at   | timestamptz              |                                                    |
| impact_window_days  | integer                  | NOT NULL, default 14                               |
| status              | impact_snapshot_status   | NOT NULL, default `'pending_before'`               |
| created_at          | timestamptz              | NOT NULL, default now()                            |

**Indexes:** idx_impact_snapshots_client(client_id_code), idx_impact_snapshots_product(product_id), idx_impact_snapshots_status(status), idx_impact_snapshots_changed_at(changed_at)

---

## Design Status

### design_status

| Column         | Type                 | Constraints                                        |
|----------------|----------------------|----------------------------------------------------|
| id             | serial               | PK                                                 |
| client_id_code | varchar(100)         | NOT NULL                                           |
| category       | design_category      | NOT NULL                                           |
| status         | design_status_value  | NOT NULL, default `'not_started'`                  |
| notes          | text                 |                                                    |
| updated_at     | timestamptz          | NOT NULL, default now()                            |
| updated_by     | varchar(255)         |                                                    |

**Indexes:** idx_design_status_client(client_id_code)
**Unique:** uq_design_status_client_category(client_id_code, category)

---

## Gantt (Client Onboarding Timeline)

### gantt_templates

| Column         | Type         | Constraints                          |
|----------------|--------------|--------------------------------------|
| id             | serial       | PK                                   |
| template_type  | client_type  | NOT NULL                             |
| section        | varchar(100) | NOT NULL                             |
| wbs            | varchar(10)  | NOT NULL                             |
| task_name      | varchar(255) | NOT NULL                             |
| subtask_title  | text         |                                      |
| description    | text         |                                      |
| week_start     | integer      | NOT NULL                             |
| week_end       | integer      | NOT NULL                             |
| start_day      | integer      | NOT NULL, default 1                  |
| duration_days  | integer      | NOT NULL, default 0                  |

**Indexes:** idx_gantt_templates_type(template_type)
**Unique:** uq_gantt_template_wbs(template_type, wbs)

### client_gantt_tasks

| Column           | Type               | Constraints                                             |
|------------------|--------------------|---------------------------------------------------------|
| id               | serial             | PK                                                      |
| client_id_code   | varchar(100)       | NOT NULL                                                |
| template_task_id | integer            | FK -> gantt_templates.id ON DELETE SET NULL              |
| wbs              | varchar(10)        | NOT NULL                                                |
| section          | varchar(100)       | NOT NULL                                                |
| task_name        | varchar(255)       | NOT NULL                                                |
| subtask_title    | text               |                                                         |
| week_start       | integer            | NOT NULL                                                |
| week_end         | integer            | NOT NULL                                                |
| start_day        | integer            | NOT NULL, default 1                                     |
| duration_days    | integer            | NOT NULL, default 0                                     |
| status           | gantt_task_status  | NOT NULL, default `'pending'`                           |
| completion_pct   | integer            | NOT NULL, default 0                                     |
| assigned_to      | varchar(255)       |                                                         |
| asana_task_gid   | varchar(100)       |                                                         |
| started_at       | timestamptz        |                                                         |
| completed_at     | timestamptz        |                                                         |
| notes            | text               |                                                         |
| portal_hidden    | boolean            | NOT NULL, default false                                 |
| created_at       | timestamptz        | NOT NULL, default now()                                 |
| updated_at       | timestamptz        | NOT NULL, default now()                                 |

**Indexes:** idx_gantt_tasks_client(client_id_code), idx_gantt_tasks_status(status)

---

## PPC (Pay-Per-Click)

### ppc_snapshots

| Column        | Type             | Constraints                          |
|---------------|------------------|--------------------------------------|
| id            | uuid             | PK, default random                   |
| client_id_code| varchar(50)      | NOT NULL                             |
| report_type   | ppc_report_type  | NOT NULL                             |
| snapshot_date | date             | NOT NULL                             |
| data          | jsonb            |                                      |
| summary       | jsonb            | NOT NULL                             |
| deltas        | jsonb            |                                      |
| created_at    | timestamptz      | NOT NULL, default now()              |

**Indexes:** ppc_snap_client_idx(client_id_code), ppc_snap_date_idx(snapshot_date)
**Unique:** ppc_snap_unique(client_id_code, report_type, snapshot_date)

### ppc_approvals

| Column        | Type                  | Constraints                                        |
|---------------|-----------------------|----------------------------------------------------|
| id            | uuid                  | PK, default random                                 |
| client_id_code| varchar(50)           | NOT NULL                                           |
| approval_type | varchar(100)          | NOT NULL                                           |
| description   | text                  | NOT NULL                                           |
| requested_at  | timestamptz           | NOT NULL, default now()                            |
| requested_by  | uuid                  | NOT NULL, FK -> users.id                           |
| approved_at   | timestamptz           |                                                    |
| approved_by   | uuid                  | FK -> users.id                                     |
| rejected_at   | timestamptz           |                                                    |
| rejected_by   | uuid                  | FK -> users.id                                     |
| status        | ppc_approval_status   | NOT NULL, default `'pending'`                      |

**Indexes:** ppc_appr_client_idx(client_id_code), ppc_appr_status_idx(status)

### ppc_decisions

| Column          | Type           | Constraints                                        |
|-----------------|----------------|----------------------------------------------------|
| id              | uuid           | PK, default random                                 |
| client_id_code  | varchar(50)    | NOT NULL                                           |
| decision        | text           | NOT NULL                                           |
| expected_outcome| text           |                                                    |
| expected_metric | varchar(50)    |                                                    |
| expected_value  | numeric(12,2)  |                                                    |
| actual_outcome  | text           |                                                    |
| actual_metric   | varchar(50)    |                                                    |
| actual_value    | numeric(12,2)  |                                                    |
| decided_at      | timestamptz    | NOT NULL, default now()                            |
| decided_by      | uuid           | NOT NULL, FK -> users.id                           |
| measured_at     | timestamptz    |                                                    |
| snapshot_id     | uuid           | FK -> ppc_snapshots.id                             |

**Indexes:** ppc_dec_client_idx(client_id_code)

### ppc_alerts

| Column          | Type               | Constraints                                        |
|-----------------|--------------------|----------------------------------------------------|
| id              | uuid               | PK, default random                                 |
| client_id_code  | varchar(50)        | NOT NULL                                           |
| alert_type      | ppc_alert_type     | NOT NULL                                           |
| severity        | ppc_alert_severity | NOT NULL                                           |
| message         | text               | NOT NULL                                           |
| data            | jsonb              |                                                    |
| created_at      | timestamptz        | NOT NULL, default now()                            |
| acknowledged_at | timestamptz        |                                                    |
| acknowledged_by | uuid               | FK -> users.id                                     |

**Indexes:** ppc_alert_client_idx(client_id_code), ppc_alert_type_idx(alert_type)

---

## Forecast Tool

### forecast_tool_versions

| Column               | Type         | Constraints                                        |
|----------------------|--------------|----------------------------------------------------|
| id                   | uuid         | PK, default random                                 |
| client_id_code       | varchar(100) | NOT NULL                                           |
| name                 | varchar(200) | NOT NULL                                           |
| created_by           | uuid         | FK -> users.id ON DELETE SET NULL                   |
| created_at           | timestamptz  | NOT NULL, default now()                            |
| is_current           | boolean      | NOT NULL, default false                            |
| historic_start       | varchar(7)   |                                                    |
| forecast_start       | varchar(7)   |                                                    |
| forecast_end         | varchar(7)   |                                                    |
| is_locked            | boolean      | NOT NULL, default false                            |
| historical_data      | jsonb        |                                                    |
| asin_historical_data | jsonb        |                                                    |
| seasonality_data     | jsonb        |                                                    |

**Indexes:** idx_ftv_client(client_id_code)

### forecast_tool_cells

| Column     | Type           | Constraints                                             |
|------------|----------------|---------------------------------------------------------|
| id         | uuid           | PK, default random                                      |
| version_id | uuid           | NOT NULL, FK -> forecast_tool_versions.id ON DELETE CASCADE |
| month      | varchar(7)     | NOT NULL                                                |
| metric     | varchar(50)    | NOT NULL                                                |
| value      | numeric(14,6)  |                                                         |

**Indexes:** idx_ftc_version(version_id)
**Unique:** uq_ftc_version_month_metric(version_id, month, metric)

### forecast_tool_asins

| Column                | Type           | Constraints                                             |
|-----------------------|----------------|---------------------------------------------------------|
| id                    | uuid           | PK, default random                                      |
| version_id            | uuid           | NOT NULL, FK -> forecast_tool_versions.id ON DELETE CASCADE |
| asin                  | varchar(20)    |                                                         |
| sku                   | varchar(100)   |                                                         |
| product_name          | varchar(300)   | NOT NULL                                                |
| product_price         | numeric(10,2)  | NOT NULL                                                |
| share_pct             | numeric(5,2)   | NOT NULL                                                |
| variation_attributes  | jsonb (Record<string,string>) |                                           |
| is_new                | boolean        | NOT NULL, default false                                 |
| sort_order            | integer        | NOT NULL, default 0                                     |

**Indexes:** idx_fta_version(version_id)

### forecast_tool_asin_cells

| Column  | Type           | Constraints                                             |
|---------|----------------|---------------------------------------------------------|
| id      | uuid           | PK, default random                                      |
| asin_id | uuid           | NOT NULL, FK -> forecast_tool_asins.id ON DELETE CASCADE  |
| month   | varchar(7)     | NOT NULL                                                |
| metric  | varchar(30)    | NOT NULL                                                |
| value   | numeric(14,2)  |                                                         |

**Indexes:** idx_ftac_asin(asin_id)
**Unique:** uq_ftac_asin_month_metric(asin_id, month, metric)

---

## Admin & Observability

### admin_event_log

Generic event log for tracking any action across all sections.

| Column         | Type         | Constraints                          |
|----------------|--------------|--------------------------------------|
| id             | serial       | PK                                   |
| user_email     | varchar(255) |                                      |
| user_name      | varchar(255) |                                      |
| section        | varchar(50)  | NOT NULL                             |
| action         | varchar(100) | NOT NULL                             |
| status         | varchar(20)  | NOT NULL, default `'success'`        |
| resource_type  | varchar(50)  |                                      |
| resource_id    | varchar(255) |                                      |
| resource_label | varchar(500) |                                      |
| message        | text         |                                      |
| detail         | jsonb        |                                      |
| duration_ms    | integer      |                                      |
| created_at     | timestamptz  | NOT NULL, default now()              |

**Indexes:** idx_admin_event_log_created(created_at), idx_admin_event_log_section(section), idx_admin_event_log_status(status), idx_admin_event_log_user(user_email)

### issue_reports

| Column           | Type                  | Constraints                          |
|------------------|-----------------------|--------------------------------------|
| id               | serial                | PK                                   |
| reported_by      | varchar(255)          | NOT NULL                             |
| reported_by_name | varchar(255)          |                                      |
| section          | varchar(100)          | NOT NULL                             |
| description      | text                  | NOT NULL                             |
| screenshot_url   | text                  |                                      |
| status           | issue_report_status   | NOT NULL, default `'pending'`        |
| admin_notes      | text                  |                                      |
| notes_seen       | boolean               | NOT NULL, default true               |
| resolved_by      | varchar(255)          |                                      |
| resolved_at      | timestamptz           |                                      |
| created_at       | timestamptz           | NOT NULL, default now()              |
| updated_at       | timestamptz           | NOT NULL, default now()              |

**Indexes:** idx_issue_reports_status(status), idx_issue_reports_reported_by(reported_by), idx_issue_reports_created(created_at)

---

## Support Tickets

### support_tickets

| Column           | Type                        | Constraints                                        |
|------------------|-----------------------------|----------------------------------------------------|
| id               | serial                      | PK                                                 |
| ticket_number    | varchar(20)                 | NOT NULL                                           |
| title            | varchar(255)                | NOT NULL                                           |
| description      | text                        | NOT NULL                                           |
| category         | support_ticket_category     | NOT NULL, default `'bug'`                          |
| priority         | support_ticket_priority     | NOT NULL, default `'medium'`                       |
| status           | support_ticket_status       | NOT NULL, default `'open'`                         |
| tags             | jsonb (string[])            | NOT NULL, default `[]`                             |
| assigned_to      | uuid                        | FK -> users.id ON DELETE SET NULL                  |
| reported_by      | varchar(255)                | NOT NULL                                           |
| reported_by_name | varchar(255)                |                                                    |
| screenshot_url   | text                        |                                                    |
| section          | varchar(100)                |                                                    |
| escalation_level | integer                     | NOT NULL, default 0                                |
| sla_deadline     | timestamptz                 |                                                    |
| internal_notes   | jsonb (array of note objects) | NOT NULL, default `[]`                           |
| resolved_by      | varchar(255)                |                                                    |
| resolved_at      | timestamptz                 |                                                    |
| created_at       | timestamptz                 | NOT NULL, default now()                            |
| updated_at       | timestamptz                 | NOT NULL, default now()                            |

**Indexes:** idx_support_tickets_status(status), idx_support_tickets_priority(priority), idx_support_tickets_assigned(assigned_to), idx_support_tickets_created(created_at), idx_support_tickets_sla(sla_deadline)
