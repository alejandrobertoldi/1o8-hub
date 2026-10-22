--
-- PostgreSQL database dump
--

\restrict 0GXVd8jgXkK5R54fdknEicIUrW1hTgLRrh4FYJMBxt87mTqa3AXaWFGxvohNnyp

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: case_studies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_studies (id, client_id_code, title, date_range_start, date_range_end, sections_enabled, status, generated_at, created_at, updated_at) FROM stdin;
0eac6a98-862f-4b4c-9b54-030b477a1621	GLO_SC_US	Amazon Case Study — GLO_SC_US	2025-09-01	2026-05-01	{cover,storefront,brand_story,product_listing,aplus,sales,ppc,sns,store_btp}	draft	2026-05-20 17:59:34.14+00	2026-05-20 17:57:04.285578+00	2026-05-20 17:59:34.14+00
fc34f32a-2194-425b-b884-1ce3c62f402d	DRC_SC_US	Amazon Case Study — DRC_SC_US	2025-01-01	2026-01-01	{cover,storefront,brand_story,product_listing,aplus,sales,ppc,store_btp,sns}	draft	2026-05-22 21:43:30.883+00	2026-05-22 21:42:32.424787+00	2026-05-22 21:43:30.883+00
547ed187-b5a3-4059-8031-a0e91c879ef8	C23_SC_US	Amazon Case Study — C23_SC_US	2026-01-01	2026-05-24	{cover,storefront,brand_story,product_listing,aplus,sales,ppc}	draft	2026-05-26 08:16:37.108+00	2026-05-26 08:16:32.98729+00	2026-05-26 08:16:37.108+00
\.


--
-- Data for Name: case_study_sections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_study_sections (id, case_study_id, section_type, sort_order, content, updated_at) FROM stdin;
14501ae1-701f-414d-b34a-59e726e1d1d9	0eac6a98-862f-4b4c-9b54-030b477a1621	storefront	1	{"copy": "", "imageUrls": []}	2026-05-20 17:59:33.850059+00
f11b40f8-ff08-4224-9215-1eba6b3001e6	0eac6a98-862f-4b4c-9b54-030b477a1621	brand_story	2	{"copy": "", "imageUrls": []}	2026-05-20 17:59:33.850059+00
16db6468-fe4c-4cd1-8b96-15aace52971f	0eac6a98-862f-4b4c-9b54-030b477a1621	product_listing	3	{"copy": "", "imageUrls": []}	2026-05-20 17:59:33.850059+00
89355d34-a82a-423f-baf5-65607d3732da	0eac6a98-862f-4b4c-9b54-030b477a1621	aplus	4	{"copy": "", "imageUrls": []}	2026-05-20 17:59:33.850059+00
5c764e1a-d830-4bf3-9960-2bd61c2e7f95	0eac6a98-862f-4b4c-9b54-030b477a1621	sales	5	{"copy": "", "totalUnits": 0, "statCallout": "", "totalOrders": 3861, "salesByMonth": [{"month": "2025-09", "orders": 0, "revenue": 0}, {"month": "2025-10", "orders": 0, "revenue": 0}, {"month": "2025-11", "orders": 0, "revenue": 0}, {"month": "2025-12", "orders": 0, "revenue": 0}, {"month": "2026-01", "orders": 67, "revenue": 0}, {"month": "2026-02", "orders": 651, "revenue": 0}, {"month": "2026-03", "orders": 1276, "revenue": 0}, {"month": "2026-04", "orders": 1800, "revenue": 0}, {"month": "2026-05", "orders": 67, "revenue": 0}], "avgOrderValue": 0, "lifetimeRevenue": 0}	2026-05-20 17:59:33.850059+00
2d962abf-48da-4e15-b056-f6c1eb5da89d	0eac6a98-862f-4b4c-9b54-030b477a1621	ppc	6	{"ytd": {"ntb": 0, "acos": 13.944844470046078, "chart": [], "sales": 6944, "spend": 968.3299999999996}, "copy": "", "lifetime": {"ntb": 0, "acos": 13.944844470046078, "chart": [], "sales": 6944, "spend": 968.3299999999996}, "statCallout": ""}	2026-05-20 17:59:33.850059+00
cfcfbeb1-7206-463c-ac32-9ba3396bd45f	0eac6a98-862f-4b4c-9b54-030b477a1621	sns	7	{"copy": "", "timeline": [{"date": "2026-02-28", "value": 3, "yearAgo": null}, {"date": "2026-03-07", "value": 10, "yearAgo": null}, {"date": "2026-03-14", "value": 21, "yearAgo": null}, {"date": "2026-03-21", "value": 29, "yearAgo": null}, {"date": "2026-03-28", "value": 37, "yearAgo": null}, {"date": "2026-04-04", "value": 42, "yearAgo": null}, {"date": "2026-04-11", "value": 50, "yearAgo": null}, {"date": "2026-04-18", "value": 58, "yearAgo": null}, {"date": "2026-04-25", "value": 65, "yearAgo": null}], "momGrowth": 12.068965517241379, "revenueTotal": 0, "totalSubscriptions": 65}	2026-05-20 17:59:33.850059+00
08a6d68a-8561-45c1-bb2c-5a9da15eb2ae	0eac6a98-862f-4b4c-9b54-030b477a1621	store_btp	8	{"copy": "", "imageUrls": []}	2026-05-20 17:59:33.850059+00
0291c3a5-c35c-4334-b40c-f50cc279d6ee	fc34f32a-2194-425b-b884-1ce3c62f402d	cover	0	{"tagline": "", "clientLogoUrl": "", "heroImageUrls": []}	2026-05-22 21:43:30.633065+00
85128edb-13f3-465e-8f40-89a23f613862	0eac6a98-862f-4b4c-9b54-030b477a1621	cover	0	{"tagline": "", "clientLogoUrl": "/Logos.png", "heroImageUrls": []}	2026-05-20 18:10:32.550487+00
44269a4f-fb63-4e8d-a38b-18ad70c53001	fc34f32a-2194-425b-b884-1ce3c62f402d	storefront	1	{"copy": "", "imageUrls": []}	2026-05-22 21:43:30.633065+00
2d623e25-574c-4f0a-8ace-46be336fe058	fc34f32a-2194-425b-b884-1ce3c62f402d	brand_story	2	{"copy": "", "imageUrls": []}	2026-05-22 21:43:30.633065+00
a9d503f5-af85-4340-8ba1-c8d11fd83744	fc34f32a-2194-425b-b884-1ce3c62f402d	product_listing	3	{"copy": "", "imageUrls": []}	2026-05-22 21:43:30.633065+00
3aa2dbd6-5753-46f3-8b2f-fd0c1c980f5c	fc34f32a-2194-425b-b884-1ce3c62f402d	aplus	4	{"copy": "", "imageUrls": []}	2026-05-22 21:43:30.633065+00
20c8bd63-a695-4f94-bfc9-e06ca9eb9e89	fc34f32a-2194-425b-b884-1ce3c62f402d	sales	5	{"copy": "", "totalUnits": 0, "statCallout": "", "totalOrders": 2960, "salesByMonth": [{"month": "2025-01", "orders": 51, "revenue": 0}, {"month": "2025-02", "orders": 10, "revenue": 0}, {"month": "2025-03", "orders": 17, "revenue": 0}, {"month": "2025-04", "orders": 24, "revenue": 0}, {"month": "2025-05", "orders": 25, "revenue": 0}, {"month": "2025-06", "orders": 9, "revenue": 0}, {"month": "2025-07", "orders": 71, "revenue": 0}, {"month": "2025-08", "orders": 210, "revenue": 0}, {"month": "2025-09", "orders": 456, "revenue": 0}, {"month": "2025-10", "orders": 771, "revenue": 0}, {"month": "2025-11", "orders": 809, "revenue": 0}, {"month": "2025-12", "orders": 496, "revenue": 0}, {"month": "2026-01", "orders": 11, "revenue": 0}], "avgOrderValue": 0, "lifetimeRevenue": 0}	2026-05-22 21:43:30.633065+00
40157ac6-6d6f-4369-af20-d2192ae46c51	fc34f32a-2194-425b-b884-1ce3c62f402d	ppc	6	{"ytd": {"ntb": 0, "acos": 82.49186886762924, "chart": [], "sales": 1469.66, "spend": 1212.35}, "copy": "", "lifetime": {"ntb": 0, "acos": 82.49186886762924, "chart": [], "sales": 1469.66, "spend": 1212.35}, "statCallout": ""}	2026-05-22 21:43:30.633065+00
9fdc374f-2ecc-4957-9a9a-a0758885ea32	fc34f32a-2194-425b-b884-1ce3c62f402d	store_btp	7	{"copy": "", "imageUrls": []}	2026-05-22 21:43:30.633065+00
9c3de65d-9420-4713-be11-df8adb997605	fc34f32a-2194-425b-b884-1ce3c62f402d	sns	8	{"copy": "", "timeline": [{"date": "2025-08-16", "value": 3, "yearAgo": null}, {"date": "2025-08-23", "value": 4, "yearAgo": null}, {"date": "2025-08-30", "value": 4, "yearAgo": null}, {"date": "2025-09-06", "value": 5, "yearAgo": null}, {"date": "2025-09-13", "value": 5, "yearAgo": null}, {"date": "2025-09-20", "value": 7, "yearAgo": null}, {"date": "2025-09-27", "value": 7, "yearAgo": null}, {"date": "2025-10-04", "value": 7, "yearAgo": null}, {"date": "2025-10-11", "value": 6, "yearAgo": null}, {"date": "2025-10-18", "value": 8, "yearAgo": null}, {"date": "2025-10-25", "value": 10, "yearAgo": null}, {"date": "2025-11-01", "value": 10, "yearAgo": null}, {"date": "2025-11-08", "value": 12, "yearAgo": null}, {"date": "2025-11-15", "value": 14, "yearAgo": null}, {"date": "2025-11-22", "value": 15, "yearAgo": null}, {"date": "2025-11-29", "value": 18, "yearAgo": null}, {"date": "2025-12-06", "value": 17, "yearAgo": null}, {"date": "2025-12-13", "value": 16, "yearAgo": null}, {"date": "2025-12-20", "value": 18, "yearAgo": null}, {"date": "2025-12-27", "value": 20, "yearAgo": null}], "momGrowth": 11.11111111111111, "revenueTotal": 0, "totalSubscriptions": 20}	2026-05-22 21:43:30.633065+00
e6831d62-be3e-4961-88ef-e432e1a4a4a6	547ed187-b5a3-4059-8031-a0e91c879ef8	cover	0	{"tagline": "", "clientLogoUrl": "", "heroImageUrls": []}	2026-05-26 08:16:37.008104+00
130b3373-cab9-4b9a-947c-12c8508d3503	547ed187-b5a3-4059-8031-a0e91c879ef8	storefront	1	{"copy": "", "imageUrls": []}	2026-05-26 08:16:37.008104+00
d667427a-f05d-4c59-b211-98b8d3eeca78	547ed187-b5a3-4059-8031-a0e91c879ef8	brand_story	2	{"copy": "", "imageUrls": []}	2026-05-26 08:16:37.008104+00
02633d0b-66d8-44c5-bb31-c2c151d1fbf7	547ed187-b5a3-4059-8031-a0e91c879ef8	product_listing	3	{"copy": "", "imageUrls": []}	2026-05-26 08:16:37.008104+00
ceeb15f7-281b-4019-aae6-2dabb4ad1f7a	547ed187-b5a3-4059-8031-a0e91c879ef8	aplus	4	{"copy": "", "imageUrls": []}	2026-05-26 08:16:37.008104+00
d59a8646-804c-44d6-a5f8-b6b33f7a1eac	547ed187-b5a3-4059-8031-a0e91c879ef8	sales	5	{"copy": "", "totalUnits": 0, "statCallout": "", "totalOrders": 1807, "salesByMonth": [{"month": "2026-01", "orders": 421, "revenue": 0}, {"month": "2026-02", "orders": 210, "revenue": 0}, {"month": "2026-03", "orders": 175, "revenue": 0}, {"month": "2026-04", "orders": 636, "revenue": 0}, {"month": "2026-05", "orders": 365, "revenue": 0}], "avgOrderValue": 0, "lifetimeRevenue": 0}	2026-05-26 08:16:37.008104+00
e8a92004-91e1-4dbf-b105-909e2af635a8	547ed187-b5a3-4059-8031-a0e91c879ef8	ppc	6	{"ytd": {"ntb": 0, "acos": 18.922866850846273, "chart": [], "sales": 314.91, "spend": 59.59}, "copy": "", "lifetime": {"ntb": 0, "acos": 18.922866850846273, "chart": [], "sales": 314.91, "spend": 59.59}, "statCallout": ""}	2026-05-26 08:16:37.008104+00
\.


--
-- PostgreSQL database dump complete
--

\unrestrict 0GXVd8jgXkK5R54fdknEicIUrW1hTgLRrh4FYJMBxt87mTqa3AXaWFGxvohNnyp

