# Byte Budgets

| Field | Min chars | Max chars | Byte limit | Encoding |
|---|---|---|---|---|
| title | 1 | 75 | n/a (chars) | UTF-8 |
| item_highlight | 1 | 125 | n/a (chars) | UTF-8 |
| bullet detailed | 390 | 400 | n/a | UTF-8 |
| bullet concise | 190 | 200 | n/a | UTF-8 |
| bullet content | 90 | 100 | n/a | UTF-8 |
| bullet key_features | 40 | 50 | n/a | UTF-8 |
| product_description | 1000 | 1200 | n/a | UTF-8 |
| backend_search_terms | n/a | n/a | 500 bytes | UTF-8 |
| aplus_premium_qa.question | 115 | 120 | n/a | UTF-8 |
| aplus_premium_qa.answer | 245 | 250 | n/a | UTF-8 |
| image alt_text | 95 | 100 | n/a | UTF-8 |
| image overlay_text | 0 | 100 | n/a | UTF-8 (Not Applicable for MAIN) |

Counts are inclusive on both ends.

## Byte vs char distinction

`backend_search_terms` is the only byte-limited field. Use UTF-8 byte length, not char length. Multi-byte characters (curly quotes, accented chars) consume >1 byte.
