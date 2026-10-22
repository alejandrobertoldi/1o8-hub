# Redshift Schema Report

**Summary:** 6 schemas, 184 tables, 4626 total columns

Database: `data_platform` @ `analytics.intentwise.com:5439`

---

## Schema: `amazon_marketing_cloud` (15 tables)

### `amazon_marketing_cloud.ad_attributed_branded_searches` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `campaign_id` | character varying |
| 9 | `campaign_name` | character varying |
| 10 | `impressions` | bigint |
| 11 | `impression_cost` | numeric |
| 12 | `number_of_branded_searches` | integer |
| 13 | `branded_search_rate` | numeric |
| 14 | `cost_per_branded_search` | numeric |
| 15 | `instance_id` | character varying |
| 16 | `instance_name` | character varying |
| 17 | `query_title` | character varying |
| 18 | `sub_brand` | character varying |

### `amazon_marketing_cloud.asin_purchase_overlap_upsell` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `lead_asin` | character varying |
| 9 | `lead_asin_purchases` | integer |
| 10 | `distinct_lead_asin_purchased_user_count` | integer |
| 11 | `overlap_asin` | character varying |
| 12 | `distinct_lead_and_overlap_asin_purchased_user_count` | integer |
| 13 | `user_overlap` | numeric |
| 14 | `instance_id` | character varying |
| 15 | `instance_name` | character varying |
| 16 | `query_title` | character varying |
| 17 | `sub_brand` | character varying |

### `amazon_marketing_cloud.dsp_campaign_perf_by_geo` (25 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `campaign_id` | character varying |
| 9 | `campaign_name` | character varying |
| 10 | `dma_code` | character varying |
| 11 | `iso_country_code` | character varying |
| 12 | `iso_state_province_code` | character varying |
| 13 | `unique_users_reached` | integer |
| 14 | `unique_users_purchased` | integer |
| 15 | `impressions` | integer |
| 16 | `impression_cost` | numeric |
| 17 | `total_cost` | numeric |
| 18 | `purchases` | integer |
| 19 | `product_sales` | numeric |
| 20 | `add_to_cart` | integer |
| 21 | `detail_page_view` | integer |
| 22 | `instance_id` | character varying |
| 23 | `instance_name` | character varying |
| 24 | `query_title` | character varying |
| 25 | `sub_brand` | character varying |

### `amazon_marketing_cloud.dsp_reach_impression_frequency` (19 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `campaign_id` | character varying |
| 9 | `campaign_name` | character varying |
| 10 | `frequency_buckets` | character varying |
| 11 | `users_in_bucket` | integer |
| 12 | `impressions_in_bucket` | bigint |
| 13 | `impression_cost` | numeric |
| 14 | `instance_id` | character varying |
| 15 | `instance_name` | character varying |
| 16 | `query_title` | character varying |
| 17 | `sub_brand` | character varying |
| 18 | `purchases` | integer |
| 19 | `total_purchases` | integer |

### `amazon_marketing_cloud.multi_touch_attribution_analysis` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `ad_product_type` | character varying |
| 9 | `mta_conversions` | integer |
| 10 | `mta_revenue` | numeric |
| 11 | `first_touch_conversions` | integer |
| 12 | `first_touch_revenue` | numeric |
| 13 | `last_touch_conversions` | integer |
| 14 | `last_touch_revenue` | numeric |
| 15 | `linear_touch_conversions` | integer |
| 16 | `linear_touch_revenue` | numeric |
| 17 | `spend` | numeric |
| 18 | `mta_roas` | numeric |
| 19 | `first_touch_roas` | numeric |
| 20 | `last_touch_roas` | numeric |
| 21 | `linear_touch_roas` | numeric |
| 22 | `instance_id` | character varying |
| 23 | `instance_name` | character varying |
| 24 | `query_title` | character varying |

### `amazon_marketing_cloud.new_to_brand_customers` (34 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `ad_product_type` | character varying |
| 9 | `all_users_with_purchase` | integer |
| 10 | `impressions` | bigint |
| 11 | `clicks` | integer |
| 12 | `total_cost` | numeric |
| 13 | `purchases` | integer |
| 14 | `total_purchases` | integer |
| 15 | `product_sales` | numeric |
| 16 | `total_product_sales` | numeric |
| 17 | `units_sold` | integer |
| 18 | `total_units_sold` | integer |
| 19 | `conversions` | integer |
| 20 | `brand_halo_product_sales` | numeric |
| 21 | `brand_halo_purchases` | integer |
| 22 | `brand_halo_units_sold` | integer |
| 23 | `new_to_brand_total_purchases_clicks` | integer |
| 24 | `new_to_brand_total_purchases_views` | bigint |
| 25 | `new_to_brand_total_product_sales` | numeric |
| 26 | `new_to_brand_total_purchases` | integer |
| 27 | `new_to_brand_total_units_sold` | integer |
| 28 | `ntb_users` | integer |
| 29 | `campaign_name` | character varying |
| 30 | `campaign_id` | character varying |
| 31 | `instance_id` | character varying |
| 32 | `instance_name` | character varying |
| 33 | `query_title` | character varying |
| 34 | `sub_brand` | character varying |

### `amazon_marketing_cloud.new_to_brand_purchases` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `ad_product_type` | character varying |
| 9 | `campaign_id` | character varying |
| 10 | `campaign_name` | character varying |
| 11 | `new_to_brand_purchases` | integer |
| 12 | `non_new_to_brand_purchases` | integer |
| 13 | `new_to_brand_purchases_percentage` | numeric |
| 14 | `new_to_brand_product_sales` | numeric |
| 15 | `non_new_to_brand_product_sales` | numeric |
| 16 | `new_to_brand_product_sales_percentage` | numeric |
| 17 | `instance_id` | character varying |
| 18 | `instance_name` | character varying |
| 19 | `query_title` | character varying |
| 20 | `sub_brand` | character varying |

### `amazon_marketing_cloud.ntb_gateway_asins` (21 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `tracked_asin` | character varying |
| 9 | `all_users_with_purchase` | integer |
| 10 | `ntb_users` | integer |
| 11 | `ntb_percentage` | numeric |
| 12 | `gateway_asin_rank` | integer |
| 13 | `ad_product_type` | character varying |
| 14 | `instance_id` | character varying |
| 15 | `instance_name` | character varying |
| 16 | `query_title` | character varying |
| 17 | `sub_brand` | character varying |
| 18 | `ntb_total_product_sales` | numeric |
| 19 | `total_product_sales` | numeric |
| 20 | `ntb_total_units_sold` | integer |
| 21 | `total_units_sold` | integer |

### `amazon_marketing_cloud.path_to_conversion` (31 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `path` | character varying |
| 9 | `path_occurrences` | integer |
| 10 | `users_that_purchased` | integer |
| 11 | `ntb_users_that_purchased` | integer |
| 12 | `impressions` | bigint |
| 13 | `clicks` | integer |
| 14 | `total_cost` | numeric |
| 15 | `purchases` | integer |
| 16 | `total_purchases` | integer |
| 17 | `product_sales` | numeric |
| 18 | `total_product_sales` | numeric |
| 19 | `units_sold` | integer |
| 20 | `total_units_sold` | integer |
| 21 | `conversions` | integer |
| 22 | `brand_halo_product_sales` | numeric |
| 23 | `brand_halo_purchases` | integer |
| 24 | `brand_halo_units_sold` | integer |
| 25 | `new_to_brand_total_product_sales` | numeric |
| 26 | `new_to_brand_total_purchases` | integer |
| 27 | `new_to_brand_total_units_sold` | integer |
| 28 | `instance_id` | character varying |
| 29 | `instance_name` | character varying |
| 30 | `query_title` | character varying |
| 31 | `sub_brand` | character varying |

### `amazon_marketing_cloud.sd_dsp_overlap` (30 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `exposure_group` | character varying |
| 9 | `unique_reach` | bigint |
| 10 | `impressions` | bigint |
| 11 | `clicks` | integer |
| 12 | `users_that_purchased` | integer |
| 13 | `total_cost` | numeric |
| 14 | `purchases` | integer |
| 15 | `total_purchases` | integer |
| 16 | `product_sales` | numeric |
| 17 | `total_product_sales` | numeric |
| 18 | `units_sold` | integer |
| 19 | `total_units_sold` | integer |
| 20 | `conversions` | integer |
| 21 | `brand_halo_product_sales` | numeric |
| 22 | `brand_halo_purchases` | integer |
| 23 | `brand_halo_units_sold` | integer |
| 24 | `new_to_brand_total_product_sales` | numeric |
| 25 | `new_to_brand_total_purchases` | integer |
| 26 | `new_to_brand_total_units_sold` | integer |
| 27 | `instance_id` | character varying |
| 28 | `instance_name` | character varying |
| 29 | `query_title` | character varying |
| 30 | `sub_brand` | character varying |

### `amazon_marketing_cloud.shopper_funnel` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `user_type` | character varying |
| 9 | `impression_users` | integer |
| 10 | `impressions` | bigint |
| 11 | `click_users` | integer |
| 12 | `clicks` | integer |
| 13 | `converted_users` | integer |
| 14 | `total_spend` | numeric |
| 15 | `customer_acquisition_cost` | numeric |
| 16 | `instance_id` | character varying |
| 17 | `instance_name` | character varying |
| 18 | `query_title` | character varying |

### `amazon_marketing_cloud.sp_sd_overlap` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `exposure_group` | character varying |
| 9 | `unique_reach` | integer |
| 10 | `users_that_purchased` | integer |
| 11 | `purchases` | integer |
| 12 | `instance_id` | character varying |
| 13 | `instance_name` | character varying |
| 14 | `query_title` | character varying |
| 15 | `sub_brand` | character varying |

### `amazon_marketing_cloud.sponsored_ads_dsp_streamingtv_overlap` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `query_title` | character varying |
| 9 | `exposure_group` | character varying |
| 10 | `users_that_purchased` | integer |
| 11 | `unique_reach` | bigint |
| 12 | `total_purchases` | integer |
| 13 | `total_product_sales` | numeric |
| 14 | `instance_id` | character varying |
| 15 | `instance_name` | character varying |
| 16 | `sub_brand` | character varying |

### `amazon_marketing_cloud.tentpole_phase_overlap` (39 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `tentpole_strategies` | character varying |
| 9 | `duration_days` | integer |
| 10 | `impressions` | bigint |
| 11 | `unique_reach_purchase` | integer |
| 12 | `unique_reach_dpv` | integer |
| 13 | `unique_viewers` | integer |
| 14 | `users_that_purchased` | integer |
| 15 | `ntb_users_that_purchased` | integer |
| 16 | `detail_page_view` | integer |
| 17 | `total_detail_page_view` | integer |
| 18 | `total_product_sales` | numeric |
| 19 | `product_sales` | numeric |
| 20 | `new_to_brand_product_sales` | numeric |
| 21 | `units_sold` | integer |
| 22 | `new_to_brand_units_sold` | integer |
| 23 | `total_units_sold` | integer |
| 24 | `purchases` | integer |
| 25 | `new_to_brand_purchases` | integer |
| 26 | `total_purchases` | integer |
| 27 | `total_cost` | numeric |
| 28 | `roas` | numeric |
| 29 | `unique_reach_percentage` | numeric |
| 30 | `sales_percentage` | numeric |
| 31 | `unique_ntb_purchasers_percentage` | numeric |
| 32 | `average_daily_impressions` | numeric |
| 33 | `detail_page_view_rate` | numeric |
| 34 | `purchase_rate` | numeric |
| 35 | `new_to_brand_rate` | numeric |
| 36 | `instance_id` | character varying |
| 37 | `instance_name` | character varying |
| 38 | `query_title` | character varying |
| 39 | `sub_brand` | character varying |

### `amazon_marketing_cloud.time_to_conversion` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `analysis_date` | date |
| 5 | `report_start_date` | date |
| 6 | `report_end_date` | date |
| 7 | `lookback_window` | integer |
| 8 | `ad_product_type` | character varying |
| 9 | `campaign_id` | character varying |
| 10 | `campaign_name` | character varying |
| 11 | `time_to_conversion_in_seconds` | integer |
| 12 | `time_to_conversion` | character varying |
| 13 | `purchases` | integer |
| 14 | `total_purchases` | integer |
| 15 | `product_sales` | numeric |
| 16 | `total_product_sales` | numeric |
| 17 | `units_sold` | integer |
| 18 | `total_units_sold` | integer |
| 19 | `ntb_users_that_purchased` | integer |
| 20 | `users_that_purchased` | integer |
| 21 | `instance_id` | character varying |
| 22 | `instance_name` | character varying |
| 23 | `query_title` | character varying |
| 24 | `sub_brand` | character varying |

---

## Schema: `amazon_source_data` (111 tables)

### `amazon_source_data.account` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `organization_name` | character varying |
| 4 | `amazon_profile_id` | bigint |
| 5 | `region` | character varying |
| 6 | `country_code` | character varying |
| 7 | `currency_code` | character varying |
| 8 | `market_place` | character varying |
| 9 | `brand_id` | character varying |
| 10 | `brand_type` | character varying |
| 11 | `vendor_name` | character varying |
| 12 | `organization_id` | bigint |

### `amazon_source_data.ad_marketingstream_budgetusage` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `advertiser_id` | character varying |
| 5 | `marketplace_id` | character varying |
| 6 | `usage_updated_timestamp` | timestamp without time zone |
| 7 | `budget_scope_id` | character varying |
| 8 | `budget_scope_type` | character varying |
| 9 | `advertising_product_type` | character varying |
| 10 | `budget` | numeric |
| 11 | `budget_usage_percentage` | numeric |
| 12 | `download_time` | timestamp with time zone |

### `amazon_source_data.ad_marketingstream_conversions` (39 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `advertiser_id` | character varying |
| 5 | `marketplace_id` | character varying |
| 6 | `time_window_start` | timestamp without time zone |
| 7 | `currency` | character varying |
| 8 | `ad_id` | bigint |
| 9 | `placement` | character varying |
| 10 | `campaign_id` | bigint |
| 11 | `ad_group_id` | bigint |
| 12 | `keyword_id` | bigint |
| 13 | `keyword_text` | character varying |
| 14 | `match_type` | character varying |
| 15 | `attributed_conversions_1d` | bigint |
| 16 | `attributed_conversions_7d` | bigint |
| 17 | `attributed_conversions_14d` | bigint |
| 18 | `attributed_conversions_30d` | bigint |
| 19 | `attributed_conversions_1d_same_sku` | bigint |
| 20 | `attributed_conversions_7d_same_sku` | bigint |
| 21 | `attributed_conversions_14d_same_sku` | bigint |
| 22 | `attributed_conversions_30d_same_sku` | bigint |
| 23 | `attributed_sales_1d` | numeric |
| 24 | `attributed_sales_7d` | numeric |
| 25 | `attributed_sales_14d` | numeric |
| 26 | `attributed_sales_30d` | numeric |
| 27 | `attributed_sales_1d_same_sku` | numeric |
| 28 | `attributed_sales_7d_same_sku` | numeric |
| 29 | `attributed_sales_14d_same_sku` | numeric |
| 30 | `attributed_sales_30d_same_sku` | numeric |
| 31 | `attributed_units_ordered_1d` | bigint |
| 32 | `attributed_units_ordered_7d` | bigint |
| 33 | `attributed_units_ordered_14d` | bigint |
| 34 | `attributed_units_ordered_30d` | bigint |
| 35 | `attributed_units_ordered_1d_same_sku` | bigint |
| 36 | `attributed_units_ordered_7d_same_sku` | bigint |
| 37 | `attributed_units_ordered_14d_same_sku` | bigint |
| 38 | `attributed_units_ordered_30d_same_sku` | bigint |
| 39 | `download_time` | timestamp with time zone |

### `amazon_source_data.ad_marketingstream_sponsoreddisplay_conversions` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `advertiser_id` | character varying |
| 5 | `marketplace_id` | character varying |
| 6 | `time_window_start` | timestamp without time zone |
| 7 | `currency` | character varying |
| 8 | `ad_id` | bigint |
| 9 | `campaign_id` | bigint |
| 10 | `ad_group_id` | bigint |
| 11 | `target_id` | bigint |
| 12 | `attributed_conversions_14d` | bigint |
| 13 | `attributed_sales_14d` | numeric |
| 14 | `attributed_units_ordered_14d` | bigint |
| 15 | `attributed_units_ordered_new_to_brand_14d` | bigint |
| 16 | `attributed_sales_new_to_brand_14d` | numeric |
| 17 | `attributed_orders_new_to_brand_14d` | bigint |
| 18 | `view_attributed_conversions_14d` | bigint |
| 19 | `view_attributed_sales_14d` | numeric |
| 20 | `view_attributed_units_ordered_14d` | bigint |
| 21 | `view_attributed_units_ordered_new_to_brand_14d` | bigint |
| 22 | `view_attributed_sales_new_to_brand_14d` | numeric |
| 23 | `view_attributed_orders_new_to_brand_14d` | bigint |
| 24 | `download_time` | timestamp with time zone |

### `amazon_source_data.ad_marketingstream_sponsoreddisplay_traffic` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `advertiser_id` | character varying |
| 5 | `marketplace_id` | character varying |
| 6 | `impressions` | bigint |
| 7 | `time_window_start` | timestamp without time zone |
| 8 | `currency` | character varying |
| 9 | `campaign_id` | bigint |
| 10 | `ad_group_id` | bigint |
| 11 | `ad_id` | bigint |
| 12 | `target_id` | bigint |
| 13 | `targeting_text` | character varying |
| 14 | `cost` | numeric |
| 15 | `clicks` | bigint |
| 16 | `view_impressions` | bigint |
| 17 | `download_time` | timestamp with time zone |

### `amazon_source_data.ad_marketingstream_traffic` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `advertiser_id` | character varying |
| 5 | `marketplace_id` | character varying |
| 6 | `impressions` | bigint |
| 7 | `time_window_start` | timestamp without time zone |
| 8 | `currency` | character varying |
| 9 | `ad_id` | bigint |
| 10 | `placement` | character varying |
| 11 | `campaign_id` | bigint |
| 12 | `ad_group_id` | bigint |
| 13 | `keyword_id` | bigint |
| 14 | `keyword_text` | character varying |
| 15 | `match_type` | character varying |
| 16 | `cost` | numeric |
| 17 | `clicks` | bigint |
| 18 | `download_time` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_ad` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `state` | character varying |
| 8 | `creationdate` | timestamp with time zone |
| 9 | `lastupdateddate` | timestamp with time zone |
| 10 | `servingstatus` | character varying |
| 11 | `brandname` | character varying |
| 12 | `headline` | character varying |
| 13 | `type` | character varying |
| 14 | `landingpagepagetype` | character varying |
| 15 | `landingpageurl` | character varying |
| 16 | `name` | character varying |
| 17 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_ad_asin` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adid` | bigint |
| 5 | `asin` | character varying |
| 6 | `creationdate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_ad_report` (35 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `adid` | bigint |
| 6 | `adgroupid` | bigint |
| 7 | `campaignid` | bigint |
| 8 | `impressions` | bigint |
| 9 | `clicks` | bigint |
| 10 | `cost` | numeric |
| 11 | `attributedsales14dsamesku` | numeric |
| 12 | `attributedsales14d` | numeric |
| 13 | `attributedconversions14dsamesku` | bigint |
| 14 | `attributedconversions14d` | bigint |
| 15 | `attributeddetailpageviewsclicks14d` | bigint |
| 16 | `attributedordersnewtobrand14d` | bigint |
| 17 | `attributedordersnewtobrandpercentage14d` | numeric |
| 18 | `attributedorderratenewtobrand14d` | numeric |
| 19 | `attributedsalesnewtobrand14d` | numeric |
| 20 | `attributedsalesnewtobrandpercentage14d` | numeric |
| 21 | `attributedunitsorderednewtobrand14d` | bigint |
| 22 | `attributedunitsorderednewtobrandpercentage14d` | numeric |
| 23 | `viewableimpressions` | bigint |
| 24 | `videofirstquartileviews` | bigint |
| 25 | `videomidpointviews` | bigint |
| 26 | `videothirdquartileviews` | bigint |
| 27 | `videocompleteviews` | bigint |
| 28 | `video5secondviews` | bigint |
| 29 | `video5secondviewrate` | numeric |
| 30 | `videounmutes` | bigint |
| 31 | `vtr` | numeric |
| 32 | `vctr` | numeric |
| 33 | `unitssold14d` | bigint |
| 34 | `dpv14d` | bigint |
| 35 | `attributedbrandedsearches14d` | bigint |

### `amazon_source_data.ad_sponsoredbrand_campaign` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `campaignid` | bigint |
| 5 | `name` | character varying |
| 6 | `budget` | numeric |
| 7 | `startdate` | date |
| 8 | `enddate` | date |
| 9 | `state` | character varying |
| 10 | `portfolioid` | bigint |
| 11 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_campaign_report` (35 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `campaignid` | bigint |
| 6 | `campaignname` | character varying |
| 7 | `campaignstatus` | character varying |
| 8 | `campaignbudget` | numeric |
| 9 | `impressions` | bigint |
| 10 | `clicks` | integer |
| 11 | `cost` | numeric |
| 12 | `attributedsales14dsamesku` | numeric |
| 13 | `attributedsales14d` | numeric |
| 14 | `attributedconversions14dsamesku` | integer |
| 15 | `attributedconversions14d` | integer |
| 16 | `attributedunitsordered14d` | integer |
| 17 | `attributedordersnewtobrand14d` | bigint |
| 18 | `attributedordersnewtobrandpercentage14d` | numeric |
| 19 | `attributedorderratenewtobrand14d` | numeric |
| 20 | `attributedsalesnewtobrandpercentage14d` | numeric |
| 21 | `attributedunitsorderednewtobrand14d` | bigint |
| 22 | `attributedunitsorderednewtobrandpercentage14d` | numeric |
| 23 | `attributedsalesnewtobrand14d` | numeric |
| 24 | `viewableimpressions` | bigint |
| 25 | `videofirstquartileviews` | bigint |
| 26 | `videomidpointviews` | bigint |
| 27 | `videothirdquartileviews` | bigint |
| 28 | `videocompleteviews` | bigint |
| 29 | `video5secondviews` | bigint |
| 30 | `video5secondviewrate` | numeric |
| 31 | `videounmutes` | bigint |
| 32 | `vtr` | numeric |
| 33 | `vctr` | numeric |
| 34 | `unitssold14d` | bigint |
| 35 | `dpv14d` | bigint |

### `amazon_source_data.ad_sponsoredbrand_keyword_report` (28 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `region` | character |
| 2 | `profile_id` | bigint |
| 3 | `account_id` | bigint |
| 4 | `account_name` | character varying |
| 5 | `reportdate` | date |
| 6 | `keywordid` | bigint |
| 7 | `adgroupid` | bigint |
| 8 | `impressions` | bigint |
| 9 | `clicks` | integer |
| 10 | `cost` | numeric |
| 11 | `attributedsales14dsamesku` | numeric |
| 12 | `attributedsales14d` | numeric |
| 13 | `attributedconversions14dsamesku` | integer |
| 14 | `attributedconversions14d` | integer |
| 15 | `attributedunitsordered14d` | integer |
| 16 | `viewableimpressions` | bigint |
| 17 | `videofirstquartileviews` | bigint |
| 18 | `videomidpointviews` | bigint |
| 19 | `videothirdquartileviews` | bigint |
| 20 | `videocompleteviews` | bigint |
| 21 | `video5secondviews` | bigint |
| 22 | `video5secondviewrate` | numeric |
| 23 | `videounmutes` | bigint |
| 24 | `vtr` | numeric |
| 25 | `vctr` | numeric |
| 26 | `unitssold14d` | bigint |
| 27 | `dpv14d` | bigint |
| 28 | `topofsearchimpressionshare` | numeric |

### `amazon_source_data.ad_sponsoredbrand_keywordsearchterm_report` (22 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `keywordtext` | character varying |
| 6 | `matchtype` | character varying |
| 7 | `campaignid` | bigint |
| 8 | `adgroupid` | bigint |
| 9 | `reportdate` | date |
| 10 | `query` | character varying |
| 11 | `impressions` | bigint |
| 12 | `clicks` | integer |
| 13 | `cost` | numeric |
| 14 | `attributedsales14dsamesku` | numeric |
| 15 | `attributedsales14d` | numeric |
| 16 | `attributedconversions14dsamesku` | integer |
| 17 | `attributedconversions14d` | integer |
| 18 | `attributedunitsordered14d` | integer |
| 19 | `searchtermimpressionrank` | integer |
| 20 | `searchtermimpressionshare` | numeric |
| 21 | `impressionswithshare` | bigint |
| 22 | `totalimpressions` | bigint |

### `amazon_source_data.ad_sponsoredbrand_negativekeyword` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `campaignid` | bigint |
| 6 | `adgroupid` | bigint |
| 7 | `state` | character varying |
| 8 | `keywordtext` | character varying |
| 9 | `matchtype` | character varying |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `servingstatus` | character varying |
| 13 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_producttargetsearchterm_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `campaignid` | bigint |
| 6 | `adgroupid` | bigint |
| 7 | `reportdate` | date |
| 8 | `query` | character varying |
| 9 | `impressions` | bigint |
| 10 | `clicks` | integer |
| 11 | `cost` | numeric |
| 12 | `attributedsales14dsamesku` | numeric |
| 13 | `attributedsales14d` | numeric |
| 14 | `attributedconversions14dsamesku` | integer |
| 15 | `attributedconversions14d` | integer |
| 16 | `attributedunitsordered14d` | integer |
| 17 | `searchtermimpressionrank` | integer |
| 18 | `searchtermimpressionshare` | numeric |
| 19 | `impressionswithshare` | bigint |
| 20 | `totalimpressions` | bigint |

### `amazon_source_data.ad_sponsoredbrand_target` (22 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `expressiontype` | character varying |
| 8 | `state` | character varying |
| 9 | `bid` | numeric |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `autoexpressionvalue` | character varying |
| 13 | `asinpricelessthan` | numeric |
| 14 | `asinpricegreaterthan` | numeric |
| 15 | `asinreviewratinglessthan` | numeric |
| 16 | `asinreviewratinggreaterthan` | numeric |
| 17 | `asincategorysameas` | character varying |
| 18 | `asinbrandsameas` | character varying |
| 19 | `asinpricebetween` | character varying |
| 20 | `asinreviewratingbetween` | character varying |
| 21 | `asinsameas` | character varying |
| 22 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredbrand_target_report` (26 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `targetid` | bigint |
| 6 | `impressions` | bigint |
| 7 | `clicks` | integer |
| 8 | `cost` | numeric |
| 9 | `attributedsales14dsamesku` | numeric |
| 10 | `attributedsales14d` | numeric |
| 11 | `attributedconversions14dsamesku` | integer |
| 12 | `attributedconversions14d` | integer |
| 13 | `attributedunitsordered14d` | integer |
| 14 | `is_video` | boolean |
| 15 | `viewableimpressions` | bigint |
| 16 | `videofirstquartileviews` | bigint |
| 17 | `videomidpointviews` | bigint |
| 18 | `videothirdquartileviews` | bigint |
| 19 | `videocompleteviews` | bigint |
| 20 | `video5secondviews` | bigint |
| 21 | `video5secondviewrate` | numeric |
| 22 | `videounmutes` | bigint |
| 23 | `vtr` | numeric |
| 24 | `vctr` | numeric |
| 25 | `unitssold14d` | bigint |
| 26 | `dpv14d` | bigint |

### `amazon_source_data.ad_sponsoreddisplay_adgroup` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adgroupid` | bigint |
| 5 | `name` | character varying |
| 6 | `campaignid` | bigint |
| 7 | `defaultbid` | numeric |
| 8 | `state` | character varying |
| 9 | `creationdate` | timestamp with time zone |
| 10 | `lastupdateddate` | timestamp with time zone |
| 11 | `servingstatus` | character varying |
| 12 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoreddisplay_adgroup_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `adgroupid` | bigint |
| 6 | `adgroupname` | character varying |
| 7 | `campaignid` | bigint |
| 8 | `campaignname` | character varying |
| 9 | `impressions` | bigint |
| 10 | `clicks` | integer |
| 11 | `cost` | numeric |
| 12 | `attributedsales14dsamesku` | numeric |
| 13 | `attributedsales14d` | numeric |
| 14 | `attributedconversions14dsamesku` | integer |
| 15 | `attributedconversions14d` | integer |
| 16 | `attributedunitsordered14d` | integer |
| 17 | `viewimpressions` | bigint |
| 18 | `viewattributedconversions14d` | bigint |
| 19 | `viewattributedsales14d` | numeric |
| 20 | `viewattributedunitsordered14d` | bigint |

### `amazon_source_data.ad_sponsoreddisplay_campaign` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `campaignid` | bigint |
| 5 | `name` | character varying |
| 6 | `tactic` | character varying |
| 7 | `budgettype` | character varying |
| 8 | `budget` | numeric |
| 9 | `startdate` | date |
| 10 | `enddate` | date |
| 11 | `state` | character varying |
| 12 | `portfolioid` | bigint |
| 13 | `servingstatus` | character varying |
| 14 | `costtype` | character varying |
| 15 | `creationdate` | timestamp with time zone |
| 16 | `lastupdateddate` | timestamp with time zone |
| 17 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoreddisplay_productads` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `asin` | character varying |
| 8 | `sku` | character varying |
| 9 | `state` | character varying |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `servingstatus` | character varying |
| 13 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoreddisplay_target` (28 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `expressiontype` | character varying |
| 8 | `state` | character varying |
| 9 | `bid` | numeric |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `autoexpressionvalue` | character varying |
| 13 | `asinpricelessthan` | numeric |
| 14 | `asinpricegreaterthan` | numeric |
| 15 | `asinreviewratinglessthan` | numeric |
| 16 | `asinreviewratinggreaterthan` | numeric |
| 17 | `asincategorysameas` | character varying |
| 18 | `asinbrandsameas` | character varying |
| 19 | `asinpricebetween` | character varying |
| 20 | `asinreviewratingbetween` | character varying |
| 21 | `asinsameas` | character varying |
| 22 | `asinisprimeshippingeligible` | character varying |
| 23 | `asinagerangesameas` | character varying |
| 24 | `asingenresameas` | character varying |
| 25 | `servingstatus` | character varying |
| 26 | `views` | character varying |
| 27 | `lookback` | bigint |
| 28 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoreddisplay_target_report` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `targetid` | bigint |
| 6 | `impressions` | bigint |
| 7 | `clicks` | integer |
| 8 | `cost` | numeric |
| 9 | `attributedsales14dsamesku` | numeric |
| 10 | `attributedsales14d` | numeric |
| 11 | `attributedconversions14dsamesku` | integer |
| 12 | `attributedconversions14d` | integer |
| 13 | `attributedunitsordered14d` | integer |
| 14 | `viewimpressions` | bigint |
| 15 | `viewattributedconversions14d` | bigint |
| 16 | `viewattributedsales14d` | numeric |
| 17 | `viewattributedunitsordered14d` | bigint |
| 18 | `attributedsalesnewtobrand14d` | numeric |
| 19 | `attributedordersnewtobrand14d` | bigint |
| 20 | `attributedunitsorderednewtobrand14d` | bigint |
| 21 | `newtobranddetailpageviews` | bigint |
| 22 | `newtobranddetailpageviewclicks` | bigint |
| 23 | `newtobranddetailpageviewrate` | numeric |
| 24 | `newtobrandecpdetailpageview` | numeric |

### `amazon_source_data.ad_sponsoredproducts_adgroup` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adgroupid` | bigint |
| 5 | `name` | character varying |
| 6 | `campaignid` | bigint |
| 7 | `defaultbid` | numeric |
| 8 | `state` | character varying |
| 9 | `creationdate` | timestamp with time zone |
| 10 | `lastupdateddate` | timestamp with time zone |
| 11 | `servingstatus` | character varying |
| 12 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredproducts_autosearchterm_report` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `targetexpression` | character varying |
| 6 | `campaignid` | bigint |
| 7 | `adgroupid` | bigint |
| 8 | `reportdate` | date |
| 9 | `query` | character varying |
| 10 | `impressions` | bigint |
| 11 | `clicks` | integer |
| 12 | `cost` | numeric |
| 13 | `attributedsales14dsamesku` | numeric |
| 14 | `attributedsales14d` | numeric |
| 15 | `attributedconversions14dsamesku` | integer |
| 16 | `attributedconversions14d` | integer |
| 17 | `attributedunitsordered14d` | integer |

### `amazon_source_data.ad_sponsoredproducts_campaignnegativekeyword` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `campaignid` | bigint |
| 6 | `state` | character varying |
| 7 | `keywordtext` | character varying |
| 8 | `matchtype` | character varying |
| 9 | `creationdate` | timestamp with time zone |
| 10 | `lastupdateddate` | timestamp with time zone |
| 11 | `servingstatus` | character varying |
| 12 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredproducts_keyword` (14 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `state` | character varying |
| 8 | `keywordtext` | character varying |
| 9 | `matchtype` | character varying |
| 10 | `bid` | numeric |
| 11 | `creationdate` | timestamp with time zone |
| 12 | `lastupdateddate` | timestamp with time zone |
| 13 | `servingstatus` | character varying |
| 14 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredproducts_keyword_report` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `region` | character |
| 2 | `profile_id` | bigint |
| 3 | `account_id` | bigint |
| 4 | `account_name` | character varying |
| 5 | `reportdate` | date |
| 6 | `keywordid` | bigint |
| 7 | `adgroupid` | bigint |
| 8 | `impressions` | bigint |
| 9 | `clicks` | integer |
| 10 | `cost` | numeric |
| 11 | `attributedsales14dsamesku` | numeric |
| 12 | `attributedsales14d` | numeric |
| 13 | `attributedconversions14dsamesku` | integer |
| 14 | `attributedconversions14d` | integer |
| 15 | `attributedunitsordered14d` | integer |
| 16 | `topofsearchimpressionshare` | numeric |

### `amazon_source_data.ad_sponsoredproducts_keywordsearchterm_report` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `keywordtext` | character varying |
| 6 | `matchtype` | character varying |
| 7 | `campaignid` | bigint |
| 8 | `adgroupid` | bigint |
| 9 | `reportdate` | date |
| 10 | `query` | character varying |
| 11 | `impressions` | bigint |
| 12 | `clicks` | integer |
| 13 | `cost` | numeric |
| 14 | `attributedsales14dsamesku` | numeric |
| 15 | `attributedsales14d` | numeric |
| 16 | `attributedconversions14dsamesku` | integer |
| 17 | `attributedconversions14d` | integer |
| 18 | `attributedunitsordered14d` | integer |

### `amazon_source_data.ad_sponsoredproducts_negativekeyword` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `keywordid` | bigint |
| 5 | `campaignid` | bigint |
| 6 | `adgroupid` | bigint |
| 7 | `state` | character varying |
| 8 | `keywordtext` | character varying |
| 9 | `matchtype` | character varying |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `servingstatus` | character varying |
| 13 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredproducts_productads` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `adid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `asin` | character varying |
| 8 | `sku` | character varying |
| 9 | `state` | character varying |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `servingstatus` | character varying |
| 13 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_sponsoredproducts_producttargetsearchterm_report` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `targetexpression` | character varying |
| 6 | `campaignid` | bigint |
| 7 | `adgroupid` | bigint |
| 8 | `reportdate` | date |
| 9 | `query` | character varying |
| 10 | `impressions` | bigint |
| 11 | `clicks` | integer |
| 12 | `cost` | numeric |
| 13 | `attributedsales14dsamesku` | numeric |
| 14 | `attributedsales14d` | numeric |
| 15 | `attributedconversions14dsamesku` | integer |
| 16 | `attributedconversions14d` | integer |
| 17 | `attributedunitsordered14d` | integer |

### `amazon_source_data.ad_sponsoredproducts_target` (28 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `targetid` | bigint |
| 5 | `adgroupid` | bigint |
| 6 | `campaignid` | bigint |
| 7 | `expressiontype` | character varying |
| 8 | `state` | character varying |
| 9 | `bid` | numeric |
| 10 | `creationdate` | timestamp with time zone |
| 11 | `lastupdateddate` | timestamp with time zone |
| 12 | `autoexpressionvalue` | character varying |
| 13 | `asinpricelessthan` | numeric |
| 14 | `asinpricegreaterthan` | numeric |
| 15 | `asinreviewratinglessthan` | numeric |
| 16 | `asinreviewratinggreaterthan` | numeric |
| 17 | `asincategorysameas` | character varying |
| 18 | `asinbrandsameas` | character varying |
| 19 | `asinpricebetween` | character varying |
| 20 | `asinreviewratingbetween` | character varying |
| 21 | `asinsameas` | character varying |
| 22 | `asinisprimeshippingeligible` | character varying |
| 23 | `asinagerangesameas` | character varying |
| 24 | `asingenresameas` | character varying |
| 25 | `servingstatus` | character varying |
| 26 | `systemlastupdateddate` | timestamp with time zone |
| 27 | `views` | character varying |
| 28 | `lookback` | bigint |

### `amazon_source_data.ad_store` (10 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `region` | character varying |
| 5 | `brandentityid` | character varying |
| 6 | `storename` | character varying |
| 7 | `storepageid` | character varying |
| 8 | `storepageurl` | character varying |
| 9 | `storepagename` | character varying |
| 10 | `systemlastupdateddate` | timestamp with time zone |

### `amazon_source_data.ad_store_insights_report` (21 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `profile_id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `region` | character varying |
| 5 | `reportdate` | date |
| 6 | `brandentityid` | character varying |
| 7 | `dimensiontype` | character varying |
| 8 | `dimensionvalue` | character varying |
| 9 | `views` | bigint |
| 10 | `orders` | bigint |
| 11 | `units` | bigint |
| 12 | `sales` | numeric |
| 13 | `visits` | bigint |
| 14 | `visitors` | bigint |
| 15 | `scorelevel` | character varying |
| 16 | `dwell` | numeric |
| 17 | `peerdwell` | numeric |
| 18 | `dwelltime` | numeric |
| 19 | `bouncerate` | numeric |
| 20 | `newtostore` | bigint |
| 21 | `download_date` | date |

### `amazon_source_data.brandanalytics_marketbasket_report` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `asin` | character varying |
| 5 | `purchased_with_asin` | character varying |
| 6 | `purchased_with_rank` | integer |
| 7 | `combination_pct` | numeric |
| 8 | `download_date` | date |

### `amazon_source_data.brandanalytics_promotionperformance_report` (23 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_date` | date |
| 5 | `promotion_id` | character varying |
| 6 | `promotion_name` | character varying |
| 7 | `vendor_code` | character varying |
| 8 | `amount_spent_currency_code` | character varying |
| 9 | `revenue_currency_code` | character varying |
| 10 | `type` | character varying |
| 11 | `status` | character varying |
| 12 | `funding_agreement_id` | character varying |
| 13 | `start_date_time` | timestamp with time zone |
| 14 | `end_date_time` | timestamp with time zone |
| 15 | `created_date_time` | timestamp with time zone |
| 16 | `last_updated_date_time` | timestamp with time zone |
| 17 | `asin` | character varying |
| 18 | `product_name` | character varying |
| 19 | `product_glance_views` | integer |
| 20 | `product_units_sold` | integer |
| 21 | `product_amount_spent` | numeric |
| 22 | `product_revenue` | numeric |
| 23 | `download_date` | date |

### `amazon_source_data.brandanalytics_repeatpurchase_report` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `start_date` | date |
| 5 | `end_date` | date |
| 6 | `asin` | character varying |
| 7 | `orders` | bigint |
| 8 | `unique_customers` | bigint |
| 9 | `repeat_customers_pct_total` | numeric |
| 10 | `repeat_purchase_revenue_amount` | numeric |
| 11 | `repeat_purchase_revenue_currency_code` | character varying |
| 12 | `repeat_purchase_revenue_pct_total` | numeric |
| 13 | `download_date` | date |

### `amazon_source_data.brandanalytics_searchterms_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `country_code` | character varying |
| 2 | `marketplace_id` | character varying |
| 3 | `department_name` | character varying |
| 4 | `search_term` | character varying |
| 5 | `search_frequency_rank` | integer |
| 6 | `clicked_asin` | character varying |
| 7 | `clicked_item_name` | character varying |
| 8 | `click_share_rank` | integer |
| 9 | `click_share` | numeric |
| 10 | `conversion_share` | numeric |
| 11 | `report_start_date` | date |
| 12 | `report_end_date` | date |

### `amazon_source_data.catalog_item_images` (7 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `variant` | character varying |
| 2 | `link` | character varying |
| 3 | `height` | integer |
| 4 | `width` | integer |
| 5 | `ctlg_master_id` | bigint |
| 6 | `account_id` | bigint |
| 7 | `asin` | character varying |

### `amazon_source_data.catalog_master` (5 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `ctlg_master_id` | bigint |
| 2 | `asin` | character varying |
| 3 | `account_id` | bigint |
| 4 | `account_name` | character varying |
| 5 | `updated_date` | timestamp with time zone |

### `amazon_source_data.category_master` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `asin` | character varying |
| 4 | `category` | character varying |
| 5 | `category_id` | bigint |
| 6 | `parent_category_id` | bigint |

### `amazon_source_data.dsp_advertisers` (4 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `advertiser_id` | bigint |
| 4 | `advertiser_name` | character varying |

### `amazon_source_data.dsp_audience_report` (368 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `interval_start` | date |
| 5 | `interval_end` | date |
| 6 | `entity_id` | character varying |
| 7 | `order_id` | character varying |
| 8 | `line_item_id` | character varying |
| 9 | `segment` | character varying |
| 10 | `targeting_method` | character varying |
| 11 | `accept_14d` | numeric |
| 12 | `accept_clicks_14d` | numeric |
| 13 | `accept_cpa_14d` | numeric |
| 14 | `accept_cvr_14d` | numeric |
| 15 | `accept_views_14d` | numeric |
| 16 | `added_to_shopping_cart_14d` | numeric |
| 17 | `added_to_shopping_cart_clicks_14d` | bigint |
| 18 | `added_to_shopping_cart_cpa_14d` | numeric |
| 19 | `added_to_shopping_cart_cvr_14d` | numeric |
| 20 | `added_to_shopping_cart_views_14d` | numeric |
| 21 | `add_to_watch_list_14d` | numeric |
| 22 | `add_to_watch_list_clicks_14d` | bigint |
| 23 | `add_to_watch_list_cpa_14d` | numeric |
| 24 | `add_to_watch_list_cvr_14d` | numeric |
| 25 | `add_to_watch_list_views_14d` | numeric |
| 26 | `advertiser_country` | character varying |
| 27 | `advertiser_timezone` | character varying |
| 28 | `amazon_audience_fee` | numeric |
| 29 | `amazon_omnichannel_metrics_fee` | numeric |
| 30 | `amazon_platform_fee` | numeric |
| 31 | `application_14d` | numeric |
| 32 | `application_clicks_14d` | bigint |
| 33 | `application_cpa_14d` | numeric |
| 34 | `application_cvr_14d` | numeric |
| 35 | `application_views_14d` | numeric |
| 36 | `atc_14d` | numeric |
| 37 | `atc_clicks_14d` | bigint |
| 38 | `atcr_14d` | numeric |
| 39 | `atc_views_14d` | numeric |
| 40 | `atl_14d` | numeric |
| 41 | `atl_clicks_14d` | bigint |
| 42 | `atlr_14d` | numeric |
| 43 | `atl_views_14d` | numeric |
| 44 | `banner_interaction_14d` | numeric |
| 45 | `banner_interaction_clicks_14d` | bigint |
| 46 | `banner_interaction_cpa_14d` | numeric |
| 47 | `banner_interaction_cvr_14d` | numeric |
| 48 | `banner_interaction_views_14d` | numeric |
| 49 | `brand_search_14d` | numeric |
| 50 | `brand_search_clicks_14d` | numeric |
| 51 | `brand_search_cpa_14d` | numeric |
| 52 | `brand_search_rate_14d` | numeric |
| 53 | `brand_search_views_14d` | numeric |
| 54 | `brand_store_engagement1` | numeric |
| 55 | `brand_store_engagement1_clicks` | bigint |
| 56 | `brand_store_engagement1_cpa` | numeric |
| 57 | `brand_store_engagement1_cvr` | numeric |
| 58 | `brand_store_engagement1_views` | numeric |
| 59 | `brand_store_engagement2` | numeric |
| 60 | `brand_store_engagement2_clicks` | bigint |
| 61 | `brand_store_engagement2_cpa` | numeric |
| 62 | `brand_store_engagement2_cvr` | numeric |
| 63 | `brand_store_engagement2_views` | numeric |
| 64 | `brand_store_engagement3` | numeric |
| 65 | `brand_store_engagement3_clicks` | bigint |
| 66 | `brand_store_engagement3_cpa` | numeric |
| 67 | `brand_store_engagement3_cvr` | numeric |
| 68 | `brand_store_engagement3_views` | numeric |
| 69 | `brand_store_engagement4` | numeric |
| 70 | `brand_store_engagement4_clicks` | bigint |
| 71 | `brand_store_engagement4_cpa` | numeric |
| 72 | `brand_store_engagement4_cvr` | numeric |
| 73 | `brand_store_engagement4_views` | numeric |
| 74 | `brand_store_engagement5` | numeric |
| 75 | `brand_store_engagement5_clicks` | bigint |
| 76 | `brand_store_engagement5_cpa` | numeric |
| 77 | `brand_store_engagement5_cvr` | numeric |
| 78 | `brand_store_engagement5_views` | numeric |
| 79 | `brand_store_engagement6` | numeric |
| 80 | `brand_store_engagement6_clicks` | bigint |
| 81 | `brand_store_engagement6_cpa` | numeric |
| 82 | `brand_store_engagement6_cvr` | numeric |
| 83 | `brand_store_engagement6_views` | numeric |
| 84 | `brand_store_engagement7` | numeric |
| 85 | `brand_store_engagement7_clicks` | bigint |
| 86 | `brand_store_engagement7_cpa` | numeric |
| 87 | `brand_store_engagement7_cvr` | numeric |
| 88 | `brand_store_engagement7_views` | numeric |
| 89 | `checkout_14d` | numeric |
| 90 | `checkout_clicks_14d` | numeric |
| 91 | `checkout_cpa_14d` | numeric |
| 92 | `checkout_cvr_14d` | numeric |
| 93 | `checkout_views_14d` | numeric |
| 94 | `click_on_redirect_14d` | numeric |
| 95 | `click_on_redirect_clicks_14d` | numeric |
| 96 | `click_on_redirect_cpa_14d` | numeric |
| 97 | `click_on_redirect_cvr_14d` | numeric |
| 98 | `click_on_redirect_views_14d` | numeric |
| 99 | `click_throughs` | bigint |
| 100 | `contact_14d` | numeric |
| 101 | `contact_clicks_14d` | numeric |
| 102 | `contact_cpa_14d` | numeric |
| 103 | `contact_cvr_14d` | numeric |
| 104 | `contact_views_14d` | numeric |
| 105 | `ctr` | numeric |
| 106 | `decline_14d` | numeric |
| 107 | `decline_clicks_14d` | bigint |
| 108 | `decline_cpa_14d` | numeric |
| 109 | `decline_cvr_14d` | numeric |
| 110 | `decline_views_14d` | numeric |
| 111 | `downloaded_video_play_rate_14d` | numeric |
| 112 | `downloaded_video_plays_14d` | numeric |
| 113 | `downloaded_video_plays_clicks_14d` | bigint |
| 114 | `downloaded_video_plays_views_14d` | numeric |
| 115 | `dpv_14d` | numeric |
| 116 | `dpv_clicks_14d` | bigint |
| 117 | `dpvr_14d` | numeric |
| 118 | `dpv_views_14d` | bigint |
| 119 | `drop_down_selection_14d` | numeric |
| 120 | `drop_down_selection_clicks_14d` | bigint |
| 121 | `drop_down_selection_cpa_14d` | numeric |
| 122 | `drop_down_selection_cvr_14d` | numeric |
| 123 | `drop_down_selection_views_14d` | bigint |
| 124 | `e_cpa_tc_14d` | numeric |
| 125 | `e_cpa_tl_14d` | numeric |
| 126 | `ecpc` | numeric |
| 127 | `ecpdpv_14d` | numeric |
| 128 | `ecpdvp_14d` | numeric |
| 129 | `e_cpm` | numeric |
| 130 | `ecpnewsubscribe_and_save_14d` | numeric |
| 131 | `ecpp_14d` | numeric |
| 132 | `ecpprpv_14d` | numeric |
| 133 | `ecppt_14d` | numeric |
| 134 | `ecpr_14d` | numeric |
| 135 | `ecpvc` | numeric |
| 136 | `ecpvd_14d` | numeric |
| 137 | `ecpv_s_14d` | numeric |
| 138 | `email_interaction_14d` | numeric |
| 139 | `email_interaction_clicks_14d` | bigint |
| 140 | `email_interaction_cpa_14d` | numeric |
| 141 | `email_interaction_cvr_14d` | numeric |
| 142 | `email_interaction_views_14d` | bigint |
| 143 | `email_load_14d` | numeric |
| 144 | `email_load_clicks_14d` | bigint |
| 145 | `email_load_cpa_14d` | numeric |
| 146 | `email_load_cvr_14d` | numeric |
| 147 | `email_load_views_14d` | bigint |
| 148 | `game_interaction_14d` | numeric |
| 149 | `game_interaction_clicks_14d` | bigint |
| 150 | `game_interaction_cpa_14d` | numeric |
| 151 | `game_interaction_cvr_14d` | numeric |
| 152 | `game_interaction_views_14d` | numeric |
| 153 | `game_load_14d` | numeric |
| 154 | `game_load_clicks_14d` | bigint |
| 155 | `game_load_cpa_14d` | numeric |
| 156 | `game_load_cvr_14d` | numeric |
| 157 | `game_load_views_14d` | bigint |
| 158 | `gross_click_throughs` | bigint |
| 159 | `gross_impressions` | numeric |
| 160 | `homepage_visit_14d` | numeric |
| 161 | `homepage_visit_clicks_14d` | bigint |
| 162 | `homepage_visit_cpa_14d` | numeric |
| 163 | `homepage_visit_cvr_14d` | numeric |
| 164 | `homepage_visit_views_14d` | bigint |
| 165 | `impressions` | numeric |
| 166 | `invalid_click_throughs` | bigint |
| 167 | `invalid_click_throughs_rate` | numeric |
| 168 | `invalid_impression_rate` | numeric |
| 169 | `invalid_impressions` | numeric |
| 170 | `lead_14d` | numeric |
| 171 | `lead_clicks_14d` | numeric |
| 172 | `lead_cpa_14d` | numeric |
| 173 | `lead_cvr_14d` | numeric |
| 174 | `lead_views_14d` | numeric |
| 175 | `marketing_landing_page_14d` | numeric |
| 176 | `marketing_landing_page_clicks_14d` | bigint |
| 177 | `marketing_landing_page_cpa_14d` | numeric |
| 178 | `marketing_landing_page_cvr_14d` | numeric |
| 179 | `marketing_landing_page_views_14d` | numeric |
| 180 | `mashup_add_to_cart_14d` | numeric |
| 181 | `mashup_add_to_cart_clicks_14d` | numeric |
| 182 | `mashup_add_to_cart_cpa_14d` | numeric |
| 183 | `mashup_add_to_cart_click_cvr_14d` | numeric |
| 184 | `mashup_add_to_cart_views_14d` | bigint |
| 185 | `mashup_add_to_wish_list_14d` | numeric |
| 186 | `mashup_add_to_wish_list_clicks_14d` | bigint |
| 187 | `mashup_add_to_wish_list_cpa_14d` | numeric |
| 188 | `mashup_add_to_wish_list_cvr_14d` | numeric |
| 189 | `mashup_add_to_wish_list_views_14d` | bigint |
| 190 | `mashup_backup_image` | numeric |
| 191 | `mashup_backup_image_clicks` | bigint |
| 192 | `mashup_backup_image_cpa` | numeric |
| 193 | `mashup_backup_image_cvr` | numeric |
| 194 | `mashup_backup_image_views` | bigint |
| 195 | `mashup_click_to_page` | numeric |
| 196 | `mashup_click_to_page_clicks` | bigint |
| 197 | `mashup_click_to_page_cpa` | numeric |
| 198 | `mashup_click_to_page_cvr` | numeric |
| 199 | `mashup_click_to_page_views` | bigint |
| 200 | `mashup_clip_coupon_click_14d` | bigint |
| 201 | `mashup_clip_coupon_click_clicks_14d` | bigint |
| 202 | `mashup_clip_coupon_click_cpa_14d` | numeric |
| 203 | `mashup_clip_coupon_click_cvr_14d` | numeric |
| 204 | `mashup_clip_coupon_click_views_14d` | bigint |
| 205 | `mashup_shop_now_click_14d` | bigint |
| 206 | `mashup_shop_now_click_clicks_14d` | bigint |
| 207 | `mashup_shop_now_click_cpa_14d` | numeric |
| 208 | `mashup_shop_now_click_cvr_14d` | numeric |
| 209 | `mashup_shop_now_click_views_14d` | bigint |
| 210 | `mashup_subscribe_and_save_14d` | numeric |
| 211 | `mashup_subscribe_and_save_click_14d` | bigint |
| 212 | `mashup_subscribe_and_save_cpa_14d` | numeric |
| 213 | `mashup_subscribe_and_save_cvr_14d` | numeric |
| 214 | `mashup_subscribe_and_save_click_views_14d` | bigint |
| 215 | `message_sent_14d` | numeric |
| 216 | `message_sent_clicks_14d` | bigint |
| 217 | `message_sent_cpa_14d` | numeric |
| 218 | `message_sent_cvr_14d` | numeric |
| 219 | `message_sent_views_14d` | bigint |
| 220 | `mobile_app_first_starts_14d` | numeric |
| 221 | `mobile_app_first_start_clicks_14d` | bigint |
| 222 | `mobile_app_first_starts_cpa_14d` | numeric |
| 223 | `mobile_app_first_start_cvr_14d` | numeric |
| 224 | `mobile_app_first_start_views_14d` | bigint |
| 225 | `newsubscribe_and_save_14d` | numeric |
| 226 | `newsubscribe_and_save_clicks_14d` | bigint |
| 227 | `newsubscribe_and_save_rate_14d` | numeric |
| 228 | `newsubscribe_and_save_views_14d` | bigint |
| 229 | `new_to_brand_ecpp_14d` | numeric |
| 230 | `new_to_brand_purchase_rate_14d` | numeric |
| 231 | `new_to_brand_purchases_14d` | numeric |
| 232 | `new_to_brand_purchases_clicks_14d` | bigint |
| 233 | `new_to_brand_purchases_views_14d` | numeric |
| 234 | `other_14d` | numeric |
| 235 | `other_clicks_14d` | numeric |
| 236 | `other_cpa_14d` | numeric |
| 237 | `other_cvr_14d` | numeric |
| 238 | `other_views_14d` | numeric |
| 239 | `page_view_14d` | numeric |
| 240 | `page_view_clicks_14d` | numeric |
| 241 | `page_view_cpa_14d` | numeric |
| 242 | `page_view_cvr_14d` | numeric |
| 243 | `page_view_views_14d` | numeric |
| 244 | `percent_of_purchases_new_to_brand_14d` | numeric |
| 245 | `player_trailers_clicks_14d` | bigint |
| 246 | `play_trailer_rate_14d` | numeric |
| 247 | `play_trailers_14d` | numeric |
| 248 | `play_trailers_views_14d` | numeric |
| 249 | `prpv_14d` | numeric |
| 250 | `prpv_clicks_14d` | bigint |
| 251 | `prpvr_14d` | numeric |
| 252 | `prpv_views_14d` | bigint |
| 253 | `purchase_button_14d` | numeric |
| 254 | `purchase_button_clicks_14d` | bigint |
| 255 | `purchase_button_cpa_14d` | numeric |
| 256 | `purchase_button_cvr_14d` | numeric |
| 257 | `purchase_button_views_14d` | numeric |
| 258 | `purchase_rate_14d` | numeric |
| 259 | `purchases_14d` | numeric |
| 260 | `purchases_clicks_14d` | bigint |
| 261 | `purchases_views_14d` | bigint |
| 262 | `referral_14d` | numeric |
| 263 | `referral_clicks_14d` | bigint |
| 264 | `referral_cpa_14d` | numeric |
| 265 | `referral_cvr_14d` | numeric |
| 266 | `referral_views_14d` | numeric |
| 267 | `registration_confirm_page_14d` | numeric |
| 268 | `registration_confirm_page_clicks_14d` | bigint |
| 269 | `registration_confirm_page_cpa_14d` | numeric |
| 270 | `registration_confirm_page_cvr_14d` | numeric |
| 271 | `registration_confirm_page_views_14d` | numeric |
| 272 | `registration_form_14d` | numeric |
| 273 | `registration_form_clicks_14d` | bigint |
| 274 | `registration_form_cpa_14d` | numeric |
| 275 | `registration_form_cvr_14d` | numeric |
| 276 | `registration_form_views_14d` | bigint |
| 277 | `rental_rate_14d` | numeric |
| 278 | `rentals_14d` | numeric |
| 279 | `rentals_clicks_14d` | bigint |
| 280 | `rentals_views_14d` | bigint |
| 281 | `search_14d` | numeric |
| 282 | `search_clicks_14d` | numeric |
| 283 | `search_cpa_14d` | numeric |
| 284 | `search_cvr_14d` | numeric |
| 285 | `search_views_14d` | numeric |
| 286 | `sign_up_page_14d` | numeric |
| 287 | `sign_up_page_clicks_14d` | numeric |
| 288 | `sign_up_page_cpa_14d` | numeric |
| 289 | `sign_up_page_cvr_14d` | numeric |
| 290 | `sign_up_page_views_14d` | numeric |
| 291 | `store_locator_page_14d` | numeric |
| 292 | `store_locator_page_clicks_14d` | numeric |
| 293 | `store_locator_page_cpa_14d` | numeric |
| 294 | `store_locator_page_cvr_14d` | numeric |
| 295 | `store_locator_page_views_14d` | numeric |
| 296 | `submit_button_14d` | numeric |
| 297 | `submit_button_clicks_14d` | numeric |
| 298 | `submit_button_cpa_14d` | numeric |
| 299 | `submit_button_cvr_14d` | numeric |
| 300 | `submit_button_views_14d` | numeric |
| 301 | `subscription_button_14d` | numeric |
| 302 | `subscription_button_clicks_14d` | numeric |
| 303 | `subscription_button_cpa_14d` | numeric |
| 304 | `subscription_button_cvr_14d` | numeric |
| 305 | `subscription_button_views_14d` | numeric |
| 306 | `success_page_14d` | numeric |
| 307 | `success_page_clicks_14d` | numeric |
| 308 | `success_page_cpa_14d` | numeric |
| 309 | `success_page_cvr_14d` | numeric |
| 310 | `success_page_views_14d` | numeric |
| 311 | `supply_cost` | numeric |
| 312 | `survey_finish_14d` | numeric |
| 313 | `survey_finish_clicks_14d` | numeric |
| 314 | `survey_finish_cpa_14d` | numeric |
| 315 | `survey_finish_cvr_14d` | numeric |
| 316 | `survey_finish_views_14d` | numeric |
| 317 | `survey_start_14d` | numeric |
| 318 | `survey_start_clicks_14d` | numeric |
| 319 | `survey_start_cpa_14d` | numeric |
| 320 | `survey_start_cvr_14d` | numeric |
| 321 | `survey_start_views_14d` | numeric |
| 322 | `thank_you_page_14d` | numeric |
| 323 | `thank_you_page_clicks_14d` | numeric |
| 324 | `thank_you_page_cpa_14d` | numeric |
| 325 | `thank_you_page_cvr_14d` | numeric |
| 326 | `thank_you_page_views_14d` | numeric |
| 327 | `total_cost` | numeric |
| 328 | `video_complete` | numeric |
| 329 | `video_completed` | numeric |
| 330 | `video_completed_cpa` | numeric |
| 331 | `video_completed_cvr` | numeric |
| 332 | `video_completed_views` | numeric |
| 333 | `video_completion_rate` | numeric |
| 334 | `video_download_rate_14d` | numeric |
| 335 | `video_downloads_14d` | numeric |
| 336 | `video_downloads_clicks_14d` | numeric |
| 337 | `video_downloads_views_14d` | numeric |
| 338 | `video_end_clicks` | numeric |
| 339 | `video_first_quartile` | numeric |
| 340 | `video_midpoint` | numeric |
| 341 | `video_mute` | numeric |
| 342 | `video_pause` | numeric |
| 343 | `video_resume` | numeric |
| 344 | `video_start` | numeric |
| 345 | `video_started` | numeric |
| 346 | `video_started_clicks` | numeric |
| 347 | `video_started_cpa` | numeric |
| 348 | `video_started_cvr` | numeric |
| 349 | `video_started_views` | numeric |
| 350 | `video_streams_14d` | numeric |
| 351 | `video_streams_clicks_14d` | numeric |
| 352 | `video_streams_rate_14d` | numeric |
| 353 | `video_streams_views_14d` | numeric |
| 354 | `video_third_quartile` | numeric |
| 355 | `video_unmute` | numeric |
| 356 | `widget_interaction_14d` | numeric |
| 357 | `widget_interaction_clicks_14d` | numeric |
| 358 | `widget_interaction_cpa_14d` | numeric |
| 359 | `widget_interaction_cvr_14d` | numeric |
| 360 | `widget_interaction_views_14d` | numeric |
| 361 | `widget_load_14d` | numeric |
| 362 | `widget_load_clicks_14d` | numeric |
| 363 | `widget_load_cpa_14d` | numeric |
| 364 | `widget_load_cvr_14d` | numeric |
| 365 | `widget_load_views_14d` | numeric |
| 366 | `download_date` | date |
| 367 | `line_item_name` | character varying |
| 368 | `order_name` | character varying |

### `amazon_source_data.dsp_inventory_report` (448 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `report_date` | date |
| 5 | `entity_id` | character varying |
| 6 | `order_name` | character varying |
| 7 | `order_id` | character varying |
| 8 | `order_start_date` | date |
| 9 | `order_end_date` | date |
| 10 | `order_budget` | numeric |
| 11 | `order_external_id` | character varying |
| 12 | `order_currency` | character varying |
| 13 | `line_item_name` | character varying |
| 14 | `line_item_id` | character varying |
| 15 | `line_item_start_date` | date |
| 16 | `line_item_end_date` | date |
| 17 | `line_item_budget` | numeric |
| 18 | `line_item_external_id` | character varying |
| 19 | `site_name` | character varying |
| 20 | `placement_size` | character varying |
| 21 | `placement_name` | character varying |
| 22 | `supply_source_name` | character varying |
| 23 | `brand_store_engagement_1_cpa` | bigint |
| 24 | `mashup_subscribe_and_save_click_views_14d` | bigint |
| 25 | `email_interaction_clicks_14d` | bigint |
| 26 | `total_cost` | numeric |
| 27 | `click_on_redirect_clicks_14d` | bigint |
| 28 | `brand_store_engagement_2_clicks` | bigint |
| 29 | `add_to_watchlist_views_14d` | bigint |
| 30 | `widget_interaction_clicks_14d` | bigint |
| 31 | `referral_cvr_14d` | numeric |
| 32 | `purchase_button_14d` | bigint |
| 33 | `brand_store_engagement_5_clicks` | bigint |
| 34 | `application_cvr_14d` | numeric |
| 35 | `amazon_platform_fee` | numeric |
| 36 | `marketing_landing_page_14d` | bigint |
| 37 | `application_views_14d` | bigint |
| 38 | `survey_finish_cpa_14d` | bigint |
| 39 | `rentals_views_14d` | bigint |
| 40 | `ctr` | numeric |
| 41 | `referral_cpa_14d` | bigint |
| 42 | `mobile_app_first_starts_cpa_14d` | bigint |
| 43 | `message_sent_views_14d` | bigint |
| 44 | `video_streams_views_14d` | bigint |
| 45 | `purchases_views_14d` | bigint |
| 46 | `submit_button_14d` | bigint |
| 47 | `registration_confirm_page_14d` | bigint |
| 48 | `email_load_views_14d` | bigint |
| 49 | `email_interaction_cvr_14d` | numeric |
| 50 | `survey_finish_cvr_14d` | numeric |
| 51 | `search_cpa_14d` | numeric |
| 52 | `brand_store_engagement_3_views` | bigint |
| 53 | `search_cvr_14d` | numeric |
| 54 | `referral_views_14d` | bigint |
| 55 | `video_started_clicks` | bigint |
| 56 | `added_to_shopping_cart_clicks_14d` | bigint |
| 57 | `mashup_click_to_page_clicks` | bigint |
| 58 | `mobile_app_first_start_cvr_14d` | numeric |
| 59 | `email_interaction_views_14d` | bigint |
| 60 | `brand_store_engagement_4_views` | bigint |
| 61 | `other_14d` | bigint |
| 62 | `mashup_shop_now_click_views_14d` | bigint |
| 63 | `email_interaction_14d` | bigint |
| 64 | `registration_form_14d` | bigint |
| 65 | `play_trailers_14d` | bigint |
| 66 | `rental_rate_14d` | numeric |
| 67 | `game_load_clicks_14d` | bigint |
| 68 | `mashup_clip_coupon_click_views_14d` | bigint |
| 69 | `video_midpoint` | bigint |
| 70 | `registration_form_cvr_14d` | numeric |
| 71 | `click_on_redirect_14d` | bigint |
| 72 | `mashup_add_to_cart_cpa_14d` | bigint |
| 73 | `lead_cvr_14d` | numeric |
| 74 | `brand_store_engagement_4_cvr` | numeric |
| 75 | `mashup_subscribe_and_save_cvr_14d` | numeric |
| 76 | `dpvr_14d` | numeric |
| 77 | `video_completed_cpa` | bigint |
| 78 | `new_to_brand_purchase_rate_14d` | numeric |
| 79 | `video_completed_views` | bigint |
| 80 | `other_views_14d` | bigint |
| 81 | `game_interaction_cvr_14d` | numeric |
| 82 | `drop_down_selection_cpa_14d` | bigint |
| 83 | `brand_store_engagement_1_cvr` | numeric |
| 84 | `survey_start_views_14d` | bigint |
| 85 | `checkout_14d` | bigint |
| 86 | `new_subscribe_and_save_rate_14d` | numeric |
| 87 | `registration_confirm_page_cpa_14d` | bigint |
| 88 | `subscription_button_clicks_14d` | bigint |
| 89 | `mobile_app_first_start_clicks_14d` | bigint |
| 90 | `ecpvc` | numeric |
| 91 | `brand_store_engagement_6_cpa` | bigint |
| 92 | `prpvr_14d` | numeric |
| 93 | `survey_start_clicks_14d` | bigint |
| 94 | `homepage_visit_cvr_14d` | numeric |
| 95 | `click_on_redirect_cpa_14d` | bigint |
| 96 | `subscription_button_cvr_14d` | numeric |
| 97 | `registration_form_clicks_14d` | bigint |
| 98 | `store_locator_page_cvr_14d` | numeric |
| 99 | `mashup_click_to_page` | bigint |
| 100 | `brand_store_engagement_3_cpa` | bigint |
| 101 | `rentals_clicks_14d` | bigint |
| 102 | `mashup_clip_coupon_click_cvr_14d` | numeric |
| 103 | `game_load_cpa_14d` | bigint |
| 104 | `video_started_views` | bigint |
| 105 | `new_to_brand_purchases_views_14d` | bigint |
| 106 | `mobile_app_first_starts_14d` | bigint |
| 107 | `mashup_backup_image` | bigint |
| 108 | `widget_load_cvr_14d` | numeric |
| 109 | `brand_store_engagement_3_cvr` | numeric |
| 110 | `game_interaction_views_14d` | bigint |
| 111 | `video_end_clicks` | bigint |
| 112 | `brand_store_engagement_2_views` | bigint |
| 113 | `application_14d` | bigint |
| 114 | `mashup_backup_image_cpa` | bigint |
| 115 | `new_to_brand_purchases_14d` | bigint |
| 116 | `video_mute` | bigint |
| 117 | `game_load_views_14d` | bigint |
| 118 | `banner_interaction_clicks_14d` | bigint |
| 119 | `accept_views_14d` | bigint |
| 120 | `email_load_clicks_14d` | bigint |
| 121 | `ecpatl_14d` | numeric |
| 122 | `widget_interaction_14d` | bigint |
| 123 | `brand_store_engagement_3` | bigint |
| 124 | `message_sent_14d` | bigint |
| 125 | `add_to_watchlist_14d` | bigint |
| 126 | `ecpatc_14d` | numeric |
| 127 | `atc_views_14d` | bigint |
| 128 | `success_page_views_14d` | bigint |
| 129 | `mashup_add_to_cart_14d` | bigint |
| 130 | `downloaded_video_plays_14d` | bigint |
| 131 | `widget_load_views_14d` | bigint |
| 132 | `purchase_button_clicks_14d` | bigint |
| 133 | `contact_14d` | bigint |
| 134 | `video_complete` | bigint |
| 135 | `purchase_button_cvr_14d` | numeric |
| 136 | `other_cvr_14d` | numeric |
| 137 | `marketing_landing_page_cvr_14d` | numeric |
| 138 | `video_streams_14d` | bigint |
| 139 | `mashup_click_to_page_views` | bigint |
| 140 | `dpv_clicks_14d` | bigint |
| 141 | `success_page_cpa_14d` | bigint |
| 142 | `drop_down_selection_14d` | bigint |
| 143 | `atcr_14d` | numeric |
| 144 | `video_downloads_views_14d` | bigint |
| 145 | `game_interaction_cpa_14d` | bigint |
| 146 | `mashup_subscribe_and_save_click_14d` | bigint |
| 147 | `mashup_click_to_page_cpa` | numeric |
| 148 | `brand_store_engagement_4` | numeric |
| 149 | `add_to_watchlist_clicks_14d` | bigint |
| 150 | `accept_cvr_14d` | numeric |
| 151 | `video_resume` | numeric |
| 152 | `brand_store_engagement_6_cvr` | numeric |
| 153 | `banner_interaction_14d` | numeric |
| 154 | `brand_store_engagement_6_views` | bigint |
| 155 | `brand_store_engagement_3_clicks` | bigint |
| 156 | `mashup_add_to_cart_click_cvr_14d` | numeric |
| 157 | `subscription_button_views_14d` | numeric |
| 158 | `percent_of_purchases_new_to_brand_14d` | numeric |
| 159 | `mashup_backup_image_clicks` | bigint |
| 160 | `lead_cpa_14d` | bigint |
| 161 | `purchase_button_views_14d` | bigint |
| 162 | `brand_store_engagement_6_clicks` | bigint |
| 163 | `referral_14d` | bigint |
| 164 | `banner_interaction_cvr_14d` | numeric |
| 165 | `video_first_quartile` | bigint |
| 166 | `added_to_shopping_cart_14d` | bigint |
| 167 | `new_subscribe_and_save_clicks_14d` | bigint |
| 168 | `referral_clicks_14d` | bigint |
| 169 | `video_completed_cvr` | numeric |
| 170 | `mashup_subscribe_and_save_cpa_14d` | numeric |
| 171 | `mashup_backup_image_views` | bigint |
| 172 | `atc_14d` | bigint |
| 173 | `thank_you_page_views_14d` | bigint |
| 174 | `downloaded_video_plays_clicks_14d` | bigint |
| 175 | `survey_finish_views_14d` | bigint |
| 176 | `submit_button_cpa_14d` | bigint |
| 177 | `prpv_clicks_14d` | bigint |
| 178 | `dpv_14d` | bigint |
| 179 | `search_clicks_14d` | bigint |
| 180 | `mobile_app_first_start_views_14d` | bigint |
| 181 | `click_throughs` | numeric |
| 182 | `advertiser_country` | character varying |
| 183 | `lead_clicks_14d` | bigint |
| 184 | `ecpnew_subscribe_and_save_14d` | numeric |
| 185 | `application_clicks_14d` | bigint |
| 186 | `marketing_landing_page_clicks_14d` | bigint |
| 187 | `video_pause` | bigint |
| 188 | `banner_interaction_views_14d` | bigint |
| 189 | `mashup_add_to_cart_clicks_14d` | bigint |
| 190 | `atc_clicks_14d` | bigint |
| 191 | `email_load_cpa_14d` | numeric |
| 192 | `video_started` | bigint |
| 193 | `video_downloads_14d` | bigint |
| 194 | `mashup_add_to_wishlist_cpa_14d` | numeric |
| 195 | `mashup_clip_coupon_click_clicks_14d` | bigint |
| 196 | `brand_store_engagement5_cvr` | numeric |
| 197 | `video_started_cpa` | bigint |
| 198 | `thank_you_page_cpa_14d` | numeric |
| 199 | `thank_you_page_clicks_14d` | bigint |
| 200 | `survey_finish_14d` | bigint |
| 201 | `email_load_cvr_14d` | numeric |
| 202 | `checkout_cpa_14d` | numeric |
| 203 | `brand_store_engagement6` | bigint |
| 204 | `contact_clicks_14d` | bigint |
| 205 | `thank_you_page_cvr_14d` | numeric |
| 206 | `mashup_add_to_wishlist_cvr_14d` | numeric |
| 207 | `other_clicks_14d` | numeric |
| 208 | `video_third_quartile` | numeric |
| 209 | `prpv_14d` | numeric |
| 210 | `ecppt_14d` | numeric |
| 211 | `ecpdvp_14d` | numeric |
| 212 | `lead_views_14d` | numeric |
| 213 | `store_locator_page_clicks_14d` | numeric |
| 214 | `brand_store_engagement7` | bigint |
| 215 | `checkout_cvr_14d` | numeric |
| 216 | `mashup_clip_coupon_click_14d` | numeric |
| 217 | `video_started_cvr` | numeric |
| 218 | `rentals_14d` | numeric |
| 219 | `mashup_shop_now_click_clicks_14d` | numeric |
| 220 | `survey_start_14d` | numeric |
| 221 | `brand_store_engagement5_cpa` | numeric |
| 222 | `ecpvs_14d` | numeric |
| 223 | `decline_clicks_14d` | numeric |
| 224 | `checkout_views_14d` | numeric |
| 225 | `mashup_shop_now_click_14d` | numeric |
| 226 | `atlr_14d` | numeric |
| 227 | `search_views_14d` | numeric |
| 228 | `downloaded_video_play_rate_14d` | numeric |
| 229 | `purchase_rate_14d` | numeric |
| 230 | `homepage_visit_14d` | numeric |
| 231 | `atl_14d` | numeric |
| 232 | `purchase_button_cpa_14d` | numeric |
| 233 | `new_to_brand_purchases_clicks_14d` | numeric |
| 234 | `homepage_visit_views_14d` | numeric |
| 235 | `contact_views_14d` | numeric |
| 236 | `brand_store_engagement2_cpa` | numeric |
| 237 | `play_trailer_rate_14d` | numeric |
| 238 | `mashup_shop_now_click_cvr_14d` | numeric |
| 239 | `advertiser_timezone` | character varying |
| 240 | `video_completed` | bigint |
| 241 | `purchases_14d` | numeric |
| 242 | `decline_views_14d` | numeric |
| 243 | `new_subscribe_and_save_14d` | numeric |
| 244 | `mashup_add_to_wishlist_14d` | numeric |
| 245 | `widget_load_cpa_14d` | numeric |
| 246 | `video_start` | bigint |
| 247 | `registration_form_views_14d` | numeric |
| 248 | `prpv_views_14d` | numeric |
| 249 | `banner_interaction_cpa_14d` | numeric |
| 250 | `store_locator_page_views_14d` | numeric |
| 251 | `mashup_click_to_page_cvr` | numeric |
| 252 | `brand_store_engagement1_clicks` | numeric |
| 253 | `success_page_cvr_14d` | numeric |
| 254 | `store_locator_page_cpa_14d` | numeric |
| 255 | `message_sent_clicks_14d` | numeric |
| 256 | `game_load_14d` | numeric |
| 257 | `brand_store_engagement5` | bigint |
| 258 | `brand_store_engagement7_views` | numeric |
| 259 | `added_to_shopping_cart_views_14d` | numeric |
| 260 | `brand_store_engagement4_clicks` | numeric |
| 261 | `survey_start_cvr_14d` | numeric |
| 262 | `click_on_redirect_views_14d` | numeric |
| 263 | `atl_clicks_14d` | numeric |
| 264 | `page_view_cpa_14d` | numeric |
| 265 | `impressions` | numeric |
| 266 | `contact_cvr_14d` | numeric |
| 267 | `homepage_visit_clicks_14d` | numeric |
| 268 | `purchases_clicks_14d` | numeric |
| 269 | `submit_button_cvr_14d` | numeric |
| 270 | `marketing_landing_page_views_14d` | numeric |
| 271 | `add_to_watchlist_cpa_14d` | numeric |
| 272 | `ecpvd_14d` | numeric |
| 273 | `added_to_shopping_cart_cpa_14d` | numeric |
| 274 | `brand_store_engagement7_clicks` | numeric |
| 275 | `accept_cpa_14d` | numeric |
| 276 | `accept_14d` | numeric |
| 277 | `widget_interaction_cpa_14d` | numeric |
| 278 | `drop_down_selection_clicks_14d` | numeric |
| 279 | `game_interaction_14d` | numeric |
| 280 | `video_completion_rate` | numeric |
| 281 | `success_page_14d` | numeric |
| 282 | `new_to_brand_ecpp_14d` | numeric |
| 283 | `brand_store_engagement2` | bigint |
| 284 | `ecpdpv_14d` | numeric |
| 285 | `brand_store_engagement5_views` | numeric |
| 286 | `checkout_clicks_14d` | numeric |
| 287 | `submit_button_views_14d` | numeric |
| 288 | `video_unmute` | bigint |
| 289 | `amazon_omnichannel_metrics_fee` | numeric |
| 290 | `contact_cpa_14d` | numeric |
| 291 | `success_page_clicks_14d` | numeric |
| 292 | `thank_you_page_14d` | numeric |
| 293 | `mashup_backup_image_cvr` | numeric |
| 294 | `registration_confirm_page_cvr_14d` | numeric |
| 295 | `ecpc` | numeric |
| 296 | `search_14d` | numeric |
| 297 | `new_subscribe_and_save_views_14d` | numeric |
| 298 | `message_sent_cpa_14d` | numeric |
| 299 | `mashup_add_to_cart_views_14d` | numeric |
| 300 | `subscription_button_14d` | numeric |
| 301 | `accept_clicks_14d` | numeric |
| 302 | `widget_load_clicks_14d` | numeric |
| 303 | `ecpm` | numeric |
| 304 | `page_view_clicks_14d` | numeric |
| 305 | `widget_interaction_cvr_14d` | numeric |
| 306 | `message_sent_cvr_14d` | numeric |
| 307 | `decline_14d` | numeric |
| 308 | `marketing_landing_page_cpa_14d` | numeric |
| 309 | `page_view_views_14d` | numeric |
| 310 | `mashup_clip_coupon_click_cpa_14d` | numeric |
| 311 | `ecpr_14d` | numeric |
| 312 | `ecpp_14d` | numeric |
| 313 | `registration_confirm_page_views_14d` | numeric |
| 314 | `video_streams_rate_14d` | numeric |
| 315 | `email_interaction_cpa_14d` | numeric |
| 316 | `brand_store_engagement_7_cvr` | numeric |
| 317 | `store_locator_page_14d` | numeric |
| 318 | `decline_cvr_14d` | numeric |
| 319 | `other_cpa_14d` | numeric |
| 320 | `drop_down_selection_views_14d` | numeric |
| 321 | `brand_store_engagement_7_cpa` | numeric |
| 322 | `mashup_add_to_wishlist_clicks_14d` | numeric |
| 323 | `decline_cpa_14d` | numeric |
| 324 | `drop_down_selection_cvr_14d` | numeric |
| 325 | `video_streams_clicks_14d` | numeric |
| 326 | `registration_confirm_page_clicks_14d` | numeric |
| 327 | `widget_load_14d` | numeric |
| 328 | `widget_interaction_views_14d` | numeric |
| 329 | `survey_start_cpa_14d` | numeric |
| 330 | `amazon_audience_fee` | numeric |
| 331 | `play_trailers_views_14d` | numeric |
| 332 | `brand_store_engagement_4_cpa` | numeric |
| 333 | `mashup_add_to_wishlist_views_14d` | numeric |
| 334 | `game_interaction_clicks_14d` | numeric |
| 335 | `homepage_visit_cpa_14d` | numeric |
| 336 | `brand_store_engagement_1_views` | numeric |
| 337 | `registration_form_cpa_14d` | numeric |
| 338 | `game_load_cvr_14d` | numeric |
| 339 | `video_downloads_clicks_14d` | numeric |
| 340 | `application_cpa_14d` | numeric |
| 341 | `lead_14d` | numeric |
| 342 | `brand_store_engagement_1` | numeric |
| 343 | `supply_cost` | numeric |
| 344 | `atl_views_14d` | numeric |
| 345 | `downloaded_video_plays_views_14d` | numeric |
| 346 | `brand_store_engagement_2_cvr` | numeric |
| 347 | `survey_finish_clicks_14d` | numeric |
| 348 | `submit_button_clicks_14d` | numeric |
| 349 | `page_view_14d` | numeric |
| 350 | `subscription_button_cpa_14d` | numeric |
| 351 | `dpv_views_14d` | numeric |
| 352 | `mashup_shop_now_click_cpa_14d` | numeric |
| 353 | `video_download_rate_14d` | numeric |
| 354 | `add_to_watchlist_cvr_14d` | numeric |
| 355 | `player_trailers_clicks_14d` | numeric |
| 356 | `mashup_subscribe_and_save_14d` | numeric |
| 357 | `click_on_redirect_cvr_14d` | numeric |
| 358 | `page_view_cvr_14d` | numeric |
| 359 | `added_to_shopping_cart_cvr_14d` | numeric |
| 360 | `ecpprpv_14d` | numeric |
| 361 | `email_load_14d` | numeric |
| 362 | `brand_search_cpa_14d` | numeric |
| 363 | `brand_search_views_14d` | numeric |
| 364 | `brand_search_rate_14d` | numeric |
| 365 | `brand_search_clicks_14d` | numeric |
| 366 | `brand_search_14d` | numeric |
| 367 | `invalid_impression_rate` | numeric |
| 368 | `gross_click_throughs` | numeric |
| 369 | `invalid_click_throughs_rate` | numeric |
| 370 | `invalid_impressions` | numeric |
| 371 | `invalid_click_throughs` | numeric |
| 372 | `gross_impressions` | numeric |
| 373 | `erpm_14d` | numeric |
| 374 | `total_purchases_14d` | numeric |
| 375 | `total_add_to_list_views_14d` | numeric |
| 376 | `viewability_rate` | numeric |
| 377 | `total_add_to_cart_cvr_14d` | numeric |
| 378 | `new_to_brand_units_sold_14d` | numeric |
| 379 | `fee_cpm1` | numeric |
| 380 | `new_to_brand_roas_14d` | numeric |
| 381 | `total_erpm_14d` | numeric |
| 382 | `fee_double_verify` | numeric |
| 383 | `total_subscribe_and_save_subscription_cpa_14d` | numeric |
| 384 | `total_new_to_brand_erpm_14d` | numeric |
| 385 | `total_add_to_list_cpa_14d` | numeric |
| 386 | `total_fee` | numeric |
| 387 | `total_add_to_cart_clicks_14d` | numeric |
| 388 | `fees` | numeric |
| 389 | `viewable_impressions` | numeric |
| 390 | `fee_com_score_absorbed` | numeric |
| 391 | `total_ecpp_14d` | numeric |
| 392 | `total_purchase_rate_14d` | numeric |
| 393 | `fee_integral_ad_science_absorbed` | numeric |
| 394 | `total_new_to_brand_purchases_views_14d` | numeric |
| 395 | `new_to_brand_product_sales_14d` | numeric |
| 396 | `total_add_to_list_14d` | numeric |
| 397 | `total_purchases_views_14d` | numeric |
| 398 | `total_prpv_clicks_14d` | numeric |
| 399 | `total_new_to_brand_roas_14d` | numeric |
| 400 | `total_add_to_cart_cpa_14d` | numeric |
| 401 | `total_detai_page_view_cpa_14d` | numeric |
| 402 | `agency_fee` | numeric |
| 403 | `fee_com_score` | numeric |
| 404 | `total_prpvr_14d` | numeric |
| 405 | `total_purchases_clicks_14d` | numeric |
| 406 | `roas_14d` | numeric |
| 407 | `total_subscribe_and_save_subscription_cvr_14d` | numeric |
| 408 | `total_ecpprpv_14d` | numeric |
| 409 | `total_detail_page_view_views_14d` | numeric |
| 410 | `fee_automotive` | numeric |
| 411 | `fee_cpm1_absorbed` | numeric |
| 412 | `total_detail_page_clicks_14d` | numeric |
| 413 | `total_new_to_brand_ecpp_14d` | numeric |
| 414 | `total_new_to_brand_purchases_14d` | numeric |
| 415 | `sales_14d` | numeric |
| 416 | `units_sold_14d` | numeric |
| 417 | `total_units_sold_14d` | numeric |
| 418 | `total_detail_page_views_14d` | numeric |
| 419 | `total_roas_14d` | numeric |
| 420 | `fee_double_verify_absorbed` | numeric |
| 421 | `total_new_to_brand_purchase_rate_14d` | numeric |
| 422 | `measurable_rate` | numeric |
| 423 | `measurable_impressions` | numeric |
| 424 | `fee_cpm3` | numeric |
| 425 | `total_percent_of_purchases_new_to_brand_14d` | numeric |
| 426 | `fee_doubleclick_campaign_manager` | numeric |
| 427 | `total_subscribe_and_save_subscription_clicks_14d` | numeric |
| 428 | `total_add_to_cart_views_14d` | numeric |
| 429 | `total_subscribe_and_save_subscription_views_14d` | numeric |
| 430 | `total_new_to_brand_purchases_clicks_14d` | numeric |
| 431 | `total_add_to_list_cvr_14d` | numeric |
| 432 | `total_prpv_views_14d` | numeric |
| 433 | `fee_cpm2_absorbed` | numeric |
| 434 | `total_detail_page_views_cvr_14d` | numeric |
| 435 | `fee_automotive_absorbed` | numeric |
| 436 | `total_add_to_list_clicks_14d` | numeric |
| 437 | `total_add_to_cart_14d` | numeric |
| 438 | `fee_doubleclick_campaign_manager_absorbed` | numeric |
| 439 | `total_sales_14d` | numeric |
| 440 | `total_prpv_14d` | numeric |
| 441 | `fee_cpm2` | numeric |
| 442 | `total_new_to_brand_units_sold_14d` | numeric |
| 443 | `total_subscribe_and_save_subscriptions_14d` | numeric |
| 444 | `fee_integral_ad_science` | numeric |
| 445 | `new_to_brand_erpm_14d` | numeric |
| 446 | `total_new_to_brand_product_sales_14d` | numeric |
| 447 | `fee_cpm3_absorbed` | numeric |
| 448 | `download_date` | date |

### `amazon_source_data.dsp_lineitem` (32 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `orderid` | character varying |
| 5 | `lineitemtid` | character varying |
| 6 | `name` | character varying |
| 7 | `lineitemtype` | character varying |
| 8 | `startdatetime` | timestamp with time zone |
| 9 | `enddatetime` | timestamp with time zone |
| 10 | `totalbudgetamount` | numeric |
| 11 | `deliverystatus` | character varying |
| 12 | `deliveryactivationstatus` | character varying |
| 13 | `maxsupplybid` | numeric |
| 14 | `basesupplybid` | numeric |
| 15 | `version` | bigint |
| 16 | `maximpressions` | bigint |
| 17 | `frequencytype` | character varying |
| 18 | `timeunitcount` | bigint |
| 19 | `timeunit` | character varying |
| 20 | `deliveryprofile` | character varying |
| 21 | `catchupboostpercentage` | bigint |
| 22 | `bidstrategy` | character varying |
| 23 | `automatebudgetallocation` | boolean |
| 24 | `advertisedproductcategoryids` | character varying |
| 25 | `targetingsettingsitelanguage` | character varying |
| 26 | `targetingsettingvideocompletiontier` | character varying |
| 27 | `targetingsettingviewabilitytier` | character varying |
| 28 | `targetingsettingincludeunmeasurableimpressions` | boolean |
| 29 | `targetingsettingtimezonetype` | character varying |
| 30 | `targetingsettinguserlocation` | character varying |
| 31 | `targetingsettinguserlocationsignal` | character varying |
| 32 | `last_updated_date` | timestamp with time zone |

### `amazon_source_data.dsp_lineitem_budgetcap` (7 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `orderid` | character varying |
| 5 | `lineitemtid` | character varying |
| 6 | `recurrencetimeperiod` | character varying |
| 7 | `amount` | numeric |

### `amazon_source_data.dsp_lineitemandcreativeassociation` (5 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `lineitemid` | character varying |
| 5 | `creativeid` | character varying |

### `amazon_source_data.dsp_order` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `orderid` | character varying |
| 5 | `startdatetime` | timestamp with time zone |
| 6 | `enddatetime` | timestamp with time zone |
| 7 | `totalbudgetamount` | numeric |
| 8 | `currencycode` | character varying |
| 9 | `ordername` | character varying |
| 10 | `agencyfeepercentage` | numeric |
| 11 | `deliverystatus` | character varying |
| 12 | `deliveryactivationstatus` | character varying |
| 13 | `productlocation` | character varying |
| 14 | `goal` | character varying |
| 15 | `goalkpi` | character varying |
| 16 | `createddate` | timestamp with time zone |
| 17 | `autooptimizations` | character varying |
| 18 | `optimizationbiddingstrategy` | character varying |
| 19 | `frequencycaptype` | character varying |
| 20 | `frequencycapmaximpressions` | bigint |
| 21 | `frequencycaptimeunitcount` | bigint |
| 22 | `frequencycaptimeunit` | character varying |
| 23 | `goaltargetkpi` | numeric |
| 24 | `last_updated_date` | timestamp with time zone |

### `amazon_source_data.dsp_order_budgetcap` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `orderid` | character varying |
| 5 | `recurrencetimeperiod` | character varying |
| 6 | `amount` | numeric |

### `amazon_source_data.dsp_order_budgetflight` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `orderid` | character varying |
| 5 | `flightid` | bigint |
| 6 | `startdatetime` | timestamp with time zone |
| 7 | `enddatetime` | timestamp with time zone |
| 8 | `amount` | numeric |
| 9 | `spentamount` | numeric |

### `amazon_source_data.dsp_product_report` (95 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `advertiserid` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `reportdate` | date |
| 5 | `productid` | character varying |
| 6 | `orderid` | character varying |
| 7 | `lineitemid` | character varying |
| 8 | `amazonstandardid` | character varying |
| 9 | `reportgranularity` | character varying |
| 10 | `parentasin` | character varying |
| 11 | `marketplace` | character varying |
| 12 | `brandname` | character varying |
| 13 | `asinconversiontype` | character varying |
| 14 | `featuredasin` | character |
| 15 | `brandhalonewtobrandpurchasesviews14d` | bigint |
| 16 | `brandhalodetailpageclicks14d` | bigint |
| 17 | `totalpurchases14d` | bigint |
| 18 | `brandhaloaddtocartclicks14d` | bigint |
| 19 | `totaladdtolistviews14d` | bigint |
| 20 | `brandhalopurchases14d` | bigint |
| 21 | `brandhaloaddtolistviews14d` | bigint |
| 22 | `newtobrandunitssold14d` | bigint |
| 23 | `atcclicks14d` | bigint |
| 24 | `newtobrandpurchasesviews14d` | bigint |
| 25 | `totaladdtocartclicks14d` | bigint |
| 26 | `brandhalodetailpage14d` | bigint |
| 27 | `newsubscribeandsaveviews14d` | bigint |
| 28 | `newtobrandpurchases14d` | bigint |
| 29 | `prpv14d` | bigint |
| 30 | `brandhalototalsales14d` | numeric |
| 31 | `newtobrandproductsales14d` | numeric |
| 32 | `totalnewtobrandpurchasesviews14d` | bigint |
| 33 | `brandhalototalunitssold14d` | bigint |
| 34 | `totaladdtolist14d` | bigint |
| 35 | `brandhalonewtobrandpurchasesclicks14d` | bigint |
| 36 | `totalpurchasesviews14d` | bigint |
| 37 | `totalprpvclicks14d` | bigint |
| 38 | `purchasesviews14d` | bigint |
| 39 | `brandhaloaddtocartviews14d` | bigint |
| 40 | `brandhaloproductreviewpageclicks14d` | bigint |
| 41 | `totalpurchasesclicks14d` | bigint |
| 42 | `atcviews14d` | bigint |
| 43 | `brandhalototalnewtobrandsales14d` | numeric |
| 44 | `productgroup` | character varying |
| 45 | `productsubcategory` | character varying |
| 46 | `productname` | character varying |
| 47 | `totaldetailpageviewviews14d` | bigint |
| 48 | `totaldetailpageclicks14d` | bigint |
| 49 | `brandhalonewsubscribeandsave14d` | bigint |
| 50 | `atl14d` | bigint |
| 51 | `dpvclicks14d` | bigint |
| 52 | `sales14d` | numeric |
| 53 | `totalnewtobrandpurchases14d` | bigint |
| 54 | `unitssold14d` | bigint |
| 55 | `newtobrandpurchasesclicks14d` | bigint |
| 56 | `totalunitssold14d` | bigint |
| 57 | `totaldetailpageviews14d` | bigint |
| 58 | `brandhalototalnewtobrandunitssold14d` | bigint |
| 59 | `brandhaloproductreviewpage14d` | bigint |
| 60 | `totalpercentofpurchasesnewtobrand14d` | numeric |
| 61 | `totalsubscribeandsavesubscriptionclicks14d` | bigint |
| 62 | `totaladdtocartviews14d` | bigint |
| 63 | `purchases14d` | bigint |
| 64 | `brandhaloproductreviewpageviews14d` | bigint |
| 65 | `totalsubscribeandsavesubscriptionviews14d` | bigint |
| 66 | `percentofpurchasesnewtobrand14d` | numeric |
| 67 | `brandhalopurchasesclicks14d` | bigint |
| 68 | `brandhalodetailpageviews14d` | bigint |
| 69 | `totalnewtobrandpurchasesclicks14d` | bigint |
| 70 | `atlviews14d` | bigint |
| 71 | `brandhaloaddtolist14d` | bigint |
| 72 | `newsubscribeandsave14d` | bigint |
| 73 | `totalprpvviews14d` | bigint |
| 74 | `prpvviews14d` | bigint |
| 75 | `productcategory` | character varying |
| 76 | `totaladdtocart14d` | bigint |
| 77 | `totaladdtolistclicks14d` | bigint |
| 78 | `brandhalonewsubscribeandsaveviews14d` | bigint |
| 79 | `dpvviews14d` | bigint |
| 80 | `totalsales14d` | numeric |
| 81 | `newsubscribeandsaveclicks14d` | bigint |
| 82 | `atlclicks14d` | bigint |
| 83 | `totalprpv14d` | bigint |
| 84 | `atc14d` | bigint |
| 85 | `purchasesclicks14d` | bigint |
| 86 | `brandhalonewtobrandpurchases14d` | bigint |
| 87 | `totalsubscribeandsavesubscriptions14d` | bigint |
| 88 | `brandhalopurchasesviews14d` | bigint |
| 89 | `prpvclicks14d` | bigint |
| 90 | `dpv14d` | bigint |
| 91 | `brandhalonewsubscribeandsaveclicks14d` | bigint |
| 92 | `brandhaloaddtolistclicks14d` | bigint |
| 93 | `brandhalopercentofpurchasesnewtobrand14d` | numeric |
| 94 | `brandhaloaddtocart14d` | bigint |
| 95 | `download_date` | date |

### `amazon_source_data.monthly_budget` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `monthly_budget` | bigint |
| 4 | `app_name` | character varying |
| 5 | `start_date_of_month` | date |
| 6 | `month_name` | character varying |

### `amazon_source_data.replenishment_offer` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `marketplace_id` | character varying |
| 4 | `auto_enrollment` | character varying |
| 5 | `asin` | character varying |
| 6 | `sku` | character varying |
| 7 | `selling_partner_funded_base_discount_percentage` | numeric |
| 8 | `selling_partner_funded_tiered_discount_percentage` | numeric |
| 9 | `amazon_funded_base_discount_percentage` | numeric |
| 10 | `amazon_funded_tiered_discount_percentage` | numeric |
| 11 | `enrollment_method` | character varying |
| 12 | `program_type` | character varying |
| 13 | `eligibility` | character varying |
| 14 | `vendor_codes` | character varying |
| 15 | `download_date` | date |

### `amazon_source_data.replenishment_offer_metrics` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `marketplace_id` | character varying |
| 4 | `program_type` | character varying |
| 5 | `aggregation_frequency` | character varying |
| 6 | `time_period_type` | character varying |
| 7 | `asin` | character varying |
| 8 | `not_delivered_due_to_oos` | numeric |
| 9 | `total_subscriptions_revenue` | numeric |
| 10 | `shipped_subscription_units` | numeric |
| 11 | `active_subscriptions` | numeric |
| 12 | `revenue_penetration` | numeric |
| 13 | `start_date` | date |
| 14 | `end_date` | date |
| 15 | `download_date` | date |

### `amazon_source_data.sellercentral_allfinancialeventlist` (42 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `currency_code` | character varying |
| 6 | `shipment_event_list` | super |
| 7 | `shipment_settle_event_list` | super |
| 8 | `refund_event_list` | super |
| 9 | `guarantee_claim_event_list` | super |
| 10 | `charge_back_event_list` | super |
| 11 | `pay_with_amazon_event_list` | super |
| 12 | `service_provider_credit_event_list` | super |
| 13 | `retro_charge_event_list` | super |
| 14 | `rental_transaction_event_list` | super |
| 15 | `product_ads_payment_event_list` | super |
| 16 | `service_fee_event_list` | super |
| 17 | `seller_deal_payment_event_list` | super |
| 18 | `debt_recovery_event_list` | super |
| 19 | `loan_servicing_event_list` | super |
| 20 | `adjustment_event_list` | super |
| 21 | `safet_reimbursement_event_list` | super |
| 22 | `seller_review_enrollment_payment_event_list` | super |
| 23 | `fba_liquidation_event_list` | super |
| 24 | `coupon_payment_event_list` | super |
| 25 | `imaging_services_fee_event_list` | super |
| 26 | `network_commingling_transaction_event_list` | super |
| 27 | `affordability_expense_event_list` | super |
| 28 | `affordability_expense_reversal_event_list` | super |
| 29 | `removal_shipment_event_list` | super |
| 30 | `removal_shipment_adjustment_event_list` | super |
| 31 | `trial_shipment_event_list` | super |
| 32 | `tds_reimbursement_event_list` | super |
| 33 | `adhoc_disbursement_event_list` | super |
| 34 | `tax_with_holding_event_list` | super |
| 35 | `charge_refund_event_list` | super |
| 36 | `failed_adhoc_disbursement_event_list` | super |
| 37 | `value_added_service_charge_event_list` | super |
| 38 | `capacity_reservation_billing_event_list` | super |
| 39 | `report_start_date` | date |
| 40 | `report_end_date` | date |
| 41 | `market_place_id` | character varying |
| 42 | `download_date` | date |

### `amazon_source_data.sellercentral_alllistings_report` (34 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `currency_code` | character varying |
| 4 | `item_name` | character varying |
| 5 | `item_description` | character varying |
| 6 | `listing_id` | character varying |
| 7 | `seller_sku` | character varying |
| 8 | `price` | numeric |
| 9 | `quantity` | integer |
| 10 | `open_date` | timestamp with time zone |
| 11 | `image_url` | character varying |
| 12 | `item_is_marketplace` | boolean |
| 13 | `product_id_type` | integer |
| 14 | `zshop_shipping_fee` | integer |
| 15 | `item_note` | character varying |
| 16 | `item_condition` | integer |
| 17 | `zshop_category1` | character varying |
| 18 | `zshop_browse_path` | character varying |
| 19 | `zshop_storefront_feature` | character varying |
| 20 | `asin1` | character varying |
| 21 | `asin2` | character varying |
| 22 | `asin3` | character varying |
| 23 | `will_ship_internationally` | boolean |
| 24 | `expedited_shipping` | character varying |
| 25 | `zshop_boldface` | character varying |
| 26 | `product_id` | character varying |
| 27 | `bid_for_featured_placement` | character varying |
| 28 | `add_delete` | character varying |
| 29 | `pending_quantity` | integer |
| 30 | `fulfillment_channel` | character varying |
| 31 | `merchant_shipping_group` | character varying |
| 32 | `status` | character varying |
| 33 | `report_date` | date |
| 34 | `download_date` | date |

### `amazon_source_data.sellercentral_couponperformance_asin` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `coupon_performance_coupon_id` | bigint |
| 5 | `asin` | character varying |
| 6 | `download_date` | date |

### `amazon_source_data.sellercentral_couponperformance_coupon` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `coupon_performance_report_id` | bigint |
| 6 | `coupon_id` | character varying |
| 7 | `merchant_id` | character varying |
| 8 | `market_place_id` | character varying |
| 9 | `name` | character varying |
| 10 | `website_message` | character varying |
| 11 | `start_date_time` | timestamp with time zone |
| 12 | `end_date_time` | timestamp with time zone |
| 13 | `discount_type` | character varying |
| 14 | `discount_amount` | numeric |
| 15 | `total_discount` | numeric |
| 16 | `clips` | integer |
| 17 | `redemptions` | integer |
| 18 | `budget` | numeric |
| 19 | `budget_spent` | numeric |
| 20 | `budget_remaining` | numeric |
| 21 | `budget_percentage_used` | numeric |
| 22 | `sales` | numeric |
| 23 | `download_date` | date |
| 24 | `coupon_performance_coupon_id` | bigint |

### `amazon_source_data.sellercentral_couponperformance_report` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `coupon_performance_report_id` | bigint |
| 6 | `coupon_start_date_from` | timestamp with time zone |
| 7 | `coupon_start_date_to` | timestamp with time zone |
| 8 | `report_date` | date |
| 9 | `download_date` | date |

### `amazon_source_data.sellercentral_fbaamazonfulfilledinventory_report` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `asin` | character varying |
| 5 | `report_date` | date |
| 6 | `seller_sku` | character varying |
| 7 | `fulfillment_channel_sku` | character varying |
| 8 | `condition_type` | character varying |
| 9 | `warehouse_condition_code` | character varying |
| 10 | `quantity_available` | integer |
| 11 | `download_date` | date |

### `amazon_source_data.sellercentral_fbadailyinventoryhistory_report` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `snapshot_date` | timestamp with time zone |
| 5 | `fnsku` | character varying |
| 6 | `sku` | character varying |
| 7 | `product_name` | character varying |
| 8 | `quantity` | bigint |
| 9 | `fulfillment_center_id` | character varying |
| 10 | `detailed_disposition` | character varying |
| 11 | `country` | character varying |
| 12 | `report_date` | date |
| 13 | `download_date` | date |

### `amazon_source_data.sellercentral_fbafeepreview_report` (32 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `currency_code` | character varying |
| 6 | `report_date` | date |
| 7 | `sku` | character varying |
| 8 | `fnsku` | character varying |
| 9 | `asin` | character varying |
| 10 | `product_name` | character varying |
| 11 | `product_group` | character varying |
| 12 | `brand` | character varying |
| 13 | `fulfilled_by` | character varying |
| 14 | `your_price` | numeric |
| 15 | `sales_price` | numeric |
| 16 | `longest_side` | numeric |
| 17 | `median_side` | numeric |
| 18 | `shortest_side` | numeric |
| 19 | `length_and_girth` | numeric |
| 20 | `unit_of_dimension` | character varying |
| 21 | `item_package_weight` | numeric |
| 22 | `unit_of_weight` | character varying |
| 23 | `product_size_tier` | character varying |
| 24 | `currency` | character varying |
| 25 | `estimated_fee_total` | numeric |
| 26 | `estimated_referral_fee_per_unit` | numeric |
| 27 | `estimated_variable_closing_fee` | numeric |
| 28 | `estimated_order_handling_fee_per_order` | numeric |
| 29 | `estimated_pick_pack_fee_per_unit` | numeric |
| 30 | `estimated_weight_handling_fee_per_unit` | numeric |
| 31 | `expected_fulfillment_fee_per_unit` | numeric |
| 32 | `download_date` | date |

### `amazon_source_data.sellercentral_fbainventoryage_report` (43 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `snapshot_date` | date |
| 6 | `sku` | character varying |
| 7 | `fnsku` | character varying |
| 8 | `asin` | character varying |
| 9 | `product_name` | character varying |
| 10 | `condition` | character varying |
| 11 | `avaliable_quantity_sellable` | integer |
| 12 | `qty_with_removals_in_progress` | integer |
| 13 | `inv_age_0_to_90_days` | integer |
| 14 | `inv_age_91_to_180_days` | integer |
| 15 | `inv_age_181_to_270_days` | integer |
| 16 | `inv_age_271_to_365_days` | integer |
| 17 | `inv_age_365_plus_days` | integer |
| 18 | `currency` | character varying |
| 19 | `qty_to_be_charged_ltsf_6_mo` | integer |
| 20 | `projected_ltsf_6_mo` | numeric |
| 21 | `qty_to_be_charged_ltsf_12_mo` | integer |
| 22 | `projected_ltsf_12_mo` | numeric |
| 23 | `units_shipped_last_7_days` | integer |
| 24 | `units_shipped_last_30_days` | integer |
| 25 | `units_shipped_last_60_days` | integer |
| 26 | `units_shipped_last_90_days` | integer |
| 27 | `alert` | character varying |
| 28 | `your_price` | numeric |
| 29 | `sales_price` | numeric |
| 30 | `lowest_price_new` | numeric |
| 31 | `lowest_price_used` | numeric |
| 32 | `recommended_action` | character varying |
| 33 | `healthy_inventory_level` | integer |
| 34 | `recommended_sales_price` | numeric |
| 35 | `recommended_sale_duration_days` | integer |
| 36 | `recommended_removal_quantity` | integer |
| 37 | `estimated_cost_savings_of_recommended_actions` | numeric |
| 38 | `sell_through` | numeric |
| 39 | `item_volume` | numeric |
| 40 | `volume_units` | character varying |
| 41 | `storage_type` | character varying |
| 42 | `report_date` | date |
| 43 | `download_date` | date |

### `amazon_source_data.sellercentral_fbainventoryhealth_report` (53 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `snapshot_date` | timestamp with time zone |
| 6 | `sku` | character varying |
| 7 | `fnsku` | character varying |
| 8 | `asin` | character varying |
| 9 | `product_name` | character varying |
| 10 | `condition` | character varying |
| 11 | `sales_rank` | bigint |
| 12 | `product_group` | character varying |
| 13 | `total_quantity` | bigint |
| 14 | `sellable_quantity` | bigint |
| 15 | `unsellable_quantity` | bigint |
| 16 | `inv_age_0_to_90_days` | bigint |
| 17 | `inv_age_91_to_180_days` | bigint |
| 18 | `inv_age_181_to_270_days` | bigint |
| 19 | `inv_age_271_to_365_days` | bigint |
| 20 | `inv_age_365_plus_days` | bigint |
| 21 | `units_shipped_last_24_hrs` | bigint |
| 22 | `units_shipped_last_7_days` | bigint |
| 23 | `units_shipped_last_30_days` | bigint |
| 24 | `units_shipped_last_90_days` | bigint |
| 25 | `units_shipped_last_180_days` | bigint |
| 26 | `units_shipped_last_365_days` | bigint |
| 27 | `weeks_of_cover_t7` | character varying |
| 28 | `weeks_of_cover_t30` | character varying |
| 29 | `weeks_of_cover_t90` | character varying |
| 30 | `weeks_of_cover_t180` | character varying |
| 31 | `weeks_of_cover_t365` | character varying |
| 32 | `num_afn_new_sellers` | bigint |
| 33 | `num_afn_used_sellers` | bigint |
| 34 | `currency` | character varying |
| 35 | `your_price` | numeric |
| 36 | `sales_price` | numeric |
| 37 | `lowest_afn_new_price` | numeric |
| 38 | `lowest_afn_used_price` | numeric |
| 39 | `lowest_mfn_new_price` | numeric |
| 40 | `lowest_mfn_used_price` | numeric |
| 41 | `qty_to_be_charged_ltsf_12_mo` | bigint |
| 42 | `qty_in_long_term_storage_program` | bigint |
| 43 | `qty_with_removals_in_progress` | bigint |
| 44 | `projected_ltsf_12_mo` | numeric |
| 45 | `per_unit_volume` | numeric |
| 46 | `is_hazmat` | character varying |
| 47 | `in_bound_quantity` | bigint |
| 48 | `asin_limit` | bigint |
| 49 | `inbound_recommend_quantity` | bigint |
| 50 | `qty_to_be_charged_ltsf_6_mo` | bigint |
| 51 | `projected_ltsf_6_mo` | numeric |
| 52 | `report_date` | date |
| 53 | `download_date` | date |

### `amazon_source_data.sellercentral_fbaledgerdetailed_report` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `date` | date |
| 4 | `fnsku` | character varying |
| 5 | `asin` | character varying |
| 6 | `msku` | character varying |
| 7 | `title` | character varying |
| 8 | `event_type` | character varying |
| 9 | `reference_id` | character varying |
| 10 | `quantity` | integer |
| 11 | `fulfillment_center` | character varying |
| 12 | `disposition` | character varying |
| 13 | `reason` | character varying |
| 14 | `country` | character varying |
| 15 | `reconciled_quantity` | integer |
| 16 | `unreconciled_quantity` | integer |
| 17 | `download_date` | date |

### `amazon_source_data.sellercentral_fbaledgersummary_report` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `date` | date |
| 4 | `fnsku` | character varying |
| 5 | `asin` | character varying |
| 6 | `msku` | character varying |
| 7 | `title` | character varying |
| 8 | `disposition` | character varying |
| 9 | `starting_warehouse_balance` | integer |
| 10 | `in_transit_between_warehouses` | integer |
| 11 | `receipts` | integer |
| 12 | `customer_shipments` | integer |
| 13 | `customer_returns` | integer |
| 14 | `vendor_returns` | integer |
| 15 | `warehouse_transfer_in_out` | integer |
| 16 | `found` | integer |
| 17 | `lost` | integer |
| 18 | `damaged` | integer |
| 19 | `disposed` | integer |
| 20 | `other_events` | integer |
| 21 | `ending_warehouse_balance` | integer |
| 22 | `unknown_events` | integer |
| 23 | `location` | character varying |
| 24 | `download_date` | date |

### `amazon_source_data.sellercentral_fbalongtermstoragefeecharges_report` (19 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `snapshot_date` | timestamp with time zone |
| 4 | `sku` | character varying |
| 5 | `asin` | character varying |
| 6 | `fnsku` | character varying |
| 7 | `product_name` | character varying |
| 8 | `condition` | character varying |
| 9 | `per_unit_volume` | numeric |
| 10 | `currency` | character varying |
| 11 | `volume_unit` | character varying |
| 12 | `country` | character varying |
| 13 | `qty_charged` | numeric |
| 14 | `amount_charged` | numeric |
| 15 | `surcharge_age_tier` | character varying |
| 16 | `rate_surcharge` | numeric |
| 17 | `report_start_date` | date |
| 18 | `report_end_date` | date |
| 19 | `download_date` | date |

### `amazon_source_data.sellercentral_fbamanageinventory_report` (26 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `currency_code` | character varying |
| 4 | `sku` | character varying |
| 5 | `fnsku` | character varying |
| 6 | `asin` | character varying |
| 7 | `product_name` | character varying |
| 8 | `condition` | character varying |
| 9 | `your_price` | numeric |
| 10 | `mfn_listing_exists` | character varying |
| 11 | `mfn_fulfillable_quantity` | bigint |
| 12 | `afn_listing_exists` | character varying |
| 13 | `afn_warehouse_quantity` | bigint |
| 14 | `afn_fulfillable_quantity` | bigint |
| 15 | `afn_unsellable_quantity` | bigint |
| 16 | `afn_reserved_quantity` | bigint |
| 17 | `afn_total_quantity` | bigint |
| 18 | `per_unit_volume` | numeric |
| 19 | `afn_inbound_working_quantity` | bigint |
| 20 | `afn_inbound_shipped_quantity` | bigint |
| 21 | `afn_inbound_receiving_quantity` | bigint |
| 22 | `afn_researching_quantity` | bigint |
| 23 | `afn_reserved_future_supply` | bigint |
| 24 | `afn_future_supply_buyable` | bigint |
| 25 | `report_date` | date |
| 26 | `download_date` | date |

### `amazon_source_data.sellercentral_fbamonthlyinventoryhistory_report` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `month` | date |
| 5 | `fnsku` | character varying |
| 6 | `sku` | character varying |
| 7 | `product_name` | character varying |
| 8 | `average_quantity` | numeric |
| 9 | `end_quantity` | integer |
| 10 | `fulfillment_center_id` | character varying |
| 11 | `detailed_disposition` | character varying |
| 12 | `country` | character varying |
| 13 | `report_start_date` | date |
| 14 | `report_end_date` | date |
| 15 | `download_date` | date |

### `amazon_source_data.sellercentral_fbapromotions_report` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `shipment_date` | date |
| 6 | `item_promotion_discount` | numeric |
| 7 | `item_promotion_id` | character varying |
| 8 | `description` | character varying |
| 9 | `promotion_rule_value` | bigint |
| 10 | `amazon_order_id` | character varying |
| 11 | `shipment_id` | character varying |
| 12 | `shipment_item_id` | character varying |
| 13 | `download_date` | date |

### `amazon_source_data.sellercentral_fbareceivedinventory_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `received_date` | timestamp with time zone |
| 5 | `fnsku` | character varying |
| 6 | `sku` | character varying |
| 7 | `product_name` | character varying |
| 8 | `quantity` | bigint |
| 9 | `fba_shipment_id` | character varying |
| 10 | `fulfillment_center_id` | character varying |
| 11 | `report_date` | date |
| 12 | `download_date` | date |

### `amazon_source_data.sellercentral_fbareimbursements_report` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `approval_date` | timestamp with time zone |
| 5 | `reimbursement_id` | character varying |
| 6 | `case_id` | character varying |
| 7 | `amazon_order_id` | character varying |
| 8 | `reason` | character varying |
| 9 | `sku` | character varying |
| 10 | `asin` | character varying |
| 11 | `fnsku` | character varying |
| 12 | `product_name` | character varying |
| 13 | `condition` | character varying |
| 14 | `currency_unit` | character varying |
| 15 | `amount_per_unit` | numeric |
| 16 | `amount_total` | numeric |
| 17 | `quantity_reimbursed_cash` | integer |
| 18 | `quantity_reimbursed_inventory` | integer |
| 19 | `quantity_reimbursed_total` | integer |
| 20 | `original_reimbursement_id` | character varying |
| 21 | `original_reimbursement_type` | character varying |
| 22 | `report_start_date` | date |
| 23 | `report_end_date` | date |
| 24 | `download_date` | date |

### `amazon_source_data.sellercentral_fbareservedinventory_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `seller_id` | integer |
| 4 | `sku` | character varying |
| 5 | `fnsku` | character varying |
| 6 | `asin` | character varying |
| 7 | `product_name` | character varying |
| 8 | `reserved_qty` | numeric |
| 9 | `reserved_customerorders` | numeric |
| 10 | `reserved_fc_transfers` | numeric |
| 11 | `reserved_fc_processing` | numeric |
| 12 | `report_date` | date |

### `amazon_source_data.sellercentral_fbareturns_report` (19 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `return_date` | timestamp with time zone |
| 5 | `order_id` | character varying |
| 6 | `sku` | character varying |
| 7 | `asin` | character varying |
| 8 | `fnsku` | character varying |
| 9 | `product_name` | character varying |
| 10 | `quantity` | integer |
| 11 | `fulfillment_center_id` | character varying |
| 12 | `detailed_disposition` | character varying |
| 13 | `reason` | character varying |
| 14 | `status` | character varying |
| 15 | `license_plate_number` | character varying |
| 16 | `customer_comments` | character varying |
| 17 | `seller_id` | character varying |
| 18 | `report_date` | date |
| 19 | `download_date` | date |

### `amazon_source_data.sellercentral_fbastoragefees_report` (33 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `currency_code` | character varying |
| 4 | `asin` | character varying |
| 5 | `fnsku` | character varying |
| 6 | `product_name` | character varying |
| 7 | `fulfillment_center` | character varying |
| 8 | `country_code` | character varying |
| 9 | `longest_side` | numeric |
| 10 | `median_side` | numeric |
| 11 | `shortest_side` | numeric |
| 12 | `measurement_units` | character varying |
| 13 | `weight` | numeric |
| 14 | `weight_units` | character varying |
| 15 | `item_volume` | numeric |
| 16 | `volume_units` | character varying |
| 17 | `product_size_tier` | character varying |
| 18 | `average_quantity_on_hand` | numeric |
| 19 | `average_quantity_pending_removal` | numeric |
| 20 | `estimated_total_item_volume` | numeric |
| 21 | `month_of_charge` | character varying |
| 22 | `storage_rate` | numeric |
| 23 | `currency` | character varying |
| 24 | `estimated_monthly_storage_fee` | numeric |
| 25 | `dangerous_goods_storage_type` | character varying |
| 26 | `eligible_for_inventory_discount` | character varying |
| 27 | `qualifies_for_inventory_discount` | character varying |
| 28 | `total_incentive_fee_amount` | numeric |
| 29 | `breakdown_incentive_fee_amount` | numeric |
| 30 | `average_quantity_customer_orders` | numeric |
| 31 | `report_start_date` | date |
| 32 | `report_end_date` | date |
| 33 | `download_date` | date |

### `amazon_source_data.sellercentral_fbastrandedinventory_report` (21 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `seller_id` | integer |
| 4 | `primary_action` | character varying |
| 5 | `date_stranded` | date |
| 6 | `status_primary` | character varying |
| 7 | `status_secondary` | character varying |
| 8 | `error_message` | character varying |
| 9 | `stranded_reason` | character varying |
| 10 | `asin` | character varying |
| 11 | `sku` | character varying |
| 12 | `fnsku` | character varying |
| 13 | `product_name` | character varying |
| 14 | `condition` | character varying |
| 15 | `fulfilled_by` | character varying |
| 16 | `fulfillable_qty` | integer |
| 17 | `your_price` | numeric |
| 18 | `unfulfillable_qty` | integer |
| 19 | `reserved_quantity` | integer |
| 20 | `inbound_shipped_qty` | integer |
| 21 | `report_date` | date |

### `amazon_source_data.sellercentral_fbasubscribeandsaveforecast_report` (21 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `snapshot_date` | date |
| 4 | `offer_state` | character varying |
| 5 | `sku` | character varying |
| 6 | `fnsku` | character varying |
| 7 | `asin` | character varying |
| 8 | `estimated_avg_sns_discount_next_8_weeks` | numeric |
| 9 | `product_name` | character varying |
| 10 | `country` | character varying |
| 11 | `active_subscriptions` | bigint |
| 12 | `week_1_start_date` | date |
| 13 | `scheduled_sns_units_week_1` | bigint |
| 14 | `scheduled_sns_units_week_2` | bigint |
| 15 | `scheduled_sns_units_week_3` | bigint |
| 16 | `scheduled_sns_units_week_4` | bigint |
| 17 | `scheduled_sns_units_week_5` | bigint |
| 18 | `scheduled_sns_units_week_6` | bigint |
| 19 | `scheduled_sns_units_week_7` | bigint |
| 20 | `scheduled_sns_units_week_8` | bigint |
| 21 | `download_date` | date |

### `amazon_source_data.sellercentral_fbasubscribeandsaveperformance_report` (28 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `offer_state` | character varying |
| 4 | `snapshot_date` | date |
| 5 | `sku` | character varying |
| 6 | `fnsku` | character varying |
| 7 | `asin` | character varying |
| 8 | `product_name` | character varying |
| 9 | `country` | character varying |
| 10 | `week_1_start_date` | date |
| 11 | `sns_units_shipped_week_1` | bigint |
| 12 | `oos_rate_week_1` | numeric |
| 13 | `sns_sale_price_week_1` | numeric |
| 14 | `sns_discount_week_1` | numeric |
| 15 | `sns_units_shipped_week_2` | bigint |
| 16 | `oos_rate_week_2` | numeric |
| 17 | `sns_sale_price_week_2` | numeric |
| 18 | `sns_discount_week_2` | numeric |
| 19 | `sns_units_shipped_week_3` | bigint |
| 20 | `oos_rate_week_3` | numeric |
| 21 | `sns_sale_price_week_3` | numeric |
| 22 | `sns_discount_week_3` | numeric |
| 23 | `sns_units_shipped_week_4` | bigint |
| 24 | `oos_rate_week_4` | numeric |
| 25 | `sns_sale_price_week_4` | numeric |
| 26 | `sns_discount_week_4` | numeric |
| 27 | `seller_id` | character varying |
| 28 | `download_date` | date |

### `amazon_source_data.sellercentral_financialtransactions_itemlevelbreakdowns` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `transaction_id` | character varying |
| 6 | `breakdown_type` | character varying |
| 7 | `breakdown_amount` | numeric |
| 8 | `breakdown_id` | integer |
| 9 | `parent_break_down_id` | integer |
| 10 | `currency_code` | character varying |
| 11 | `item_id` | bigint |
| 12 | `id` | bigint |
| 13 | `report_start_date` | date |
| 14 | `report_end_date` | date |
| 15 | `download_date` | date |
| 16 | `parent_breakdown_hierarchy` | character varying |

### `amazon_source_data.sellercentral_financialtransactions_transactionlevelbreakdowns` (14 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `transaction_id` | character varying |
| 6 | `breakdown_type` | character varying |
| 7 | `breakdown_amount` | numeric |
| 8 | `breakdown_id` | integer |
| 9 | `parent_break_down_id` | integer |
| 10 | `currency_code` | character varying |
| 11 | `report_start_date` | date |
| 12 | `report_end_date` | date |
| 13 | `download_date` | date |
| 14 | `parent_breakdown_hierarchy` | character varying |

### `amazon_source_data.sellercentral_inventory_report` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `market_place_id` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `report_date` | date |
| 8 | `asin` | character varying |
| 9 | `sku` | character varying |
| 10 | `price` | numeric |
| 11 | `quantity` | integer |
| 12 | `business_price` | numeric |
| 13 | `quantity_price_type` | character varying |
| 14 | `quantity_lower_bound_1` | integer |
| 15 | `quantity_price_1` | numeric |
| 16 | `quantity_lower_bound_2` | integer |
| 17 | `quantity_price_2` | numeric |
| 18 | `quantity_lower_bound_3` | integer |
| 19 | `quantity_price_3` | numeric |
| 20 | `quantity_lower_bound_4` | integer |
| 21 | `quantity_price_4` | numeric |
| 22 | `quantity_lower_bound_5` | integer |
| 23 | `quantity_price_5` | numeric |
| 24 | `download_date` | date |

### `amazon_source_data.sellercentral_listingqualityandsuppressedlisting_report` (14 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `seller_id` | integer |
| 4 | `sku` | character varying |
| 5 | `asin` | character varying |
| 6 | `product_name` | character varying |
| 7 | `field_name` | character varying |
| 8 | `last_updated_date` | timestamp with time zone |
| 9 | `alert_type` | character varying |
| 10 | `current_value` | character varying |
| 11 | `alert_name` | character varying |
| 12 | `status` | character varying |
| 13 | `explanation` | character varying |
| 14 | `report_date` | date |

### `amazon_source_data.sellercentral_ordersbylastupdate_report` (39 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `amazon_order_id` | character varying |
| 5 | `merchant_order_id` | character varying |
| 6 | `purchase_date` | timestamp with time zone |
| 7 | `last_updated_date` | timestamp with time zone |
| 8 | `order_status` | character varying |
| 9 | `fulfillment_channel` | character varying |
| 10 | `sales_channel` | character varying |
| 11 | `order_channel` | character varying |
| 12 | `ship_service_level` | character varying |
| 13 | `product_name` | character varying |
| 14 | `sku` | character varying |
| 15 | `asin` | character varying |
| 16 | `number_of_items` | integer |
| 17 | `item_status` | character varying |
| 18 | `quantity` | integer |
| 19 | `currency` | character varying |
| 20 | `item_price` | numeric |
| 21 | `item_tax` | numeric |
| 22 | `shipping_price` | numeric |
| 23 | `shipping_tax` | numeric |
| 24 | `gift_wrap_price` | numeric |
| 25 | `gift_wrap_tax` | numeric |
| 26 | `item_promotion_discount` | numeric |
| 27 | `ship_promotion_discount` | numeric |
| 28 | `ship_city` | character varying |
| 29 | `ship_state` | character varying |
| 30 | `ship_postal_code` | character varying |
| 31 | `ship_country` | character varying |
| 32 | `promotion_ids` | character varying |
| 33 | `is_business_order` | boolean |
| 34 | `purchase_order_number` | character varying |
| 35 | `price_designation` | character varying |
| 36 | `buyer_company_name` | character varying |
| 37 | `license_state` | character varying |
| 38 | `license_expiration_date` | timestamp with time zone |
| 39 | `download_date` | date |

### `amazon_source_data.sellercentral_referralfeepreview_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `currency_code` | character varying |
| 6 | `report_date` | date |
| 7 | `seller_sku` | character varying |
| 8 | `asin` | character varying |
| 9 | `item_name` | character varying |
| 10 | `price` | numeric |
| 11 | `estimated_referral_fee_per_item` | numeric |
| 12 | `download_date` | date |

### `amazon_source_data.sellercentral_restockinventory_report` (47 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `seller_id` | integer |
| 4 | `country` | character varying |
| 5 | `product_name` | character varying |
| 6 | `fnsku` | character varying |
| 7 | `merchant_sku` | character varying |
| 8 | `asin` | character varying |
| 9 | `condition` | character varying |
| 10 | `supplier` | character varying |
| 11 | `supplier_part_no` | character varying |
| 12 | `currency_code` | character varying |
| 13 | `price` | numeric |
| 14 | `sales_last_30_days` | numeric |
| 15 | `units_sold_last_30_days` | character varying |
| 16 | `total_units` | integer |
| 17 | `inbound` | integer |
| 18 | `available` | integer |
| 19 | `fc_transfer` | integer |
| 20 | `fc_processing` | integer |
| 21 | `customer_order` | integer |
| 22 | `unfulfillable` | integer |
| 23 | `fulfilled_by` | character varying |
| 24 | `days_of_supply` | character varying |
| 25 | `alert` | character varying |
| 26 | `recommended_replenishment_qty` | integer |
| 27 | `recommended_ship_date` | timestamp with time zone |
| 28 | `inventory_level_thresholds_published_current_month` | character varying |
| 29 | `current_month_very_low_inventory_threshold` | integer |
| 30 | `current_month_minimum_inventory_threshold` | integer |
| 31 | `current_month_maximum_inventory_threshold` | integer |
| 32 | `current_month_very_high_inventory_threshold` | integer |
| 33 | `inventory_level_thresholds_published_next_month` | character varying |
| 34 | `next_month_very_low_inventory_threshold` | integer |
| 35 | `next_month_minimum_inventory_threshold` | integer |
| 36 | `next_month_maximum_inventory_threshold` | integer |
| 37 | `next_month_very_high_inventory_threshold` | integer |
| 38 | `utilization` | character varying |
| 39 | `maximum_shipment_quantity` | integer |
| 40 | `report_date` | date |
| 41 | `download_date` | date |
| 42 | `working` | integer |
| 43 | `shipped` | integer |
| 44 | `receiving` | integer |
| 45 | `total_days_of_supply` | character varying |
| 46 | `days_of_supply_at_amazon` | character varying |
| 47 | `unit_storage_size` | character varying |

### `amazon_source_data.sellercentral_sellerperformance_customerserviceperformance_report` (51 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `seller_performance_report_id` | bigint |
| 6 | `order_defect_rate_afn_reporting_date_from` | timestamp with time zone |
| 7 | `order_defect_rate_afn_reporting_date_to` | timestamp with time zone |
| 8 | `order_defect_rate_afn_status` | character varying |
| 9 | `order_defect_rate_afn_target_value` | numeric |
| 10 | `order_defect_rate_afn_target_condition` | character varying |
| 11 | `order_defect_rate_afn_order_with_defects_status` | character varying |
| 12 | `order_defect_rate_afn_order_with_defects_count` | integer |
| 13 | `order_defect_rate_afn_claims_status` | character varying |
| 14 | `order_defect_rate_afn_claims_count` | integer |
| 15 | `order_defect_rate_afn_chargebacks_status` | character varying |
| 16 | `order_defect_rate_afn_chargebacks_count` | integer |
| 17 | `order_defect_rate_afn_negative_feedback_status` | character varying |
| 18 | `order_defect_rate_afn_negative_feedback_count` | integer |
| 19 | `order_defect_rate_afn_order_count` | integer |
| 20 | `order_defect_rate_afn_rate` | numeric |
| 21 | `order_defect_rate_afn_fulfillment_type` | character varying |
| 22 | `order_defect_rate_mfn_reporting_date_from` | timestamp with time zone |
| 23 | `order_defect_rate_mfn_reporting_date_to` | timestamp with time zone |
| 24 | `order_defect_rate_mfn_status` | character varying |
| 25 | `order_defect_rate_mfn_target_value` | numeric |
| 26 | `order_defect_rate_mfn_target_condition` | character varying |
| 27 | `order_defect_rate_mfn_order_with_defects_status` | character varying |
| 28 | `order_defect_rate_mfn_order_with_defects_count` | integer |
| 29 | `order_defect_rate_mfn_claims_status` | character varying |
| 30 | `order_defect_rate_mfn_claims_count` | integer |
| 31 | `order_defect_rate_mfn_chargebacks_status` | character varying |
| 32 | `order_defect_rate_mfn_chargebacks_count` | integer |
| 33 | `order_defect_rate_mfn_negative_feedback_status` | character varying |
| 34 | `order_defect_rate_mfn_negative_feedback_count` | integer |
| 35 | `order_defect_rate_mfn_order_count` | integer |
| 36 | `order_defect_rate_mfn_rate` | numeric |
| 37 | `order_defect_rate_mfn_fulfillment_type` | character varying |
| 38 | `invoice_defect_rate_reporting_date_from` | timestamp with time zone |
| 39 | `invoice_defect_rate_reporting_date_to` | timestamp with time zone |
| 40 | `invoice_defect_rate_status` | character varying |
| 41 | `invoice_defect_rate_target_value` | numeric |
| 42 | `invoice_defect_rate_target_condition` | character varying |
| 43 | `invoice_defect_rate_invoice_defect_status` | character varying |
| 44 | `invoice_defect_rate_invoice_defect_count` | integer |
| 45 | `invoice_defect_rate_missing_invoice_status` | character varying |
| 46 | `invoice_defect_rate_missing_invoice_count` | integer |
| 47 | `invoice_defect_rate_late_invoice_status` | character varying |
| 48 | `invoice_defect_rate_late_invoice_count` | integer |
| 49 | `invoice_defect_rate_order_count` | integer |
| 50 | `invoice_defect_rate_rate` | numeric |
| 51 | `download_date` | date |

### `amazon_source_data.sellercentral_sellerperformance_policycompliance_report` (69 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `seller_performance_report_id` | bigint |
| 6 | `account_health_rating_ahr_status` | character varying |
| 7 | `account_health_rating_reporting_date_from` | timestamp with time zone |
| 8 | `account_health_rating_reporting_date_to` | timestamp with time zone |
| 9 | `listing_policy_violations_reporting_date_from` | timestamp with time zone |
| 10 | `listing_policy_violations_reporting_date_to` | timestamp with time zone |
| 11 | `listing_policy_violations_status` | character varying |
| 12 | `listing_policy_violations_target_value` | numeric |
| 13 | `listing_policy_violations_target_condition` | character varying |
| 14 | `listing_policy_violations_defects_count` | integer |
| 15 | `product_authenticity_cust_complaints_reporting_date_from` | timestamp with time zone |
| 16 | `product_authenticity_cust_complaints_reporting_date_to` | timestamp with time zone |
| 17 | `product_authenticity_cust_complaints_status` | character varying |
| 18 | `product_authenticity_cust_complaints_target_value` | numeric |
| 19 | `product_authenticity_cust_complaints_target_condition` | character varying |
| 20 | `product_authenticity_cust_complaints_defects_count` | integer |
| 21 | `product_condition_cust_complaints_reporting_date_from` | timestamp with time zone |
| 22 | `product_condition_cust_complaints_reporting_date_to` | timestamp with time zone |
| 23 | `product_condition_cust_complaints_status` | character varying |
| 24 | `product_condition_cust_complaints_target_value` | numeric |
| 25 | `product_condition_cust_complaints_target_condition` | character varying |
| 26 | `product_condition_cust_complaints_defects_count` | integer |
| 27 | `product_safety_cust_complaints_reporting_date_from` | timestamp with time zone |
| 28 | `product_safety_cust_complaints_reporting_date_to` | timestamp with time zone |
| 29 | `product_safety_cust_complaints_status` | character varying |
| 30 | `product_safety_cust_complaints_target_value` | numeric |
| 31 | `product_safety_cust_complaints_target_condition` | character varying |
| 32 | `product_safety_cust_complaints_defects_count` | integer |
| 33 | `received_intellectual_property_complaints_reporting_date_from` | timestamp with time zone |
| 34 | `received_intellectual_property_complaints_reporting_date_to` | timestamp with time zone |
| 35 | `received_intellectual_property_complaints_status` | character varying |
| 36 | `received_intellectual_property_complaints_target_value` | numeric |
| 37 | `received_intellectual_property_complaints_target_condition` | character varying |
| 38 | `received_intellectual_property_complaints_defects_count` | integer |
| 39 | `restricted_product_policy_violations_reporting_date_from` | timestamp with time zone |
| 40 | `restricted_product_policy_violations_reporting_date_to` | timestamp with time zone |
| 41 | `restricted_product_policy_violations_status` | character varying |
| 42 | `restricted_product_policy_violations_target_value` | numeric |
| 43 | `restricted_product_policy_violations_target_condition` | character varying |
| 44 | `restricted_product_policy_violations_defects_count` | integer |
| 45 | `suspected_intellectual_property_violations_reporting_date_from` | timestamp with time zone |
| 46 | `suspected_intellectual_property_violations_reporting_date_to` | timestamp with time zone |
| 47 | `suspected_intellectual_property_violations_status` | character varying |
| 48 | `suspected_intellectual_property_violations_target_value` | numeric |
| 49 | `suspected_intellectual_property_violations_target_condition` | character varying |
| 50 | `suspected_intellectual_property_violations_defects_count` | integer |
| 51 | `food_and_product_safety_issues_reporting_date_from` | timestamp with time zone |
| 52 | `food_and_product_safety_issues_reporting_date_to` | timestamp with time zone |
| 53 | `food_and_product_safety_issues_status` | character varying |
| 54 | `food_and_product_safety_issues_target_value` | numeric |
| 55 | `food_and_product_safety_issues_target_condition` | character varying |
| 56 | `food_and_product_safety_issues_defects_count` | integer |
| 57 | `customer_product_reviews_policy_violations_reporting_date_from` | timestamp with time zone |
| 58 | `customer_product_reviews_policy_violations_reporting_date_to` | timestamp with time zone |
| 59 | `customer_product_reviews_policy_violations_status` | character varying |
| 60 | `customer_product_reviews_policy_violations_target_value` | numeric |
| 61 | `customer_product_reviews_policy_violations_target_condition` | character varying |
| 62 | `customer_product_reviews_policy_violations_defects_count` | integer |
| 63 | `other_policy_violations_reporting_date_from` | timestamp with time zone |
| 64 | `other_policy_violations_reporting_date_to` | timestamp with time zone |
| 65 | `other_policy_violations_status` | character varying |
| 66 | `other_policy_violations_target_value` | numeric |
| 67 | `other_policy_violations_target_condition` | character varying |
| 68 | `other_policy_violations_defects_count` | integer |
| 69 | `download_date` | date |

### `amazon_source_data.sellercentral_sellerperformance_report` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `id` | bigint |
| 5 | `reporting_date_from` | timestamp with time zone |
| 6 | `reporting_date_to` | timestamp with time zone |
| 7 | `status` | character varying |
| 8 | `target_value` | numeric |
| 9 | `target_condition` | character varying |
| 10 | `defects_count` | integer |
| 11 | `report_date` | date |

### `amazon_source_data.sellercentral_settlement_report_v2` (31 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `seller_id` | character varying |
| 4 | `country_code` | character varying |
| 5 | `currency_code` | character varying |
| 6 | `settlement_start_date` | timestamp with time zone |
| 7 | `settlement_end_date` | timestamp with time zone |
| 8 | `deposit_date` | timestamp with time zone |
| 9 | `total_amount` | character varying |
| 10 | `transaction_type` | character varying |
| 11 | `order_id` | character varying |
| 12 | `merchant_order_id` | character varying |
| 13 | `adjustment_id` | character varying |
| 14 | `shipment_id` | character varying |
| 15 | `marketplace_name` | character varying |
| 16 | `amount_type` | character varying |
| 17 | `amount_description` | character varying |
| 18 | `amount` | numeric |
| 19 | `fulfillment_id` | character varying |
| 20 | `posted_date` | date |
| 21 | `posted_date_time` | timestamp with time zone |
| 22 | `order_item_code` | character varying |
| 23 | `merchant_order_item_id` | character varying |
| 24 | `merchant_adjustment_item_id` | character varying |
| 25 | `sku` | character varying |
| 26 | `quantity_purchased` | integer |
| 27 | `promotion_id` | character varying |
| 28 | `report_start_date` | date |
| 29 | `report_end_date` | date |
| 30 | `download_date` | date |
| 31 | `settlement_id` | character varying |

### `amazon_source_data.sellercentral_suppressedlistings_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `status` | character varying |
| 4 | `reason` | character varying |
| 5 | `sku` | character varying |
| 6 | `asin` | character varying |
| 7 | `product_name` | character varying |
| 8 | `condition` | integer |
| 9 | `status_change_date` | date |
| 10 | `issue_description` | character varying |
| 11 | `report_date` | date |
| 12 | `download_date` | date |

### `amazon_source_data.share_of_voice` (19 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `id` | bigint |
| 2 | `account_id` | bigint |
| 3 | `account_name` | character varying |
| 4 | `time_stamp` | date |
| 5 | `runtime` | text |
| 6 | `keyword` | character varying |
| 7 | `category` | character varying |
| 8 | `page_num` | integer |
| 9 | `position` | integer |
| 10 | `asin` | character varying |
| 11 | `asin_title` | character varying |
| 12 | `badge` | character varying |
| 13 | `seller_company` | character varying |
| 14 | `seller_company_type` | character varying |
| 15 | `type` | character varying |
| 16 | `display_price` | numeric |
| 17 | `rating_count` | integer |
| 18 | `rating` | character varying |
| 19 | `price_before_discount` | character varying |

### `amazon_source_data.vendorcentral_couponperformance_asin` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `couponperformance_coupon_id` | bigint |
| 6 | `asin` | character varying |
| 7 | `discount_type` | character varying |
| 8 | `discount_amount` | numeric |
| 9 | `download_date` | date |

### `amazon_source_data.vendorcentral_couponperformance_campaign` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `couponperformance_report_id` | bigint |
| 6 | `campaign_id` | character varying |
| 7 | `campaign_name` | character varying |
| 8 | `vendor_code` | character varying |
| 9 | `market_place_id` | character varying |
| 10 | `creation_date_time` | timestamp with time zone |
| 11 | `last_updated_time` | timestamp with time zone |
| 12 | `is_subscribe_and_save` | character varying |
| 13 | `budget_type` | character varying |
| 14 | `total_clips` | integer |
| 15 | `total_redemptions` | integer |
| 16 | `total_budget` | numeric |
| 17 | `total_budget_spent` | numeric |
| 18 | `total_budget_remaining` | numeric |
| 19 | `download_date` | date |
| 20 | `couponperformance_campaign_id` | bigint |

### `amazon_source_data.vendorcentral_couponperformance_coupon` (19 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `couponperformance_campaign_id` | bigint |
| 6 | `coupon_id` | character varying |
| 7 | `name` | character varying |
| 8 | `website_message` | character varying |
| 9 | `start_date_time` | timestamp with time zone |
| 10 | `end_date_time` | timestamp with time zone |
| 11 | `is_once_per_customer` | character varying |
| 12 | `clips` | integer |
| 13 | `redemptions` | integer |
| 14 | `budget` | numeric |
| 15 | `total_discount` | numeric |
| 16 | `budget_spent` | numeric |
| 17 | `budget_percentage_used` | numeric |
| 18 | `download_date` | date |
| 19 | `couponperformance_coupon_id` | bigint |

### `amazon_source_data.vendorcentral_couponperformance_report` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `country_code` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `couponperformance_report_id` | bigint |
| 6 | `campaign_start_date_from` | timestamp with time zone |
| 7 | `campaign_start_date_to` | timestamp with time zone |
| 8 | `report_date` | date |
| 9 | `download_date` | date |

### `amazon_source_data.vendorcentral_inventoryhealth` (39 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `vendor_account` | character varying |
| 4 | `vendor_id` | integer |
| 5 | `report_date` | date |
| 6 | `asin` | character varying |
| 7 | `currency` | character varying |
| 8 | `asin_name` | character varying |
| 9 | `parent_asin` | character varying |
| 10 | `isbn13` | character varying |
| 11 | `ean` | character varying |
| 12 | `upc` | character varying |
| 13 | `released_date` | date |
| 14 | `net_received_units` | integer |
| 15 | `sell_through_rate` | numeric |
| 16 | `open_purchase_order_qty` | integer |
| 17 | `sellable_on_hand_inventory` | numeric |
| 18 | `sellable_on_hand_inventory_30_day` | numeric |
| 19 | `sellable_on_hand_units` | integer |
| 20 | `unsellable_on_hand_inventory` | numeric |
| 21 | `unsellable_on_hand_inventory_30_day` | numeric |
| 22 | `unsellable_on_hand_units` | integer |
| 23 | `aged_90_day_sellable_inventory` | numeric |
| 24 | `aged_90_day_sellable_inventory_30_day` | numeric |
| 25 | `aged_90_day_sellable_units` | integer |
| 26 | `list_price` | numeric |
| 27 | `author` | character varying |
| 28 | `artist` | character varying |
| 29 | `product_group` | character varying |
| 30 | `replenishment_category` | character varying |
| 31 | `model_number` | character varying |
| 32 | `brand` | character varying |
| 33 | `category` | character varying |
| 34 | `subcategory` | character varying |
| 35 | `apparel_size` | character varying |
| 36 | `apparel_width` | character varying |
| 37 | `binding` | character varying |
| 38 | `brand_code` | character varying |
| 39 | `net_received` | numeric |

### `amazon_source_data.vendorcentral_purchaseorder_address` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `party_id` | character varying |
| 4 | `address_type` | character varying |
| 5 | `address_name` | character varying |
| 6 | `address_line_1` | character varying |
| 7 | `address_line_2` | character varying |
| 8 | `address_line_3` | character varying |
| 9 | `city` | character varying |
| 10 | `county` | character varying |
| 11 | `district` | character varying |
| 12 | `state_or_region` | character varying |
| 13 | `postal_code` | character varying |
| 14 | `country_code` | character varying |
| 15 | `phone` | character varying |
| 16 | `id` | bigint |
| 17 | `download_date` | date |

### `amazon_source_data.vendorcentral_purchaseorder_itemquantity` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `updated_date` | timestamp without time zone |
| 4 | `amount` | integer |
| 5 | `unit_of_measure` | character varying |
| 6 | `unit_size` | integer |
| 7 | `quantity_type` | character varying |
| 8 | `id` | integer |
| 9 | `download_date` | date |

### `amazon_source_data.vendorcentral_purchaseorder_report` (56 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `id` | bigint |
| 5 | `purchase_order_state` | character varying |
| 6 | `purchase_order_date` | timestamp without time zone |
| 7 | `purchase_order_changed_date` | timestamp without time zone |
| 8 | `purchase_order_state_changed_date` | timestamp without time zone |
| 9 | `purchase_order_type` | character varying |
| 10 | `import_details_method_of_payment` | character varying |
| 11 | `import_details_international_commercial_terms` | character varying |
| 12 | `import_details_port_of_delivery` | character varying |
| 13 | `import_details_import_containers` | character varying |
| 14 | `import_details_shipping_instructions` | character varying |
| 15 | `deal_code` | character varying |
| 16 | `payment_method` | character varying |
| 17 | `buying_party_id` | character varying |
| 18 | `buying_party_tax_registration_type` | character varying |
| 19 | `buying_party_tax_registration_number` | character varying |
| 20 | `selling_party_id` | character varying |
| 21 | `selling_party_tax_registration_type` | character varying |
| 22 | `selling_party_tax_registration_number` | character varying |
| 23 | `ship_to_party_id` | character varying |
| 24 | `ship_to_party_tax_registration_type` | character varying |
| 25 | `ship_to_party_tax_registration_number` | character varying |
| 26 | `bill_to_party_id` | character varying |
| 27 | `bill_to_party_tax_registration_type` | character varying |
| 28 | `bill_to_party_tax_registration_number` | character varying |
| 29 | `ship_window` | character varying |
| 30 | `delivery_window` | character varying |
| 31 | `item_sequence_number` | integer |
| 32 | `amazon_product_identifier` | character varying |
| 33 | `vendor_product_identifier` | character varying |
| 34 | `ordered_quantity_amount` | integer |
| 35 | `ordered_quantity_unit_of_measure` | character varying |
| 36 | `ordered_quantity_unit_size` | integer |
| 37 | `is_back_order_allowed` | boolean |
| 38 | `net_cost_currency_code` | character varying |
| 39 | `net_cost_amount` | numeric |
| 40 | `list_price_currency_code` | character varying |
| 41 | `list_price_amount` | numeric |
| 42 | `download_date` | date |
| 43 | `last_updated_date` | timestamp without time zone |
| 44 | `acknowledgement_confirmation_status` | character varying |
| 45 | `accepted_quantity_amount` | integer |
| 46 | `accepted_quantity_unit_of_measure` | character varying |
| 47 | `accepted_quantity_unit_size` | integer |
| 48 | `rejected_quantity_amount` | integer |
| 49 | `rejected_quantity_unit_of_measure` | character varying |
| 50 | `rejected_quantity_unit_size` | integer |
| 51 | `receive_status` | character varying |
| 52 | `last_receive_date` | timestamp without time zone |
| 53 | `received_quantity_amount` | integer |
| 54 | `received_quantity_unit_of_measure` | character varying |
| 55 | `received_quantity_unit_size` | integer |
| 56 | `purchase_order_number` | character varying |

### `amazon_source_data.vendorcentral_rapidretailinventory_report` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_start_time` | timestamp without time zone |
| 5 | `report_end_time` | timestamp without time zone |
| 6 | `asin` | character varying |
| 7 | `highly_available_inventory` | bigint |
| 8 | `download_date` | date |
| 9 | `account_timezone` | character varying |
| 10 | `report_start_time_account_timezone` | timestamp without time zone |
| 11 | `report_end_time_account_timezone` | timestamp without time zone |

### `amazon_source_data.vendorcentral_rapidretailsales_report` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_start_time` | timestamp without time zone |
| 5 | `report_end_time` | timestamp without time zone |
| 6 | `asin` | character varying |
| 7 | `ordered_units` | integer |
| 8 | `ordered_revenue_amount` | numeric |
| 9 | `download_date` | date |
| 10 | `account_timezone` | character varying |
| 11 | `report_start_time_account_timezone` | timestamp without time zone |
| 12 | `report_end_time_account_timezone` | timestamp without time zone |

### `amazon_source_data.vendorcentral_rapidretailtraffic_report` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_start_time` | timestamp without time zone |
| 5 | `report_end_time` | timestamp without time zone |
| 6 | `asin` | character varying |
| 7 | `glance_views` | integer |
| 8 | `download_date` | date |
| 9 | `account_timezone` | character varying |
| 10 | `report_start_time_account_timezone` | timestamp without time zone |
| 11 | `report_end_time_account_timezone` | timestamp without time zone |

### `amazon_source_data.vendorcentral_retailanalytics_amazonfresh_sales_report` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_date` | date |
| 5 | `asin` | character varying |
| 6 | `shipped_cogs_amount` | numeric |
| 7 | `shipped_cogs_currency_code` | character varying |
| 8 | `shipped_revenue_amount` | numeric |
| 9 | `shipped_revenue_currency_code` | character varying |
| 10 | `shipped_units` | integer |
| 11 | `distributor_view` | character varying |
| 12 | `ordered_revenue_amount` | numeric |
| 13 | `ordered_revenue_currency_code` | character varying |
| 14 | `ordered_units` | integer |
| 15 | `download_date` | date |

### `amazon_source_data.vendorcentral_retailanalytics_netppm_report` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `asin` | character varying |
| 5 | `netpureproductmargin` | numeric |
| 6 | `download_date` | date |

### `amazon_source_data.vendorcentral_retailanalytics_sales_report` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `report_date` | date |
| 5 | `asin` | character varying |
| 6 | `customer_returns` | integer |
| 7 | `shipped_cogs_amount` | numeric |
| 8 | `shipped_cogs_currency_code` | character varying |
| 9 | `shipped_revenue_amount` | numeric |
| 10 | `shipped_revenue_currency_code` | character varying |
| 11 | `shipped_units` | integer |
| 12 | `distributor_view` | character varying |
| 13 | `ordered_revenue_amount` | numeric |
| 14 | `ordered_revenue_currency_code` | character varying |
| 15 | `ordered_units` | integer |
| 16 | `download_date` | date |

### `amazon_source_data.vendorcentral_retailanalytics_traffic_report` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_period` | character varying |
| 4 | `report_date` | date |
| 5 | `traffic_aggregate_glanceview` | integer |
| 6 | `asin` | character varying |
| 7 | `glance_view_byasin` | integer |
| 8 | `download_date` | date |

### `amazon_source_data.vendorcentral_salesdiagnostic_orderedrevenue` (45 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `vendor_account` | character varying |
| 4 | `vendor_id` | integer |
| 5 | `report_date` | date |
| 6 | `asin` | character varying |
| 7 | `currency` | character varying |
| 8 | `asin_name` | character varying |
| 9 | `parent_asin` | character varying |
| 10 | `ean` | character varying |
| 11 | `upc` | character varying |
| 12 | `brand` | character varying |
| 13 | `category` | character varying |
| 14 | `subcategory` | character varying |
| 15 | `apparel_size` | character varying |
| 16 | `apparel_width` | character varying |
| 17 | `binding` | character varying |
| 18 | `color` | character varying |
| 19 | `model` | character varying |
| 20 | `release_date` | date |
| 21 | `ordered_revenue` | numeric |
| 22 | `ordered_revenue_percentage` | numeric |
| 23 | `ordered_revenue_prior_period` | numeric |
| 24 | `ordered_revenue_last_year` | numeric |
| 25 | `ordered_units` | integer |
| 26 | `ordered_units_percentage` | numeric |
| 27 | `ordered_units_prior_period` | numeric |
| 28 | `ordered_units_last_year` | numeric |
| 29 | `customer_returns` | integer |
| 30 | `free_replacements` | integer |
| 31 | `subcategory_sales_rank` | integer |
| 32 | `subcategory_better_worse` | numeric |
| 33 | `average_sales_price` | numeric |
| 34 | `average_sales_price_prior_period` | numeric |
| 35 | `change_in_gv_prior_period` | numeric |
| 36 | `change_in_gv_last_year` | numeric |
| 37 | `rep_oos` | numeric |
| 38 | `rep_oos_percentage` | numeric |
| 39 | `rep_oos_prior_period` | numeric |
| 40 | `lbb` | numeric |
| 41 | `author` | character varying |
| 42 | `glance_view` | integer |
| 43 | `change_glance_view_prior_period` | numeric |
| 44 | `change_glance_view_last_year` | numeric |
| 45 | `conversion_rate` | numeric |

### `amazon_source_data.vendorcentral_salesdiagnostic_report` (26 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `distributor_view` | character varying |
| 4 | `currency_code` | character varying |
| 5 | `selling_program_name` | character varying |
| 6 | `asin` | character varying |
| 7 | `reporting_date` | date |
| 8 | `shipped_revenue_amount` | numeric |
| 9 | `shipped_revenue_currency_code` | character varying |
| 10 | `shipped_cogs_amount` | numeric |
| 11 | `shipped_cogs_currency_code` | character varying |
| 12 | `shipped_units` | integer |
| 13 | `customer_returns` | integer |
| 14 | `free_replacements` | numeric |
| 15 | `pre_ordered_revenue_amount` | numeric |
| 16 | `pre_ordered_revenue_currency_code` | character varying |
| 17 | `ordered_revenue_amount` | numeric |
| 18 | `ordered_revenue_currency_code` | character varying |
| 19 | `ordered_units` | integer |
| 20 | `pre_ordered_units` | integer |
| 21 | `shipped_subcategory_sales_rank` | integer |
| 22 | `ordered_subcategory_sales_rank` | integer |
| 23 | `replenishable_out_of_stock` | numeric |
| 24 | `lost_buy_box` | numeric |
| 25 | `glance_views` | integer |
| 26 | `conversion_rate` | numeric |

### `amazon_source_data.vendorcentral_salesdiagnostic_shippedcogs` (37 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `vendor_account` | character varying |
| 4 | `vendor_id` | integer |
| 5 | `report_date` | date |
| 6 | `asin` | character varying |
| 7 | `currency` | character varying |
| 8 | `asin_name` | character varying |
| 9 | `parent_asin` | character varying |
| 10 | `ean` | character varying |
| 11 | `upc` | character varying |
| 12 | `brand` | character varying |
| 13 | `category` | character varying |
| 14 | `subcategory` | character varying |
| 15 | `apparel_size` | character varying |
| 16 | `apparel_width` | character varying |
| 17 | `binding` | character varying |
| 18 | `shipped_cogs` | numeric |
| 19 | `shipped_cogs_percentage` | numeric |
| 20 | `shipped_cogs_prior_period` | numeric |
| 21 | `shipped_cogs_last_year` | numeric |
| 22 | `shipped_units` | integer |
| 23 | `shipped_units_percentage` | numeric |
| 24 | `shipped_units_prior_period` | numeric |
| 25 | `shipped_units_last_year` | numeric |
| 26 | `customer_returns` | integer |
| 27 | `free_replacements` | integer |
| 28 | `brand_code` | character varying |
| 29 | `range` | character varying |
| 30 | `glance_view` | integer |
| 31 | `change_glance_view_prior_period` | numeric |
| 32 | `change_glance_view_last_year` | numeric |
| 33 | `conversion_rate` | numeric |
| 34 | `distributor_view` | character varying |
| 35 | `rep_oos` | numeric |
| 36 | `rep_oos_percentage` | numeric |
| 37 | `rep_oos_prior_period` | numeric |

### `amazon_source_data.vendorcentral_salesdiagnostic_shippedrevenue` (49 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `vendor_account` | character varying |
| 4 | `vendor_id` | integer |
| 5 | `report_date` | date |
| 6 | `asin` | character varying |
| 7 | `currency` | character varying |
| 8 | `asin_name` | character varying |
| 9 | `parent_asin` | character varying |
| 10 | `ean` | character varying |
| 11 | `upc` | character varying |
| 12 | `brand` | character varying |
| 13 | `category` | character varying |
| 14 | `subcategory` | character varying |
| 15 | `apparel_size` | character varying |
| 16 | `apparel_width` | character varying |
| 17 | `binding` | character varying |
| 18 | `color` | character varying |
| 19 | `model` | character varying |
| 20 | `release_date` | date |
| 21 | `shipped_revenue` | numeric |
| 22 | `shipped_revenue_percentage` | numeric |
| 23 | `shipped_revenue_prior_period` | numeric |
| 24 | `shipped_revenue_last_year` | numeric |
| 25 | `shipped_units` | integer |
| 26 | `shipped_units_percentage` | numeric |
| 27 | `shipped_units_prior_period` | numeric |
| 28 | `shipped_units_last_year` | numeric |
| 29 | `ordered_units` | integer |
| 30 | `ordered_units_percentage` | numeric |
| 31 | `ordered_units_prior_period` | numeric |
| 32 | `ordered_units_last_year` | numeric |
| 33 | `customer_returns` | integer |
| 34 | `free_replacements` | integer |
| 35 | `subcategory_sales_rank` | integer |
| 36 | `subcategory_better_worse` | numeric |
| 37 | `average_sales_price` | numeric |
| 38 | `average_sales_price_prior_period` | numeric |
| 39 | `change_in_gv_prior_period` | numeric |
| 40 | `change_in_gv_last_year` | numeric |
| 41 | `rep_oos` | numeric |
| 42 | `rep_oos_percentage` | numeric |
| 43 | `rep_oos_prior_period` | numeric |
| 44 | `lbb` | numeric |
| 45 | `author` | character varying |
| 46 | `glance_view` | integer |
| 47 | `change_glance_view_prior_period` | numeric |
| 48 | `change_glance_view_last_year` | numeric |
| 49 | `conversion_rate` | numeric |

---

## Schema: `criteo_source_data` (17 tables)

### `criteo_source_data.ad_balance` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `balance_id` | character varying |
| 6 | `created_at` | timestamp without time zone |
| 7 | `deposited` | numeric |
| 8 | `end_date` | date |
| 9 | `memo` | character varying |
| 10 | `balance_name` | character varying |
| 11 | `po_number` | character varying |
| 12 | `remaining` | numeric |
| 13 | `spent` | numeric |
| 14 | `start_date` | date |
| 15 | `status` | character varying |
| 16 | `updated_at` | timestamp without time zone |

### `criteo_source_data.ad_brand` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `brand_id` | character varying |
| 6 | `name` | character varying |

### `criteo_source_data.ad_campaign` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `campaign_id` | character varying |
| 6 | `budget` | numeric |
| 7 | `budget_remaining` | numeric |
| 8 | `budget_spent` | numeric |
| 9 | `click_attribution_window` | character varying |
| 10 | `click_attribution_scope` | character varying |
| 11 | `created_at` | timestamp without time zone |
| 12 | `drawable_balance_ids` | character varying |
| 13 | `name` | character varying |
| 14 | `promoted_brand_ids` | character varying |
| 15 | `status` | character varying |
| 16 | `type` | character varying |
| 17 | `updated_at` | timestamp without time zone |
| 18 | `view_attribution_window` | character varying |
| 19 | `view_attribution_scope` | character varying |
| 20 | `version` | bigint |

### `criteo_source_data.ad_campaign_keyword_report` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `campaign_id` | character varying |
| 6 | `report_date` | date |
| 7 | `keyword` | character varying |
| 8 | `attributed_orders` | integer |
| 9 | `attributed_sales` | numeric |
| 10 | `attributed_units` | integer |
| 11 | `clicks` | integer |
| 12 | `cpc` | numeric |
| 13 | `cpo` | numeric |
| 14 | `roas` | numeric |
| 15 | `spend` | numeric |
| 16 | `campaign_ctr` | numeric |
| 17 | `campaign_placement_impressions` | integer |
| 18 | `campaign_type_name` | character varying |

### `criteo_source_data.ad_campaign_pagetype_report` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `campaign_id` | character varying |
| 4 | `report_date` | date |
| 5 | `page_type_name` | character varying |
| 6 | `attributed_orders` | integer |
| 7 | `attributed_sales` | numeric |
| 8 | `attributed_units` | integer |
| 9 | `clicks` | integer |
| 10 | `cpc` | numeric |
| 11 | `cpo` | numeric |
| 12 | `roas` | numeric |
| 13 | `spend` | numeric |
| 14 | `campaign_ctr` | numeric |
| 15 | `campaign_placement_impressions` | integer |
| 16 | `campaign_type_name` | character varying |

### `criteo_source_data.ad_campaign_product_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `adv_product_id` | character varying |
| 4 | `campaign_id` | character varying |
| 5 | `report_date` | date |
| 6 | `adv_product_category` | character varying |
| 7 | `attributed_orders` | integer |
| 8 | `attributed_sales` | numeric |
| 9 | `attributed_units` | integer |
| 10 | `click_spend` | numeric |
| 11 | `product_clicks` | integer |
| 12 | `product_cpc` | numeric |
| 13 | `product_cpo` | numeric |
| 14 | `product_ctr` | numeric |
| 15 | `product_impressions` | integer |
| 16 | `product_roas` | numeric |
| 17 | `adv_product_name` | character varying |
| 18 | `brand_id` | character varying |
| 19 | `brand_name` | character varying |
| 20 | `campaign_type_name` | character varying |

### `criteo_source_data.ad_campaign_productcategory_report` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `campaign_id` | character varying |
| 4 | `report_date` | date |
| 5 | `adv_product_category` | character varying |
| 6 | `attributed_orders` | integer |
| 7 | `attributed_sales` | numeric |
| 8 | `attributed_units` | integer |
| 9 | `click_spend` | numeric |
| 10 | `product_clicks` | integer |
| 11 | `product_cpc` | numeric |
| 12 | `product_cpo` | numeric |
| 13 | `product_ctr` | numeric |
| 14 | `product_impressions` | integer |
| 15 | `product_roas` | numeric |
| 16 | `campaign_type_name` | character varying |

### `criteo_source_data.ad_campaign_summary_report` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `campaign_id` | character varying |
| 4 | `report_date` | date |
| 5 | `attributed_orders` | integer |
| 6 | `attributed_sales` | numeric |
| 7 | `attributed_units` | integer |
| 8 | `clicks` | integer |
| 9 | `cpc` | numeric |
| 10 | `cpo` | numeric |
| 11 | `roas` | numeric |
| 12 | `spend` | numeric |
| 13 | `campaign_ctr` | numeric |
| 14 | `campaign_placement_impressions` | integer |
| 15 | `campaign_type_name` | character varying |
| 16 | `frequency` | numeric |
| 17 | `unique_visitors` | integer |

### `criteo_source_data.ad_lineitem` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `line_item_id` | character varying |
| 6 | `budget` | numeric |
| 7 | `budget_remaining` | numeric |
| 8 | `budget_spent` | numeric |
| 9 | `campaign_id` | character varying |
| 10 | `created_at` | timestamp without time zone |
| 11 | `end_date` | date |
| 12 | `name` | character varying |
| 13 | `start_date` | date |
| 14 | `status` | character varying |
| 15 | `target_retailer_id` | character varying |
| 16 | `type` | character varying |
| 17 | `updated_at` | timestamp without time zone |
| 18 | `max_bid` | numeric |
| 19 | `monthly_pacing` | numeric |
| 20 | `daily_pacing` | numeric |
| 21 | `bid_strategy` | character varying |
| 22 | `target_bid` | numeric |
| 23 | `auto_daily_pacing` | boolean |
| 24 | `version` | bigint |

### `criteo_source_data.ad_lineitem_keyword_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `keyword` | character varying |
| 5 | `line_item_id` | character varying |
| 6 | `attributed_orders` | integer |
| 7 | `attributed_sales` | numeric |
| 8 | `attributed_units` | integer |
| 9 | `clicks` | integer |
| 10 | `cpc` | numeric |
| 11 | `cpo` | numeric |
| 12 | `roas` | numeric |
| 13 | `spend` | numeric |
| 14 | `assisted_sales` | numeric |
| 15 | `assisted_units` | integer |
| 16 | `campaign_id` | character varying |
| 17 | `line_item_ctr` | numeric |
| 18 | `line_item_placement_impressions` | integer |
| 19 | `retailer_id` | integer |
| 20 | `retailer_name` | character varying |

### `criteo_source_data.ad_lineitem_negativekeyword` (9 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `line_item_id` | character varying |
| 6 | `keyword` | character varying |
| 7 | `type` | character varying |
| 8 | `match_type` | character varying |
| 9 | `version` | bigint |

### `criteo_source_data.ad_lineitem_pagetype_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `line_item_id` | character varying |
| 5 | `page_type_name` | character varying |
| 6 | `attributed_orders` | integer |
| 7 | `attributed_sales` | numeric |
| 8 | `attributed_units` | integer |
| 9 | `clicks` | integer |
| 10 | `cpc` | numeric |
| 11 | `cpo` | numeric |
| 12 | `roas` | numeric |
| 13 | `spend` | numeric |
| 14 | `assisted_sales` | numeric |
| 15 | `assisted_units` | integer |
| 16 | `campaign_id` | character varying |
| 17 | `line_item_ctr` | numeric |
| 18 | `line_item_placement_impressions` | integer |
| 19 | `retailer_id` | integer |
| 20 | `retailer_name` | character varying |

### `criteo_source_data.ad_lineitem_product` (10 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `line_item_id` | character varying |
| 6 | `product_id` | character varying |
| 7 | `bid_override` | numeric |
| 8 | `type` | character varying |
| 9 | `version` | bigint |
| 10 | `updated_at` | timestamp with time zone |

### `criteo_source_data.ad_lineitem_product_report` (25 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `adv_product_id` | character varying |
| 4 | `report_date` | date |
| 5 | `line_item_id` | character varying |
| 6 | `adv_product_category` | character varying |
| 7 | `attributed_orders` | integer |
| 8 | `attributed_sales` | numeric |
| 9 | `attributed_units` | integer |
| 10 | `click_spend` | numeric |
| 11 | `product_clicks` | integer |
| 12 | `product_cpc` | numeric |
| 13 | `product_cpo` | numeric |
| 14 | `product_ctr` | numeric |
| 15 | `product_impressions` | integer |
| 16 | `product_roas` | numeric |
| 17 | `adv_product_name` | character varying |
| 18 | `assisted_sales` | numeric |
| 19 | `assisted_units` | integer |
| 20 | `brand_id` | character varying |
| 21 | `brand_name` | character varying |
| 22 | `campaign_id` | character varying |
| 23 | `retailer_id` | integer |
| 24 | `retailer_name` | character varying |
| 25 | `download_date` | date |

### `criteo_source_data.ad_lineitem_productcategory_report` (20 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `line_item_id` | character varying |
| 5 | `adv_product_category` | character varying |
| 6 | `attributed_orders` | integer |
| 7 | `attributed_sales` | numeric |
| 8 | `attributed_units` | integer |
| 9 | `click_spend` | numeric |
| 10 | `product_clicks` | integer |
| 11 | `product_cpc` | numeric |
| 12 | `product_cpo` | numeric |
| 13 | `product_ctr` | numeric |
| 14 | `product_impressions` | integer |
| 15 | `product_roas` | numeric |
| 16 | `assisted_sales` | numeric |
| 17 | `assisted_units` | integer |
| 18 | `campaign_id` | character varying |
| 19 | `retailer_id` | integer |
| 20 | `retailer_name` | character varying |

### `criteo_source_data.ad_lineitem_summary_report` (21 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `report_date` | date |
| 4 | `line_item_id` | character varying |
| 5 | `attributed_orders` | integer |
| 6 | `attributed_sales` | numeric |
| 7 | `attributed_units` | integer |
| 8 | `clicks` | integer |
| 9 | `cpc` | numeric |
| 10 | `cpo` | numeric |
| 11 | `roas` | numeric |
| 12 | `spend` | numeric |
| 13 | `assisted_sales` | numeric |
| 14 | `assisted_units` | integer |
| 15 | `campaign_id` | character varying |
| 16 | `frequency` | numeric |
| 17 | `line_item_ctr` | numeric |
| 18 | `line_item_placement_impressions` | integer |
| 19 | `retailer_id` | integer |
| 20 | `retailer_name` | character varying |
| 21 | `unique_visitors` | integer |

### `criteo_source_data.ad_retailer` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `retailer_id` | character varying |
| 6 | `name` | character varying |

---

## Schema: `instacart_source_data` (11 tables)

### `instacart_source_data.ad_account_report` (14 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `date` | date |
| 6 | `impressions` | integer |
| 7 | `clicks` | integer |
| 8 | `spend` | numeric |
| 9 | `ctr` | double precision |
| 10 | `cpc` | double precision |
| 11 | `attributed_quantities` | integer |
| 12 | `attributed_sales` | numeric |
| 13 | `roas` | double precision |
| 14 | `analytics_type` | character varying |

### `instacart_source_data.ad_adgroup_attributes` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_id` | character varying |
| 6 | `ad_group_name` | character varying |
| 7 | `enabled` | boolean |
| 8 | `ad_group_status` | character varying |
| 9 | `default_bid` | numeric |
| 10 | `meta` | character varying |
| 11 | `suggested_bid` | numeric |
| 12 | `bid_strength` | character varying |
| 13 | `min_bid` | numeric |
| 14 | `product_count` | integer |
| 15 | `campaign_id` | character varying |
| 16 | `uncompetitive_bid` | numeric |
| 17 | `is_confident_bid` | boolean |
| 18 | `bid_rec_type` | character varying |

### `instacart_source_data.ad_adgroup_keyword_attributes` (14 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_keyword_id` | character varying |
| 6 | `keyword` | character varying |
| 7 | `cpc_bid` | numeric |
| 8 | `matching_type` | character varying |
| 9 | `ad_group_keyword_status` | character varying |
| 10 | `ad_group_id` | character varying |
| 11 | `suggested_bid` | numeric |
| 12 | `bid_strength` | character varying |
| 13 | `min_bid` | double precision |
| 14 | `keyword_type` | character varying |

### `instacart_source_data.ad_adgroup_keyword_report` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_keyword_id` | character varying |
| 6 | `date` | date |
| 7 | `impressions` | integer |
| 8 | `clicks` | integer |
| 9 | `spend` | numeric |
| 10 | `ctr` | double precision |
| 11 | `cpc` | double precision |
| 12 | `attributed_sales` | numeric |
| 13 | `roas` | double precision |
| 14 | `analytics_type` | character varying |
| 15 | `ad_group_id` | character varying |
| 16 | `attributed_quantities` | numeric |

### `instacart_source_data.ad_adgroup_product_attributes` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_product_id` | character varying |
| 6 | `enabled` | boolean |
| 7 | `product_name` | character varying |
| 8 | `product_size` | character varying |
| 9 | `product_image_url` | character varying |
| 10 | `upc` | character varying |
| 11 | `ad_group_product_status` | character varying |
| 12 | `ad_group_id` | character varying |

### `instacart_source_data.ad_adgroup_product_report` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_product_id` | character varying |
| 6 | `date` | date |
| 7 | `impressions` | integer |
| 8 | `clicks` | integer |
| 9 | `spend` | numeric |
| 10 | `ctr` | double precision |
| 11 | `cpc` | double precision |
| 12 | `attributed_quantities` | numeric |
| 13 | `attributed_sales` | numeric |
| 14 | `roas` | double precision |
| 15 | `analytics_type` | character varying |
| 16 | `ad_group_id` | character varying |
| 17 | `download_date` | date |

### `instacart_source_data.ad_adgroup_report` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `ad_group_id` | character varying |
| 6 | `date` | date |
| 7 | `impressions` | integer |
| 8 | `clicks` | integer |
| 9 | `spend` | numeric |
| 10 | `ctr` | double precision |
| 11 | `cpc` | double precision |
| 12 | `attributed_quantities` | numeric |
| 13 | `attributed_sales` | numeric |
| 14 | `roas` | double precision |
| 15 | `analytics_type` | character varying |

### `instacart_source_data.ad_campaign_adgroup_bids` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `campaign_id` | character varying |
| 6 | `ad_group_bid_id` | integer |

### `instacart_source_data.ad_campaign_attributes` (26 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `campaign_id` | character varying |
| 6 | `campaign_name` | character varying |
| 7 | `enabled` | boolean |
| 8 | `scheduled_start_at` | timestamp without time zone |
| 9 | `scheduled_end_at` | timestamp without time zone |
| 10 | `scheduled_start_at_date` | date |
| 11 | `scheduled_end_at_date` | date |
| 12 | `campaign_type` | character varying |
| 13 | `purchase_order` | character varying |
| 14 | `campaign_status` | character varying |
| 15 | `budget` | numeric |
| 16 | `spend` | numeric |
| 17 | `daily_cap_enabled` | boolean |
| 18 | `daily_budget` | numeric |
| 19 | `memo` | character varying |
| 20 | `objective` | character varying |
| 21 | `objective_custom` | character varying |
| 22 | `at_risk_meta` | character varying |
| 23 | `is_deleted` | boolean |
| 24 | `pacing_method` | character varying |
| 25 | `target_daily_budget` | numeric |
| 26 | `budget_type` | character varying |

### `instacart_source_data.ad_campaign_report` (15 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `campaign_id` | character varying |
| 6 | `date` | date |
| 7 | `impressions` | integer |
| 8 | `clicks` | integer |
| 9 | `spend` | numeric |
| 10 | `ctr` | double precision |
| 11 | `cpc` | double precision |
| 12 | `attributed_quantities` | numeric |
| 13 | `attributed_sales` | numeric |
| 14 | `roas` | double precision |
| 15 | `analytics_type` | character varying |

### `instacart_source_data.ad_product` (13 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `upc` | character varying |
| 6 | `product_name` | character varying |
| 7 | `product_url` | character varying |
| 8 | `catalog_product_id` | character varying |
| 9 | `product_image_url` | character varying |
| 10 | `product_size` | character varying |
| 11 | `product_unit_count` | character varying |
| 12 | `brand_name` | character varying |
| 13 | `product_id` | integer |

---

## Schema: `intentwise_ecommerce_graph` (14 tables)

### `intentwise_ecommerce_graph.account_summary` (30 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `report_date` | date |
| 8 | `ad_impressions` | bigint |
| 9 | `ad_clicks` | bigint |
| 10 | `ad_spend` | numeric |
| 11 | `ad_revenue` | numeric |
| 12 | `ad_orders` | bigint |
| 13 | `ad_conversions` | bigint |
| 14 | `product_sales` | numeric |
| 15 | `product_quantity` | bigint |
| 16 | `shipped_cogs` | numeric |
| 17 | `shipped_units` | bigint |
| 18 | `shipped_revenue` | numeric |
| 19 | `ordered_units` | bigint |
| 20 | `ordered_revenue` | numeric |
| 21 | `current_month_budget` | bigint |
| 22 | `sourcing_shipped_cogs` | numeric |
| 23 | `sourcing_shipped_units` | bigint |
| 24 | `sourcing_shipped_revenue` | numeric |
| 25 | `total_order_items` | bigint |
| 26 | `organization_id` | bigint |
| 27 | `organization_name` | character varying |
| 28 | `browser_session` | bigint |
| 29 | `mobile_app_sessions` | bigint |
| 30 | `glance_view_byasin` | integer |

### `intentwise_ecommerce_graph.advertised_product_summary` (35 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `product_ad_id` | bigint |
| 8 | `product` | character varying |
| 9 | `sku` | character varying |
| 10 | `product_title` | character varying |
| 11 | `ad_product_status` | character varying |
| 12 | `adgroup_id` | bigint |
| 13 | `adgroup_name` | character varying |
| 14 | `adgroup_status` | character varying |
| 15 | `campaign_id` | bigint |
| 16 | `target_acos` | numeric |
| 17 | `campaign_name` | character varying |
| 18 | `campaign_status` | character varying |
| 19 | `portfolio_id` | bigint |
| 20 | `portfolio_name` | character varying |
| 21 | `campaign_type` | character varying |
| 22 | `report_date` | date |
| 23 | `ad_impressions` | bigint |
| 24 | `ad_clicks` | integer |
| 25 | `ad_spend` | numeric |
| 26 | `ad_revenue` | numeric |
| 27 | `ad_orders` | bigint |
| 28 | `ad_conversions` | bigint |
| 29 | `organization_id` | bigint |
| 30 | `organization_name` | character varying |
| 31 | `ad_ntb_revenue` | numeric |
| 32 | `ad_ntb_orders` | integer |
| 33 | `ad_ntb_ordered_units` | integer |
| 34 | `last_updated_date` | timestamp with time zone |
| 35 | `metadata_updated_date` | date |

### `intentwise_ecommerce_graph.campaign_summary` (37 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `campaign_id` | bigint |
| 8 | `campaign_name` | character varying |
| 9 | `portfolio_id` | bigint |
| 10 | `portfolio_name` | character varying |
| 11 | `campaign_type` | character varying |
| 12 | `status` | character varying |
| 13 | `target_acos` | numeric |
| 14 | `daily_budget` | numeric |
| 15 | `start_date` | date |
| 16 | `end_date` | date |
| 17 | `premium_bid_adjustment` | boolean |
| 18 | `bidding_strategy` | character varying |
| 19 | `placement_top_of_search` | numeric |
| 20 | `placement_product_details_page` | numeric |
| 21 | `report_date` | date |
| 22 | `ad_impressions` | bigint |
| 23 | `ad_clicks` | integer |
| 24 | `ad_spend` | numeric |
| 25 | `ad_revenue` | numeric |
| 26 | `ad_conversions` | integer |
| 27 | `ad_orders` | integer |
| 28 | `ntb_revenue` | numeric |
| 29 | `ntb_orders` | numeric |
| 30 | `ntb_ordered_units` | numeric |
| 31 | `sub_brand` | character varying |
| 32 | `organization_id` | bigint |
| 33 | `organization_name` | character varying |
| 34 | `hours_in_budget` | integer |
| 35 | `hours_not_in_budget` | integer |
| 36 | `percent_time_in_budget` | numeric |
| 37 | `last_updated_date` | timestamp with time zone |

### `intentwise_ecommerce_graph.keyword_summary` (37 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | bigint |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `keyword_id` | bigint |
| 8 | `keyword_text` | character varying |
| 9 | `match_type` | character varying |
| 10 | `keyword_status` | character varying |
| 11 | `current_bid` | numeric |
| 12 | `is_brand_keyword` | boolean |
| 13 | `adgroup_id` | bigint |
| 14 | `adgroup_name` | character varying |
| 15 | `adgroup_status` | character varying |
| 16 | `campaign_id` | bigint |
| 17 | `campaign_name` | character varying |
| 18 | `campaign_status` | character varying |
| 19 | `target_acos` | numeric |
| 20 | `portfolio_id` | bigint |
| 21 | `portfolio_name` | character varying |
| 22 | `campaign_type` | character varying |
| 23 | `report_date` | date |
| 24 | `ad_impressions` | bigint |
| 25 | `ad_clicks` | integer |
| 26 | `ad_spend` | numeric |
| 27 | `ad_revenue` | numeric |
| 28 | `ad_conversions` | integer |
| 29 | `ad_orders` | integer |
| 30 | `last_updated_date` | timestamp with time zone |
| 31 | `organization_id` | bigint |
| 32 | `organization_name` | character varying |
| 33 | `ad_ntb_revenue` | numeric |
| 34 | `ad_ntb_orders` | integer |
| 35 | `ad_ntb_ordered_units` | integer |
| 36 | `ad_top_of_search_impression_share` | numeric |
| 37 | `metadata_updated_date` | timestamp with time zone |

### `intentwise_ecommerce_graph.label_summary` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `label_name` | character varying |
| 8 | `type` | character varying |
| 9 | `campaign_type` | character varying |
| 10 | `report_date` | date |
| 11 | `ad_impressions` | bigint |
| 12 | `ad_clicks` | bigint |
| 13 | `ad_spend` | numeric |
| 14 | `ad_revenue` | numeric |
| 15 | `ad_orders` | bigint |
| 16 | `ad_conversions` | bigint |
| 17 | `organization_id` | bigint |
| 18 | `organization_name` | character varying |

### `intentwise_ecommerce_graph.product_summary` (54 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `product` | character varying |
| 8 | `sku` | character varying |
| 9 | `report_date` | date |
| 10 | `product_title` | character varying |
| 11 | `ad_impressions` | bigint |
| 12 | `ad_clicks` | bigint |
| 13 | `ad_spend` | numeric |
| 14 | `ad_revenue` | numeric |
| 15 | `ad_orders` | bigint |
| 16 | `ad_conversions` | bigint |
| 17 | `product_sales` | numeric |
| 18 | `product_quantity` | bigint |
| 19 | `shipped_cogs` | numeric |
| 20 | `shipped_units` | bigint |
| 21 | `shipped_revenue` | numeric |
| 22 | `ordered_units` | bigint |
| 23 | `ordered_revenue` | numeric |
| 24 | `best_seller_rank` | integer |
| 25 | `best_seller_category` | character varying |
| 26 | `title_length` | integer |
| 27 | `description_length` | integer |
| 28 | `feature_bullet_count` | integer |
| 29 | `aplus_page` | character varying |
| 30 | `image_count` | integer |
| 31 | `average_rating` | numeric |
| 32 | `seller_company` | character varying |
| 33 | `review_count` | integer |
| 34 | `description` | character varying |
| 35 | `rating_count` | integer |
| 36 | `sourcing_shipped_cogs` | numeric |
| 37 | `sourcing_shipped_units` | bigint |
| 38 | `sourcing_shipped_revenue` | numeric |
| 39 | `browser_session` | bigint |
| 40 | `mobile_app_session` | bigint |
| 41 | `buy_box_prcntg` | numeric |
| 42 | `browser_sessions_prcntg` | numeric |
| 43 | `mobile_app_sessions_prcntg` | numeric |
| 44 | `ad_revenue_same_sku` | numeric |
| 45 | `ad_conversions_same_sku` | numeric |
| 46 | `total_order_items` | bigint |
| 47 | `sub_brand` | character varying |
| 48 | `organization_id` | bigint |
| 49 | `organization_name` | character varying |
| 50 | `updated_date` | date |
| 51 | `browser_page_views` | integer |
| 52 | `mobile_app_page_views` | integer |
| 53 | `browser_page_views_prcntg` | numeric |
| 54 | `mobile_app_page_views_prcntg` | numeric |

### `intentwise_ecommerce_graph.producttarget_summary` (33 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `target_id` | bigint |
| 8 | `target` | character varying |
| 9 | `asin_price_less_than` | numeric |
| 10 | `asin_price_between` | character varying |
| 11 | `asin_price_greater_than` | numeric |
| 12 | `current_bid` | numeric |
| 13 | `target_status` | character varying |
| 14 | `is_brand_target` | boolean |
| 15 | `adgroup_id` | bigint |
| 16 | `adgroup_name` | character varying |
| 17 | `adgroup_status` | character varying |
| 18 | `campaign_id` | bigint |
| 19 | `target_acos` | numeric |
| 20 | `campaign_name` | character varying |
| 21 | `campaign_status` | character varying |
| 22 | `portfolio_id` | bigint |
| 23 | `portfolio_name` | character varying |
| 24 | `campaign_type` | character varying |
| 25 | `report_date` | date |
| 26 | `ad_impressions` | bigint |
| 27 | `ad_clicks` | integer |
| 28 | `ad_spend` | numeric |
| 29 | `ad_revenue` | numeric |
| 30 | `ad_orders` | bigint |
| 31 | `ad_conversions` | bigint |
| 32 | `organization_id` | bigint |
| 33 | `organization_name` | character varying |

### `intentwise_ecommerce_graph.refdata_currency_exchange_rate` (3 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `exchange_date` | date |
| 2 | `currency_code` | character varying |
| 3 | `exchange_rate` | numeric |

### `intentwise_ecommerce_graph.refdata_date_dimension` (39 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `actual_date` | date |
| 2 | `day_of_week` | integer |
| 3 | `day_of_week_name` | character varying |
| 4 | `day_of_month` | integer |
| 5 | `day_of_year` | integer |
| 6 | `week_of_year` | integer |
| 7 | `week_start_date` | date |
| 8 | `week_end_date` | date |
| 9 | `month_actual` | date |
| 10 | `month_of_year` | integer |
| 11 | `month_name` | character varying |
| 12 | `quarter_actual` | date |
| 13 | `quarter_of_year` | integer |
| 14 | `year_actual` | integer |
| 15 | `is_weekend` | boolean |
| 16 | `is_leap_year` | boolean |
| 17 | `fiscal_year` | integer |
| 18 | `fiscal_month` | integer |
| 19 | `fiscal_week` | integer |
| 20 | `day_of_fiscal_month` | integer |
| 21 | `day_of_fiscal_year` | integer |
| 22 | `month_end_date` | date |
| 23 | `is_last_day_of_month` | boolean |
| 24 | `is_last_day_of_quarter` | boolean |
| 25 | `iso_week_start_date` | date |
| 26 | `iso_week_end_date` | date |
| 27 | `iso_week_of_year` | integer |
| 28 | `last_7_day` | date |
| 29 | `next_7_day` | date |
| 30 | `last_14_day` | date |
| 31 | `next_14_day` | date |
| 32 | `last_30_day` | date |
| 33 | `next_30_day` | date |
| 34 | `same_day_previous_week` | date |
| 35 | `same_day_next_week` | date |
| 36 | `same_day_previous_month` | date |
| 37 | `same_day_next_month` | date |
| 38 | `same_day_previous_year` | date |
| 39 | `same_day_next_year` | date |

### `intentwise_ecommerce_graph.refdata_label` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `organization_id` | bigint |
| 4 | `organization_name` | character varying |
| 5 | `label_id` | bigint |
| 6 | `label_name` | character varying |
| 7 | `created_date` | timestamp without time zone |
| 8 | `last_updated_date` | timestamp without time zone |

### `intentwise_ecommerce_graph.refdata_label_mapping` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `organization_id` | bigint |
| 4 | `organization_name` | character varying |
| 5 | `label_id` | bigint |
| 6 | `type_id` | bigint |
| 7 | `type` | character varying |
| 8 | `last_updated_date` | timestamp without time zone |

### `intentwise_ecommerce_graph.refdata_product_cost` (10 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `asin` | character varying |
| 4 | `unit_cost` | numeric |
| 5 | `effective_date` | date |
| 6 | `updated_date` | timestamp without time zone |
| 7 | `title` | character varying |
| 8 | `sku` | character varying |
| 9 | `organization_id` | bigint |
| 10 | `organization_name` | character varying |

### `intentwise_ecommerce_graph.refdata_product_sku_mapping` (7 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `asin` | character varying |
| 4 | `sku` | character varying |
| 5 | `title` | character varying |
| 6 | `organization_id` | bigint |
| 7 | `organization_name` | character varying |

### `intentwise_ecommerce_graph.searchterm_summary` (32 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_name` | character varying |
| 2 | `account_id` | bigint |
| 3 | `channel_id` | integer |
| 4 | `channel_name` | character varying |
| 5 | `country_code` | character varying |
| 6 | `currency_code` | character varying |
| 7 | `search_term` | character varying |
| 8 | `target_id` | bigint |
| 9 | `target` | character varying |
| 10 | `match_type` | character varying |
| 11 | `is_asin` | boolean |
| 12 | `is_brand_term` | boolean |
| 13 | `adgroup_id` | bigint |
| 14 | `adgroup_name` | character varying |
| 15 | `adgroup_status` | character varying |
| 16 | `campaign_id` | bigint |
| 17 | `target_acos` | numeric |
| 18 | `campaign_name` | character varying |
| 19 | `campaign_status` | character varying |
| 20 | `portfolio_id` | bigint |
| 21 | `portfolio_name` | character varying |
| 22 | `campaign_type` | character varying |
| 23 | `target_type` | character varying |
| 24 | `report_date` | date |
| 25 | `ad_impressions` | bigint |
| 26 | `ad_clicks` | bigint |
| 27 | `ad_spend` | numeric |
| 28 | `ad_revenue` | numeric |
| 29 | `ad_conversions` | bigint |
| 30 | `ad_orders` | bigint |
| 31 | `organization_id` | bigint |
| 32 | `organization_name` | character varying |

---

## Schema: `walmart_source_data` (16 tables)

### `walmart_source_data.ad_adgroup` (12 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `ad_group_id` | bigint |
| 7 | `campaign_id` | bigint |
| 8 | `name` | character varying |
| 9 | `status` | character varying |
| 10 | `created_on` | timestamp with time zone |
| 11 | `updated_on` | timestamp with time zone |
| 12 | `version` | bigint |

### `walmart_source_data.ad_campaign` (24 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `campaign_id` | bigint |
| 7 | `name` | character varying |
| 8 | `status` | character varying |
| 9 | `campaign_type` | character varying |
| 10 | `targeting_type` | character varying |
| 11 | `budget_type` | character varying |
| 12 | `start_date` | date |
| 13 | `end_date` | date |
| 14 | `total_budget` | numeric |
| 15 | `daily_budget` | numeric |
| 16 | `rollover` | boolean |
| 17 | `channel` | character varying |
| 18 | `created_on` | timestamp with time zone |
| 19 | `updated_on` | timestamp with time zone |
| 20 | `version` | bigint |
| 21 | `is_search_ingrid` | boolean |
| 22 | `is_search_carousel` | boolean |
| 23 | `is_item_buy_box` | boolean |
| 24 | `is_item_carousel` | boolean |

### `walmart_source_data.ad_campaign_placement_bid_multiplier` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `placement_multiplier_id` | bigint |
| 6 | `campaign_id` | bigint |
| 7 | `placement_type` | character varying |
| 8 | `multiplier` | numeric |

### `walmart_source_data.ad_campaign_platform_bid_multiplier` (8 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `platform_multiplier_id` | bigint |
| 6 | `campaign_id` | bigint |
| 7 | `platform_type` | character varying |
| 8 | `multiplier` | numeric |

### `walmart_source_data.ad_item` (18 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `ad_group_id` | bigint |
| 7 | `campaign_id` | bigint |
| 8 | `item_id` | character varying |
| 9 | `ad_item_id` | bigint |
| 10 | `bid` | numeric |
| 11 | `status` | character varying |
| 12 | `item_image_url` | character varying |
| 13 | `review_status` | character varying |
| 14 | `review_reason` | character varying |
| 15 | `item_page_url` | character varying |
| 16 | `created_on` | timestamp with time zone |
| 17 | `updated_on` | timestamp with time zone |
| 18 | `version` | bigint |

### `walmart_source_data.ad_item_master` (10 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `item_id` | character varying |
| 7 | `item_name` | character varying |
| 8 | `item_image_url` | character varying |
| 9 | `item_page_url` | character varying |
| 10 | `suggested_bid` | numeric |

### `walmart_source_data.ad_keyword` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `ad_group_id` | bigint |
| 7 | `campaign_id` | bigint |
| 8 | `keyword_id` | bigint |
| 9 | `state` | character varying |
| 10 | `keyword_text` | character varying |
| 11 | `keyword_category` | character varying |
| 12 | `status` | character varying |
| 13 | `match_type` | character varying |
| 14 | `bid` | numeric |
| 15 | `created_on` | timestamp with time zone |
| 16 | `updated_on` | timestamp with time zone |
| 17 | `version` | bigint |

### `walmart_source_data.ad_keyword_report` (68 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `date` | date |
| 6 | `advertiser_id` | bigint |
| 7 | `campaign_id` | bigint |
| 8 | `ad_group_id` | bigint |
| 9 | `keyword_id` | bigint |
| 10 | `bidded_keywords` | character varying |
| 11 | `match_type` | character varying |
| 12 | `searched_keyword` | character varying |
| 13 | `ad_spend` | numeric |
| 14 | `num_ads_shown` | bigint |
| 15 | `num_ads_clicks` | bigint |
| 16 | `click_revenue_3_days` | numeric |
| 17 | `click_revenue_14_days` | numeric |
| 18 | `click_revenue_30_days` | numeric |
| 19 | `units_sold_3_days` | numeric |
| 20 | `units_sold_14_days` | numeric |
| 21 | `units_sold_30_days` | numeric |
| 22 | `view_revenue_3_days` | numeric |
| 23 | `view_revenue_14_days` | numeric |
| 24 | `view_revenue_30_days` | numeric |
| 25 | `brand_click_revenue_3_days` | numeric |
| 26 | `brand_click_revenue_14_days` | numeric |
| 27 | `brand_click_revenue_30_days` | numeric |
| 28 | `brand_view_revenue_3_days` | numeric |
| 29 | `brand_view_revenue_14_days` | numeric |
| 30 | `brand_view_revenue_30_days` | numeric |
| 31 | `related_click_revenue_3_days` | numeric |
| 32 | `related_click_revenue_14_days` | numeric |
| 33 | `related_click_revenue_30_days` | numeric |
| 34 | `offline_click_revenue_3_days` | numeric |
| 35 | `offline_click_revenue_14_days` | numeric |
| 36 | `offline_click_revenue_30_days` | numeric |
| 37 | `offline_view_revenue_3_days` | numeric |
| 38 | `attributed_orders_3_days` | bigint |
| 39 | `attributed_orders_14_days` | bigint |
| 40 | `attributed_orders_30_days` | bigint |
| 41 | `ntb_orders_3_days` | bigint |
| 42 | `ntb_orders_14_days` | bigint |
| 43 | `ntb_orders_30_days` | bigint |
| 44 | `ntb_revenue_3_days` | numeric |
| 45 | `ntb_revenue_14_days` | numeric |
| 46 | `ntb_revenue_30_days` | numeric |
| 47 | `ntb_units_3_days` | bigint |
| 48 | `ntb_units_14_days` | bigint |
| 49 | `ntb_units_30_days` | bigint |
| 50 | `campaign_name` | character varying |
| 51 | `other_sku_sales_3_days` | numeric |
| 52 | `other_sku_sales_14_days` | numeric |
| 53 | `other_sku_sales_30_days` | numeric |
| 54 | `in_store_advertised_sales_3_days` | numeric |
| 55 | `in_store_advertised_sales_14_days` | numeric |
| 56 | `in_store_advertised_sales_30_days` | numeric |
| 57 | `in_store_attributed_sales_3_days` | numeric |
| 58 | `in_store_attributed_sales_14_days` | numeric |
| 59 | `in_store_attributed_sales_30_days` | numeric |
| 60 | `in_store_orders_3_days` | bigint |
| 61 | `in_store_orders_14_days` | bigint |
| 62 | `in_store_orders_30_days` | bigint |
| 63 | `in_store_other_sales_3_days` | numeric |
| 64 | `in_store_other_sales_14_days` | numeric |
| 65 | `in_store_other_sales_30_days` | numeric |
| 66 | `in_store_units_sold_3_days` | bigint |
| 67 | `in_store_units_sold_14_days` | bigint |
| 68 | `in_store_units_sold_30_days` | bigint |

### `walmart_source_data.ad_placement_report` (55 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `date` | date |
| 6 | `campaign_id` | bigint |
| 7 | `advertiser_id` | bigint |
| 8 | `ad_group_id` | bigint |
| 9 | `placement` | character varying |
| 10 | `ad_spend` | numeric |
| 11 | `num_ads_shown` | bigint |
| 12 | `num_ads_clicks` | bigint |
| 13 | `direct_attributed_sales_3_days` | numeric |
| 14 | `direct_attributed_sales_14_days` | numeric |
| 15 | `direct_attributed_sales_30_days` | numeric |
| 16 | `attributed_units_3_days` | numeric |
| 17 | `attributed_units_14_days` | numeric |
| 18 | `attributed_units_30_days` | numeric |
| 19 | `brand_attributed_sales_3_days` | numeric |
| 20 | `brand_attributed_sales_14_days` | numeric |
| 21 | `brand_attributed_sales_30_days` | numeric |
| 22 | `related_attributed_sales_3_days` | numeric |
| 23 | `related_attributed_sales_14_days` | numeric |
| 24 | `related_attributed_sales_30_days` | numeric |
| 25 | `download_date` | date |
| 26 | `ntb_orders_3_days` | bigint |
| 27 | `ntb_orders_14_days` | bigint |
| 28 | `ntb_orders_30_days` | bigint |
| 29 | `ntb_revenue_3_days` | numeric |
| 30 | `ntb_revenue_14_days` | numeric |
| 31 | `ntb_revenue_30_days` | numeric |
| 32 | `ntb_units_3_days` | bigint |
| 33 | `ntb_units_14_days` | bigint |
| 34 | `ntb_units_30_days` | bigint |
| 35 | `attributed_orders_3_days` | bigint |
| 36 | `attributed_orders_14_days` | bigint |
| 37 | `attributed_orders_30_days` | bigint |
| 38 | `other_sku_sales_3_days` | numeric |
| 39 | `other_sku_sales_14_days` | numeric |
| 40 | `other_sku_sales_30_days` | numeric |
| 41 | `in_store_advertised_sales_3_days` | numeric |
| 42 | `in_store_advertised_sales_14_days` | numeric |
| 43 | `in_store_advertised_sales_30_days` | numeric |
| 44 | `in_store_attributed_sales_3_days` | numeric |
| 45 | `in_store_attributed_sales_14_days` | numeric |
| 46 | `in_store_attributed_sales_30_days` | numeric |
| 47 | `in_store_orders_3_days` | bigint |
| 48 | `in_store_orders_14_days` | bigint |
| 49 | `in_store_orders_30_days` | bigint |
| 50 | `in_store_other_sales_3_days` | numeric |
| 51 | `in_store_other_sales_14_days` | numeric |
| 52 | `in_store_other_sales_30_days` | numeric |
| 53 | `in_store_units_sold_3_days` | bigint |
| 54 | `in_store_units_sold_14_days` | bigint |
| 55 | `in_store_units_sold_30_days` | bigint |

### `walmart_source_data.ad_platform_report` (55 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `date` | date |
| 6 | `campaign_id` | bigint |
| 7 | `advertiser_id` | bigint |
| 8 | `ad_group_id` | bigint |
| 9 | `platform` | character varying |
| 10 | `ad_spend` | numeric |
| 11 | `num_ads_shown` | bigint |
| 12 | `num_ads_clicks` | bigint |
| 13 | `direct_attributed_sales_3_days` | numeric |
| 14 | `direct_attributed_sales_14_days` | numeric |
| 15 | `direct_attributed_sales_30_days` | numeric |
| 16 | `attributed_units_3_days` | numeric |
| 17 | `attributed_units_14_days` | numeric |
| 18 | `attributed_units_30_days` | numeric |
| 19 | `brand_attributed_sales_3_days` | numeric |
| 20 | `brand_attributed_sales_14_days` | numeric |
| 21 | `brand_attributed_sales_30_days` | numeric |
| 22 | `related_attributed_sales_3_days` | numeric |
| 23 | `related_attributed_sales_14_days` | numeric |
| 24 | `related_attributed_sales_30_days` | numeric |
| 25 | `download_date` | date |
| 26 | `ntb_orders_3_days` | bigint |
| 27 | `ntb_orders_14_days` | bigint |
| 28 | `ntb_orders_30_days` | bigint |
| 29 | `ntb_revenue_3_days` | numeric |
| 30 | `ntb_revenue_14_days` | numeric |
| 31 | `ntb_revenue_30_days` | numeric |
| 32 | `ntb_units_3_days` | bigint |
| 33 | `ntb_units_14_days` | bigint |
| 34 | `ntb_units_30_days` | bigint |
| 35 | `attributed_orders_3_days` | bigint |
| 36 | `attributed_orders_14_days` | bigint |
| 37 | `attributed_orders_30_days` | bigint |
| 38 | `other_sku_sales_3_days` | numeric |
| 39 | `other_sku_sales_14_days` | numeric |
| 40 | `other_sku_sales_30_days` | numeric |
| 41 | `in_store_advertised_sales_3_days` | numeric |
| 42 | `in_store_advertised_sales_14_days` | numeric |
| 43 | `in_store_advertised_sales_30_days` | numeric |
| 44 | `in_store_attributed_sales_3_days` | numeric |
| 45 | `in_store_attributed_sales_14_days` | numeric |
| 46 | `in_store_attributed_sales_30_days` | numeric |
| 47 | `in_store_orders_3_days` | bigint |
| 48 | `in_store_orders_14_days` | bigint |
| 49 | `in_store_orders_30_days` | bigint |
| 50 | `in_store_other_sales_3_days` | numeric |
| 51 | `in_store_other_sales_14_days` | numeric |
| 52 | `in_store_other_sales_30_days` | numeric |
| 53 | `in_store_units_sold_3_days` | bigint |
| 54 | `in_store_units_sold_14_days` | bigint |
| 55 | `in_store_units_sold_30_days` | bigint |

### `walmart_source_data.ad_sba_profile` (17 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `advertiser_id` | bigint |
| 6 | `ad_group_id` | bigint |
| 7 | `campaign_id` | bigint |
| 8 | `sba_profile_id` | bigint |
| 9 | `brand_name` | character varying |
| 10 | `headline_text` | character varying |
| 11 | `click_url` | character varying |
| 12 | `created_on` | timestamp with time zone |
| 13 | `updated_on` | timestamp with time zone |
| 14 | `status` | bigint |
| 15 | `logo_url` | character varying |
| 16 | `review_status` | character varying |
| 17 | `review_reason` | character varying |

### `walmart_source_data.marketplace_orderlineitemcharge` (16 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `purchase_order_id` | character varying |
| 6 | `customer_order_id` | character varying |
| 7 | `sku` | character varying |
| 8 | `currency` | character varying |
| 9 | `charge_type` | character varying |
| 10 | `charge_name` | character varying |
| 11 | `amount` | numeric |
| 12 | `tax_name` | character varying |
| 13 | `tax_amount` | numeric |
| 14 | `seller_id` | bigint |
| 15 | `line_number` | character varying |
| 16 | `download_date` | date |

### `walmart_source_data.marketplace_orderlineitemstatus` (28 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `purchase_order_id` | character varying |
| 6 | `customer_order_id` | character varying |
| 7 | `line_number` | character varying |
| 8 | `status` | character varying |
| 9 | `statusquantity_amount` | character varying |
| 10 | `statusquantity_unit_of_measurement` | character varying |
| 11 | `cancellation_reason` | character varying |
| 12 | `trackinginfo_ship_date_time` | timestamp with time zone |
| 13 | `trackinginfo_method_code` | character varying |
| 14 | `trackinginfo_tracking_number` | character varying |
| 15 | `trackinginfo_tracking_url` | character varying |
| 16 | `carriername_other_carrier` | character varying |
| 17 | `carriername_carrier` | character varying |
| 18 | `returncenteraddress_name` | character varying |
| 19 | `returncenteraddress_address1` | character varying |
| 20 | `returncenteraddress_address2` | character varying |
| 21 | `returncenteraddress_city` | character varying |
| 22 | `returncenteraddress_state` | character varying |
| 23 | `returncenteraddress_postal_code` | character varying |
| 24 | `returncenteraddress_country` | character varying |
| 25 | `returncenteraddress_day_phone` | character varying |
| 26 | `returncenteraddress_email_id` | character varying |
| 27 | `download_date` | date |
| 28 | `seller_id` | bigint |

### `walmart_source_data.marketplace_orderpickupperson` (27 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `purchase_order_id` | character varying |
| 6 | `customer_order_id` | character varying |
| 7 | `complete_name` | character varying |
| 8 | `first_name` | character varying |
| 9 | `middle_name` | character varying |
| 10 | `last_name` | character varying |
| 11 | `general_suffix` | character varying |
| 12 | `maturity_suffix` | character varying |
| 13 | `title_of_respect` | character varying |
| 14 | `empty` | character varying |
| 15 | `phone_id` | character varying |
| 16 | `phone_area_code` | character varying |
| 17 | `phone_extension` | character varying |
| 18 | `phone_complete_number` | character varying |
| 19 | `phone_type` | character varying |
| 20 | `phone_subscriber_number` | character varying |
| 21 | `phone_country_code` | character varying |
| 22 | `phonevalidity_validation_type` | character varying |
| 23 | `phonevalidity_validation_status` | character varying |
| 24 | `phonevalidity_validated_date` | character varying |
| 25 | `phonevalidity_validated_by` | character varying |
| 26 | `download_date` | date |
| 27 | `seller_id` | bigint |

### `walmart_source_data.marketplace_ordersubtotal` (11 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `currency_code` | character varying |
| 4 | `country_code` | character varying |
| 5 | `purchase_order_id` | character varying |
| 6 | `customer_order_id` | character varying |
| 7 | `sub_total_type` | character varying |
| 8 | `currency` | character varying |
| 9 | `subtotal_amount` | numeric |
| 10 | `download_date` | date |
| 11 | `seller_id` | bigint |

### `walmart_source_data.monthly_budget` (6 columns)

| # | Column | Type |
|---|--------|------|
| 1 | `account_id` | bigint |
| 2 | `account_name` | character varying |
| 3 | `monthly_budget` | bigint |
| 4 | `app_name` | character varying |
| 5 | `start_date_of_month` | date |
| 6 | `month_name` | character varying |

