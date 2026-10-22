# SEO content review: revisions, PM → AM → client approval, push the approved text

**Date:** 2026-10-01 · **Status:** approved in conversation (sections 1–6), awaiting written-spec review · **Owner:** Manu

## 1. Problem

After S6 is locked, the Hub exports a `.docx` to Drive (`export-gdoc/route.ts`), the client comments, and the SEO team
rewrites the text by hand inside the doc, usually over several rounds. Nothing comes back into the Hub: the approved
wording lives only in Drive, the Hub keeps the pre-comment draft, and Push to Products pushes whatever is in S6
(approved or not). There is no record of who approved what, and no internal sign-off before the client sees it.

## 2. Goal and decisions (all ruled by Manu, 2026-10-01)

- **D1 — The MF team edits in the Hub.** Clients only comment. S6 is the working copy.
- **D2 — Rounds are revisions inside one project** (r1, r2 …). `_vNN` stays reserved for a genuinely new SEO strategy.
- **D3 — Approval chain:** SEO specialist submits → **assigned PM** approves → **assigned AM** decides, **per round**:
  send to client, approve as final (reason required), or request changes → **client** approves or requests changes.
- **D4 — Approvers:** only the client's assigned PM / AM (from `aac.rawData` `ProjectManager_MF` / `AccountManager_MF`),
  plus **Owner / Super Admin as a logged override** at any step. The author can never approve their own revision.
- **D5 — Any "changes requested" restarts the next revision at PM → AM**, whoever rejected.
- **D6 — No documents in the review flow.** PM, AM and client review on the **Amazon PDP preview** (`ProductPdp`),
  with a **Proposed / Current** toggle that marks changed fields.
- **D7 — Client reviews in the portal**, approving the **whole revision** (not per ASIN).
- **D8 — The team pushes, with a record.** Push to Products accepts only the current approved revision.
- **Out of scope:** notifications (email / Hub alerts), per-revision Drive docs, writing to BigQuery `MFBibleApp.SEO`
  (go-live / PPC Status keep needing that outside step), bulk push, per-ASIN client approval.

## 3. Revision lifecycle

States: `pm_review` → `am_review` → `client_review` (optional) → `approved`, or `changes_requested` from any review state.

| Actor | In state | Actions | Next state |
|---|---|---|---|
| Specialist | S6 locked, no open revision | Save & Submit for review | new rN in `pm_review` |
| Assigned PM / override | `pm_review` | Approve · Request changes (note required) | `am_review` · `changes_requested` |
| Assigned AM / override | `am_review` | Send to client · Approve as final (reason required) · Request changes | `client_review` · `approved` · `changes_requested` |
| Client user | `client_review` | Approve · Request changes (≥1 comment or note) | `approved` · `changes_requested` |

- Submitting freezes rN: a snapshot of each ASIN's listing fields copied from the project-scoped `seo_asins.generated_content`.
- At most **one open revision per project** (`pm_review` / `am_review` / `client_review`).
- While a revision is open, **S6 is read-only**. After `changes_requested`, S6 unlocks and the specialist submits rN+1 → `pm_review`.
- An `approved` revision becomes the project's **current approved** revision. A later approval replaces it as current; the old one stays in history.
- The author (submitter) is blocked from the PM and AM actions on that revision, even if they are the assigned PM / AM (an override is then required).

## 4. Data (new tables only; migration = next free number at build time, likely 0124 — 0123 is claimed by Thread AB)

1. **`seo_revisions`** — `id`, `project_id` → `seo_projects`, `revision_number` (unique per project), `status`
   (check: the five states), `content` jsonb `{ [asin]: { <listing fields> } }` holding exactly the keys `FIELD_MAP`
   (`migrate-to-products/field-map.ts`) reads, and nothing else,
   `submitted_by`, `submitted_at`, `final_via` (`client` | `am_final` | null), `final_reason`, `is_current` bool,
   timestamps. Partial unique indexes: one open revision per project; one `is_current` per project.
2. **`seo_revision_events`** — append-only log: `revision_id`, `step` (`submit` | `pm` | `am` | `client`),
   `action` (`submit` | `approve` | `request_changes` | `send_to_client` | `approve_final`), `actor_email`, `actor_name`,
   `acted_as` (`assigned` | `override` | `client` | `author`), `note`, `created_at`.
3. **`seo_revision_comments`** — `revision_id`, `asin`, `field_key` (a `content` key), `parent_comment_id`, `audience`
   (`internal` | `client`), `author_email`, `author_name`, `body`, `resolved_by`, `resolved_at`, timestamps.
4. **`seo_revision_pushes`** — `revision_id` (nullable for an override push), `project_id`, `product_id` → `master`,
   `pushed_by`, `override_reason`, `created_at`.

Nothing is added to `master` or `seo_projects`. Additive only.

## 5. Hub screens (staff)

- **S6:** "Save & Lock S6" becomes **Save & Submit for review**. A **revision strip** at the top shows the current stage
  and history. Read-only banner while in review. After changes are requested, a **comments panel** is grouped by
  ASIN → field with resolve ticks; unresolved comments **do not block** submitting (they carry over, marked "still open").
- **Review page** `/seo/[id]/review/[rev]`: one tab per ASIN, the PDP preview (`ProductPdp readOnly`) with the revision's
  text overlaid on the real product through `FIELD_MAP`, a Proposed / Current toggle, and a strip for backend terms and
  content bullets (with char/byte counts). Click a field to comment (always `internal` for staff unless replying to the
  client). The action bar shows only to whoever may act; overrides are labelled "(override)"; everyone else sees
  "Waiting for <name>".
- **Finding work:** the project status pill shows the review stage; `/seo/manager` gets **"Needs my review (n)"**
  (revisions awaiting the signed-in user as assigned PM/AM; unmatched approvers listed as *unassigned*).

## 6. Client portal

- `/portal/seo` gains **"Waiting for your review (n)"**, stacked per visible client for multi-account users.
- `/portal/seo/review/[rev]`: the same PDP preview + toggle; the variation-sibling fetch uses a portal-safe source
  (the staff `/api/products/[id]/family` endpoint is not reachable for client users). Backend terms are labelled
  "Hidden search terms (not visible to shoppers)". Client comments per field; staff replies marked client-visible.
  **Approve** (whole revision) / **Request changes**. Read-only once decided, showing who decided and when.
- **Server checks:** the revision's client ∈ the user's visible clients (the shared multi-account helper, not raw
  equality), the SEO portal section enabled, status `client_review`. Portal responses use a **separate client-safe
  shape** with no internal comments, PM/AM notes or override reasons.
- Styling per DESIGN.md: portal charcoal-blue accent, no hub orange.

## 7. Push to Products

- The existing button on the S6 final screen pushes the **current approved revision's frozen text**, never S6.
  No approved revision → disabled with "Needs an approved revision"; server 409.
- **Pre-push check:** per ASIN, the fields that will change (the same `FIELD_MAP` overlay as the preview), plus a
  **catalog drift warning** for fields edited in the catalog after approval; overwriting needs an explicit confirm.
- The write is unchanged: `master` core + `contentSeo` via `FIELD_MAP`, `changeLog` entry reading
  "SEO vNN rM (approved by client|AM final, <date>)", `isDirty=true` for the normal Publish. One `seo_revision_pushes`
  row per product per push; re-push allowed.
- The product detail page shows "SEO: vNN rM · approved <date> by <name> (<via>) · pushed <date> by <name>".
- **Legacy projects** (no revisions): Owner / Super Admin **"Push without review"** with a required reason, recorded in
  `seo_revision_pushes` (`revision_id` null, `override_reason` set); otherwise they go through r1.

## 8. Errors and edge cases

- Every state change is a conditional update on the expected status; a lost race → 409 "Already decided by <name>, reload".
- A second open revision is refused by the partial unique index → 409 "rN is still in review".
- No matched PM/AM (missing, misspelled, rebrand duplicate): the page says so; only an override can act.
- Author = assigned approver → the step needs an override.
- An ASIN removed from the project, or a product deleted, after approval: the push skips it and lists it.
- **Prerequisite:** the project-scoped S6 save fix (`77957f7e0`, branch `seo/save-scope-project`) must be live first.

## 9. Testing

- Pure transition module: every allowed and forbidden transition; who may act (assigned, override, author blocked, client).
- Approver matching: name → user including rebrand duplicates and missing names (reuse `resolveClientTeam`'s matching).
- Route tests: submit, each decision, the race → 409, portal payload has no internal fields, multi-account access.
- A test pinning that the preview overlay and Push to Products use the same `FIELD_MAP` function.
- Headless browser pass on :3100: submit → PM → AM → client (client-role session) → approve → push preview.
- Applying the migration and any push/deploy each need a separate explicit OK.
