# Redshift Schema Discovery — Monthly Reports

**Date:** 2026-04-23
**Context:** Gate for Products + B2B sections in Monthly Reports V1. Outcome of
Task 0 of `docs/superpowers/plans/2026-04-23-monthly-reports.md` and the source
of truth for V1 scope of Tasks 6 (Products) and 7 (B2B).

## How the evidence was gathered

`scripts/discover-monthly-redshift-schema.ts` queries Redshift via the shared
`queryRedshift()` client in `src/lib/redshift.ts`. Captured output lives at
`/tmp/redshift-schema.txt` (gitignored — not committed).

**Two catalog quirks learned while running the spike** (documented in the script
header so reruns are safe):

1. All tables in `intentwise_ecommerce_graph` are **Redshift Spectrum external
   tables** (data lake, Glue-backed). They do not appear in `pg_tables`, and
   their columns are not in `information_schema.columns`. The correct catalogs
   are `svv_external_tables` and `svv_external_columns`.
2. `SELECT COUNT(*) AS c` comes back with `c` as a **string** through this
   driver. A truthy check like `if (rows[0]?.c)` returns true for the string
   `"0"`, which produces false-positive "exists" matches. Coerce with
   `Number(...)` before the truthy test.

## Tables found in intentwise_ecommerce_graph

All 19 are external (Spectrum) tables:

```
account_summary
advertised_product_summary
campaign_summary
keyword_summary
label_summary
product_summary
producttarget_summary
refdata_account_keyword_classification
refdata_campaign_sub_brand_mapping
refdata_currency_exchange_rate
refdata_custom_product_attribute
refdata_date_dimension
refdata_label
refdata_label_mapping
refdata_product_cost
refdata_product_sku_mapping
refdata_product_title_image_mapping
refdata_sub_brand
searchterm_summary
```

The speculative per-ASIN table names (`business_report`, `asin_summary`,
`asin_report`, `business_summary`, `traffic_summary`,
`seller_central_business_report`) were **probed and do not exist**.

## Per-ASIN data availability

**Option A — Native Intentwise table found: `product_summary`**

`product_summary` is a daily per-ASIN grain (`product` column = ASIN,
`report_date` = day, plus `account_id` + `channel_id` + `country_code` to
disambiguate marketplaces). It carries everything the Products section of the
monthly report needs, without depending on ad presence:

| Report need          | Column in `product_summary`                        |
|----------------------|----------------------------------------------------|
| ASIN key             | `product` (character varying(100))                 |
| Daily bucket         | `report_date` (date)                               |
| Sessions             | `browser_session` + `mobile_app_session` (bigint)  |
| Page views           | `browser_page_views` + `mobile_app_page_views`     |
| Session-share %      | `browser_sessions_prcntg`, `mobile_app_sessions_prcntg` |
| Buy box %            | `buy_box_prcntg` (numeric(20,2))                   |
| Units ordered / shipped | `ordered_units`, `shipped_units` (bigint)       |
| Revenue ordered / shipped | `ordered_revenue`, `shipped_revenue` (numeric) |
| Gross sales          | `product_sales` (numeric) + `product_quantity`     |
| COGS                 | `shipped_cogs`, `sourcing_shipped_cogs`            |
| Ad attribution per-ASIN | `ad_impressions`, `ad_clicks`, `ad_spend`, `ad_revenue`, `ad_orders`, `ad_conversions` (and `_same_sku` variants) |
| Organic reputation   | `average_rating`, `review_count`, `rating_count`, `best_seller_rank` |
| Content dims         | `title_length`, `description_length`, `feature_bullet_count`, `image_count`, `aplus_page` |

This beats `advertised_product_summary` (which is 35 ad-only columns with no
sessions, no buy-box, no organic units) and means we can build a full Products
section with session-based CVR (orders / sessions), buy-box attainment, and
shipped-revenue-per-ASIN without an SP-API fallback.

**V1 scope:** include the Products section using `product_summary` as the
primary source. `advertised_product_summary` is still the correct choice for
campaign-level ad tables (it has `campaign_id` / `adgroup_id`); `product_summary`
does not carry campaign grain.

## B2B data availability

**Not found.**

Scanned all 30 columns of `account_summary` and all 54 columns of
`product_summary`. Neither table exposes a `b2b`, `business_customer`,
`consumer`, or equivalent split. Metric columns are single-stream
(`ordered_units`, `shipped_revenue`, `product_sales`, …). Intentwise's
external schema does not surface the B2B/consumer breakdown that the Amazon
Business Report does.

**V1 scope:** defer the B2B section to v0.2. Follow-up ticket: pull the Amazon
Business Report via SP-API (endpoint
`/reports/2021-06-30/reports?reportTypes=GET_SALES_AND_TRAFFIC_REPORT`) into a
new `amazon_business_report` Supabase table and hydrate from there.

## Decision for V1

- Headline KPIs + MoM: **in** (from `account_summary`).
- Products section: **in** — session-based CVR, buy-box %, ordered/shipped
  units, ordered/shipped revenue, and per-ASIN ad metrics, all from
  `product_summary`. Tasks 6 proceeds as planned (no degraded-mode branch).
- B2B split: **deferred to v0.2** (SP-API Business Report follow-up). Task 7
  should ship as a placeholder section or be skipped in V1.

This decision is the source of truth for Tasks 6–9.

## Appendix — full column dumps

### `advertised_product_summary` (35 cols, ad grain, per-ASIN per-campaign per-day)

```
account_name, account_id, channel_id, channel_name, country_code, currency_code,
product_ad_id, product (=ASIN), sku, product_title, ad_product_status,
adgroup_id, adgroup_name, adgroup_status, campaign_id, target_acos,
campaign_name, campaign_status, portfolio_id, portfolio_name, campaign_type,
report_date, ad_impressions, ad_clicks, ad_spend, ad_revenue, ad_orders,
ad_conversions, organization_id, organization_name, ad_ntb_revenue,
ad_ntb_orders, ad_ntb_ordered_units, last_updated_date, metadata_updated_date
```

### `account_summary` (30 cols, per-account per-marketplace per-day)

```
account_name, account_id, channel_id, channel_name, country_code, currency_code,
report_date, ad_impressions, ad_clicks, ad_spend, ad_revenue, ad_orders,
ad_conversions, product_sales, product_quantity, shipped_cogs, shipped_units,
shipped_revenue, ordered_units, ordered_revenue, current_month_budget,
sourcing_shipped_cogs, sourcing_shipped_units, sourcing_shipped_revenue,
total_order_items, organization_id, organization_name, browser_session,
mobile_app_sessions, glance_view_byasin
```

### `product_summary` (54 cols, per-ASIN per-marketplace per-day)

See the table above for the subset that matters for Monthly Reports V1. Full
list is in the script output when you rerun the spike.
