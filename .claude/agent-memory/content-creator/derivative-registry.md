# Derivative Registry

Every derivative produced by `/repurpose` is logged here. Derivatives are tracked assets, not reformatting: each row carries its own prediction_record id so the learning loop (`/content-learn`, content-analyst) can grade it independently of its source.

Why this exists (Jun-Jul 2026 platform record): Instagram deprioritizes aggregator-style reposts and caps trial Reels at 5 duplicates per day (Jun-Jul 2026), and X payouts are shifting to original authors away from repost accounts (rollout from late May 2026). Untracked cross-posting is now actively penalized; every derivative must be platform-native and individually measured.

## Schema

One row per derivative:

| Field | Meaning |
|---|---|
| source | Path or id of the canonical asset |
| platform | Target platform (x, linkedin, ig, threads, tiktok, newsletter, blog) |
| variant | Which derivative of the source this is (angle or format, e.g. `thread-v1`, `single-angle-2`) |
| date | Publish or creation date (YYYY-MM-DD) |
| prediction_record | Id of the prediction_record written at publish (see `.claude/commands/content-learn.md`); `pending` until published |
| status | drafted / published / graded |

## Registry

| source | platform | variant | date | prediction_record | status |
|---|---|---|---|---|---|

(Rows are appended by `/repurpose` and updated by `/content-learn`. Do not delete graded rows; they are the learning loop's history.)
