# SEO S2: Keywords — SOP

> Standard Operating Procedure for generating and approving keyword research for an SEO project.

---

## 1. Overview

S2 generates keyword research used for:

- Listing title and bullets
- Backend keywords
- Content prioritization and messaging

---

## 2. Who can do this

- **viewer**: view keyword outputs
- **editor/admin**: generate/re-generate and approve keywords (depending on UI controls)

---

## 3. Where to find it (Navigation)

- **URL**: `/seo/{projectId}/keywords`

---

## 4. Inputs

- Completed S1 intake (ASINs + context)

---

## 5. Outputs

- A keyword set for the project
- Approved S2 (when approved in the UI)

---

## 6. Step-by-step procedure

1. Open `/seo/{projectId}/keywords`.
2. Generate keywords (or re-generate if needed).
3. Review the output for:
   - Relevance to the product
   - Coverage of major intents and synonyms
   - Obvious missing “must-have” terms
4. If needed, adjust inputs upstream (S1) and regenerate.
5. Approve S2 in the UI.

---

## 7. Common issues / troubleshooting

- **Keywords look generic**
  - **Cause**: intake lacks product specifics or guidelines
  - **Fix**: improve S1 context and regenerate

