# Amazon Compliance Rubric (v5 §6)

## Hard rules

- Colon `:` permitted in bullets ONLY (banned in titles + descriptions).
- ALL CAPS reserved for: BPA, NSF, USDA, EPA, plus bullet headers.
- No HTML, no emojis, no special characters except hyphen + comma + period.
- Title: hyphen-only punctuation, word-repetition cap 2.
- Backend: ≤500 bytes single field — 1 byte over de-indexes everything.

## Prohibited words (live source)

The full ~200-word list lives at `src/lib/seo/prompts/amazon-prohibited-words.ts`. The compliance gate imports this list. Auto-correction map is in the same module.

## Auto-correction examples

| Prohibited | Replacement |
|---|---|
| treats | supports |
| cures | helps |
| heals | promotes recovery from |
| prevents | reduces the risk of |
| diagnoses | identifies |
| antibacterial | helps clean |

## Bypass

Per-field bypass requires explicit user override stored in `seo_listings.compliance_violations[].bypassed === true`. S9 still flags bypassed violations for review but does not block on them.
