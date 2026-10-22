# SEO S3: Reviews — SOP

> Standard Operating Procedure for generating review insights and handling the “0-review” skip case.

---

## 1. Overview

S3 analyzes customer reviews to extract:

- Common themes (pros/cons)
- Objections to address in copy
- Language customers use (useful for bullets/description)

Some products may have **0 reviews**. In that case, the project can still proceed, but you should document that S3 is skipped or not applicable.

---

## 2. Who can do this

- **viewer**: view review insights
- **editor/admin**: generate/re-generate and approve reviews analysis (depending on UI controls)

---

## 3. Where to find it (Navigation)

- **URL**: `/seo/{projectId}/reviews`

---

## 4. Inputs

- Completed S1 intake
- Review data availability (some ASINs may have none)

---

## 5. Outputs

- Review analysis artifacts (or a documented skip)
- Approved S3 (when approved in the UI)

---

## 6. Step-by-step procedure

1. Open `/seo/{projectId}/reviews`.
2. If reviews exist:
   - Generate the review analysis.
   - Review for accurate themes and “language to reuse”.
3. If reviews are 0:
   - Mark S3 as skipped/not applicable (as supported by the UI).
   - Proceed to S4.
4. Approve S3 in the UI.

---

## 7. Common issues / troubleshooting

- **S3 output is empty**
  - **Cause**: no reviews available for the ASIN set
  - **Fix**: treat as a 0-review project and proceed; do not block the pipeline

