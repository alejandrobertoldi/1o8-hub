# SEO S6: Output (SEO Content + Compliance + Exports) — SOP

> Standard Operating Procedure for generating final listing copy, validating compliance, and exporting deliverables.

---

## 1. Overview

S6 is the final step that produces:

- Listing-ready copy (title, bullets, description, backend/search terms)
- Optional compliance review results
- Export artifacts (e.g., Google Doc export if enabled)

---

## 2. Who can do this

- **viewer**: view outputs
- **editor/admin**: generate/re-generate, approve, and export (depending on UI controls)

---

## 3. Where to find it (Navigation)

- **SEO content**: `/seo/{projectId}/seo`
- **Compliance**: `/seo/{projectId}/compliance`

---

## 4. Inputs

- Best results when S1–S5 are complete/approved
- Compliance docs/guidelines in S1 if the category is regulated

---

## 5. Outputs

- Final copy saved to the project
- Compliance findings (if run)
- Exported deliverables (Doc/Docx/etc. depending on configuration)

---

## 6. Step-by-step procedure

### A) Generate final SEO content

1. Open `/seo/{projectId}/seo`.
2. Generate the final SEO copy.
3. Review and edit for:
   - Brand voice and formatting
   - Keyword integration without stuffing
   - Claim safety
4. Approve S6 when ready.

### B) Run compliance checks (if applicable)

1. Open `/seo/{projectId}/compliance`.
2. Run compliance.
3. If issues are flagged:
   - Adjust copy in `/seo/{projectId}/seo`
   - Re-run compliance until acceptable

### C) Export deliverables

1. From the project UI, run the export action (Google Doc export or other available export).
2. Confirm the export generated successfully and share with the stakeholder.

---

## 7. Common issues / troubleshooting

- **Compliance flags too many items**
  - **Cause**: regulated claims or insufficient guidance
  - **Fix**: tighten S1 compliance guidance; soften claims in copy; re-run

- **Export fails**
  - **Cause**: missing configuration (Drive folder, permissions) or network failure
  - **Fix**: retry; if persistent, admin should check SEO config and logs

