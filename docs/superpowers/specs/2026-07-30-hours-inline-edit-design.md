# Dynamic inline editing of logged hours on `/hours-log`

**Date:** 2026-07-30
**Component:** `src/components/hours/hours-tracker.tsx`
**Branch:** `feat/hours-inline-edit` (worktree `/Users/manu/MFHub-wt-hours-inline-edit`, off `main` @ `f8a5169d`)

## Problem

Editing an already-logged entry costs three blocking interactions: click the pencil, change a field, click ✓, then wait. The wait is real — `updateEntry.onSuccess` calls `invalidateQueries(["hours"])` and only then `setEditingId(null)`, so edit mode does not release until the PATCH round trip *and* the follow-up refetch complete ([`hours-tracker.tsx:326-359`](../../../src/components/hours/hours-tracker.tsx)). A single `editingId` means no second row can be touched while the first is in flight. Correcting five rows means five stop-and-wait cycles.

Goal: click a cell and type; move to another row whenever you want; never wait for a confirmation.

## Current behaviour (verified, not assumed)

| Fact | Location |
|---|---|
| One row editable at a time via `editingId` + five scalar `editX` states | `hours-tracker.tsx:306-311` |
| Pencil enters edit mode; whole row becomes 4 controls at once | `hours-tracker.tsx:762-857`, `:890` |
| Save PATCHes the **entire** entry, then invalidates, then exits edit mode, then toasts | `hours-tracker.tsx:326-371` |
| `entryDate` is passed through unchanged — the Date column is never editable | `hours-tracker.tsx:364` |
| Query is keyed/fetched **by date range only**, no client filter server-side | `hours-tracker.tsx:191-198` |
| `overlapIds` computed client-side per day over the whole fetched range, using the same `findOverlaps` helper as the server | `hours-tracker.tsx:278-293` |
| An `overlap` badge already renders inline on offending rows | `hours-tracker.tsx:867-872` |
| Server overlap check is **advisory** — the update is written either way | `src/app/api/hours/[id]/route.ts:69-83` |
| PATCH hard-rejects a midnight-crossing edit with a 400 and a user-facing message | `src/app/api/hours/[id]/route.ts:52-57` |

Two consequences that shape the design:

1. **Cell-level autosave is wrong here.** Start and end time are a validated pair. Editing `17:00–17:30` → `19:00–19:30` one field at a time would send an intermediate `19:00–17:30`, which is invalid and would raise a bogus overlap against whatever sits at 19:00. The commit boundary must be the **row**, matching the endpoint, which validates the whole entry.
2. **The overlap toast is redundant.** Because every entry of every in-range day is already loaded, and the edited row's day is by definition in range, client-side `overlapIds` sees exactly what the server sees. The existing inline badge carries the warning, and with optimistic updates it appears with no round trip. The client stops reading `overlaps[]` from the PATCH response. The route is not modified.

## Locked decisions

- **Activation:** clicking any editable cell puts the **whole row** into edit mode (same visual as today's pencil mode), with focus landing in the cell that was clicked. Pencil is deleted.
- **Commit:** leaving the row commits it, optimistically, in the background. `Enter` commits and stays put. ✓ commits. `Esc` discards. The ✓/✕ pair remains in the actions cell.
- **Feedback:** no success toast. A faint pending indicator in the row's action cell while in flight. Failures turn the row red, keep the typed values, and keep it editable with a retry. Overlaps use the existing badge.
- **Invalid rows do not block you.** Clicking away from an invalid row skips the commit and leaves the row red and unsaved. Focus is never trapped.
- Editable columns: Client, Category, Time, Note. Date (day-group header) and Hours (computed) are not editable. Trash button unchanged; clicking the actions cell does not enter edit mode.

## Architecture

### State

```ts
type DraftStatus = "editing" | "saving" | "error";

type Draft = {
  clientIdCode: string;
  category: string;
  startTime: string;
  endTime: string;
  note: string;
  status: DraftStatus;
  error?: string;
  snapshot: ApiEntry;   // pre-edit row, for rollback
};

const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
const [activeRowId, setActiveRowId] = useState<string | null>(null);
```

`activeRowId` is the single row in `editing` status. `drafts` additionally retains rows that are `saving` (in flight) or `error` (failed). A row renders as controls when:

```
id === activeRowId || drafts.get(id)?.status === "error"
```

so two failed rows can both sit open with their typed values recoverable, while the active row is elsewhere. `saving` rows render as normal text showing the optimistic values plus a pending indicator.

Two re-entry rules:

- **Clicking into an `error` row resumes editing it** — it becomes `activeRowId`, status flips back to `editing`, typed values and `snapshot` are kept, `error` is cleared.
- **Clicking into a `saving` row re-opens it** with a fresh draft seeded from the optimistic values. The older request is then stale: on its response, apply the server entry to the cache only if no newer draft exists for that id, and never delete a draft the second edit created. This is the one concurrency case the design must not lose data on.

### Commit triggers

Commit fires on:

1. `activeRowId` transitioning to a different row id (or `null`).
2. `Enter` while focus is in the note field or on a row button — commits, exits edit mode, leaves focus in place. `Enter` while a `Select` dropdown is open belongs to the dropdown and does not commit.
3. The ✓ button.
4. Range/preset change, and component unmount.

`Esc` discards the draft and exits edit mode. Clicking another cell in the *same* row moves focus without committing.

**Commit is driven off `activeRowId` transitions, never DOM `blur`.** shadcn's `Select` renders its dropdown in a portal outside the row, so a `blur`-based commit would fire every time the client or time dropdown opens — committing the row mid-edit. Deriving commit from state transitions sidesteps the portal problem entirely.

Clicks that land outside the table (presets, log form, whitespace) are caught by a single document-level `pointerdown` listener that clears `activeRowId`. It is suppressed while any `Select` in the active row is open, tracked through Radix's `onOpenChange` — not by inspecting DOM ancestry for portal wrappers.

### Optimistic save and cache ownership

The current `invalidateQueries` on every save would, with background saves, refetch and overwrite whatever is being typed in another row. Replaced by direct cache ownership:

| Step | Action |
|---|---|
| Commit | `setQueryData(["hours", from, to], …)` patching the row with draft values and an `hours` recomputed locally via the existing `normalizeRange` helper. Draft → `saving`. `overlapIds` recomputes from the patched cache, so the overlap badge appears immediately. |
| PATCH success | Patch the cache again with the **server's returned entry** (authoritative normalization of times and `hours`); delete the draft. **No `invalidateQueries`.** |
| PATCH failure | Restore `snapshot` into the cache; draft → `error` with the server's message (or a network message); typed values retained. |

A full refetch happens only when `drafts.size === 0` — on range/preset change or an explicit refresh. `refetchOnWindowFocus` is suppressed for the hours query while any draft is outstanding, so alt-tabbing cannot eat an in-progress edit.

**No-op commits are skipped.** A draft equal to its snapshot fires no request, so clicking through rows without changing anything produces zero network traffic.

Delete: removing a row also deletes any draft for that id.

### Failure and validation

A draft is valid when `clientIdCode` is set and `normalizeRange({startTime, endTime}).ok` — the same predicate as today's `editValid`. On an invalid commit attempt the request is skipped and the draft goes to `error` with an inline reason. Server 400s (notably the midnight-crossing rejection) surface the same way, using the server's own message, pinned to the row instead of flashing in a toast.

Retry re-runs the commit for that row using the current draft values.

## Units and testing

New pure module `src/lib/hours/inline-edit.ts` — no React, fully unit-testable:

| Function | Responsibility |
|---|---|
| `draftFromEntry(entry): Draft` | Seed a draft from a row |
| `isDraftDirty(draft): boolean` | Compare draft against its snapshot; gates the no-op skip |
| `isDraftValid(draft): { ok: true } \| { ok: false; error: string }` | Client required + range valid |
| `applyDraftToRows(rows, id, draft): ApiEntry[]` | Optimistic cache patch, incl. locally recomputed `hours` |
| `applyServerEntry(rows, entry): ApiEntry[]` | Authoritative post-success patch |

Vitest unit tests cover each, including: no-op detection, whitespace-only note changes, invalid ranges, and `applyDraftToRows` preserving row order and leaving other rows untouched.

Focus behaviour, the portal-suppression rule, and commit-on-row-change are not unit tested — they are auth-gated and Radix-portal dependent. They get verified by dogfooding on the dev server (light **and** dark mode), the same split used for the hours daily-heatmap work.

**Dogfood checklist:**

1. Click a note cell → row opens, caret in the note field, no pencil involved.
2. Type, then click a time cell on a different row → first row saves silently, second opens. No wait, no toast.
3. Open the client dropdown on the active row → the row does **not** commit.
4. Edit two rows quickly → both land; no stacked toasts.
5. Clear the client on a row and click away → row goes red, stays open, other rows still editable.
6. Edit a row into a midnight crossing → red row with the server's "delete and re-log it" message.
7. Introduce an overlap → badge appears immediately on commit.
8. Click through three rows changing nothing → no network requests (verify in devtools).
9. Switch preset while a row is dirty → row commits, then the range refetches.

## Files

- `src/lib/hours/inline-edit.ts` — new, pure
- `src/lib/hours/inline-edit.test.ts` — new
- `src/components/hours/hours-tracker.tsx` — edit state, row rendering, mutation rewiring

No API route, query, or schema change. `src/app/api/hours/[id]/route.ts` is untouched; its `overlaps[]` response is simply ignored by the client.

## Out of scope

Multiple rows simultaneously in *editing* status (error rows only), undo/redo, arrow-key row navigation, tab-out-of-last-cell advancing to the next row, editing the Date column (moving an entry between days is a separate feature), and any change to delete confirmation.
