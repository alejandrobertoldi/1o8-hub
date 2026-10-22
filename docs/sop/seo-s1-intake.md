# SEO S1: Intake — SOP

> Standard Operating Procedure for setting up an SEO project with ASINs and reference documents so downstream AI steps (S2–S6) have the right context.

---

## 1. Overview

S1 Intake is where you define what the project is “about”:

- Which ASIN(s) are in scope
- Any brand guidelines, compliance notes, or reference docs
- The baseline details that later steps use

---

## 2. Who can do this

- **viewer**: view project intake
- **editor/admin**: edit intake inputs and approve S1 (depending on UI controls)

---

## 3. Where to find it (Navigation)

- From `/seo`, open a project
- **URL**: `/seo/{projectId}/intake`

---

## 4. Inputs

Typical required inputs:

- **ASIN(s)** (one or more)

Optional but strongly recommended:

- **Brand guidelines** (tone, claims, do/don’t)
- **Compliance docs** (restricted claims, medical/regulated content guidance)
- Any **product/brand reference docs** you want the AI to follow

---

## 5. Outputs

- Stored project intake data
- S1 marked ready/approved (when the step is approved in the UI)

---

## 6. Step-by-step procedure

1. Open `/seo/{projectId}/intake`.
2. Add the ASIN(s) for the project.
3. Upload or attach any brand/compliance/reference docs.
4. Review for completeness:
   - Correct ASINs
   - Correct brand name
   - Guidelines attached if available
5. Approve/complete S1 in the UI (if an approval button is present).

---

## 7. Common issues / troubleshooting

- **The next step (S2) has weak/incorrect output**
  - **Cause**: intake context is missing or incomplete
  - **Fix**: revisit S1 and add guidelines/docs, then regenerate S2 outputs

- **Doc upload fails**
  - **Cause**: file type/size limitations or extraction errors
  - **Fix**: try PDF first, re-export the file, or paste key text manually if supported

