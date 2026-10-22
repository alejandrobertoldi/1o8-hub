"use client";

import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TeamUserPayload } from "./user-detail";

type PayPeriod = NonNullable<TeamUserPayload["pay"]>[number];

const CONTRACT_TYPES = ["hourly", "salaried", "contractor"] as const;
const RATE_PERIODS = ["hour", "month", "year"] as const;

const EMPTY = {
  effectiveFrom: "",
  effectiveTo: "",
  contractType: "hourly" as (typeof CONTRACT_TYPES)[number],
  rateAmount: "",
  rateCurrency: "EUR",
  ratePeriod: "hour" as (typeof RATE_PERIODS)[number],
  note: "",
};

export function FinancialBlock({
  userId,
  pay,
  canEdit,
}: {
  userId: string;
  pay: PayPeriod[];
  /**
   * `access.isSuperAdmin`, passed explicitly. Owners may READ pay history
   * (section is shown when the GET payload includes `pay`); only a
   * super-admin may write. Never derived from "the payload arrived".
   */
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  // Which row is awaiting its "yes, really" confirmation. Deleting a financial
  // record is destructive, so it is never one click.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team/${userId}/pay-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // An empty end date means "currently in force", which is NULL.
          effectiveTo: form.effectiveTo || null,
          note: form.note || null,
        }),
      });
      if (!res.ok) {
        // 409 carries the readable overlap message from either the overlaps()
        // pre-check or SQLSTATE 23P01. Show it verbatim.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      setForm({ ...EMPTY });
      setOpen(false);
      toast.success("Pay period added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * DELETE, and deliberately NO edit dialog: a mistyped or superseded period is
   * corrected by deleting it and adding a replacement, and both halves are
   * audited (`user:pay-period:delete` then `user:pay-period:create`).
   *
   * This is also what unblocks the card. The create form defaults to a blank
   * end date, so the first row is open-ended, and every later "Add pay period"
   * then 409s against the in-memory overlap pre-check and the
   * `user_pay_periods_no_overlap` EXCLUDE constraint behind it. Without a way
   * to remove that row the card is permanently stuck at one period.
   *
   * The route takes NO body, so it cannot trip any writable-key gate. It
   * inspects the DELETE's `.returning()` and answers 404 when nothing matched,
   * so a stale row id now lands in onError instead of reporting a success that
   * never happened. Both paths invalidate: the table is reconciled with the
   * server whether the row was deleted or was already gone.
   */
  const remove = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch(`/api/team/${userId}/pay-periods/${periodId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(error ?? "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      setConfirmDelete(null);
      toast.success("Pay period deleted");
    },
    onError: (err: Error) => {
      // Now reachable: a stale row id 404s where it used to 200 silently.
      // Refetch and close the inline confirm on the way out, otherwise the
      // "Delete? / Yes, delete" step stays open on a row the server no longer
      // has and the only escape is a manual page reload.
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      setConfirmDelete(null);
      toast.error(err.message);
    },
  });

  // effectiveTo === null is the definition of "in force" (spec §3.3).
  const current = pay.find((p) => p.effectiveTo === null) ?? null;

  return (
    <div className="space-y-3">
      {current ? (
        <div className="rounded-lg border border-brand/40 bg-brand/10 p-3">
          <p className="text-[10px] font-bold uppercase text-brand">In force</p>
          <p className="text-sm font-bold tabular-nums">
            {current.rateAmount} {current.rateCurrency} / {current.ratePeriod}
          </p>
          <p className="text-xs text-muted-foreground">
            {current.contractType} · since {current.effectiveFrom}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No pay period is currently in force.</p>
      )}

      {pay.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase text-muted-foreground">
              <th className="py-1">From</th>
              <th className="py-1">To</th>
              <th className="py-1">Contract</th>
              <th className="py-1 text-right">Rate</th>
              <th className="py-1 text-right">Remove</th>
            </tr>
          </thead>
          <tbody>
            {pay.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t border-border">
                  <td className="py-1 tabular-nums">{p.effectiveFrom}</td>
                  <td className="py-1 tabular-nums">{p.effectiveTo ?? "ongoing"}</td>
                  <td className="py-1">{p.contractType}</td>
                  <td className="py-1 text-right tabular-nums">
                    {/* numeric(12,2) is a STRING all the way to the DOM. */}
                    {p.rateAmount} {p.rateCurrency}/{p.ratePeriod}
                  </td>
                  <td className="py-1 text-right">
                    {canEdit &&
                      (confirmDelete === p.id ? (
                        // Two-step confirm in place, rather than a second modal.
                        <span className="flex items-center justify-end gap-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            Delete?
                          </span>
                          <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(p.id)}
                            className="rounded-lg border border-red-300 px-2 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            {remove.isPending ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="rounded-lg border border-stone-300 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(p.id)}
                          aria-label={`Delete the pay period starting ${p.effectiveFrom}`}
                          className="text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ))}
                  </td>
                </tr>
                {/* Subordinate to the figures above it, never a headline value
                    — and corrections are DELETE + re-POST, so this is the only
                    place a period's note is ever readable again. */}
                {p.note && (
                  <tr>
                    <td colSpan={5} className="pb-1.5 pt-0 text-[10px] text-muted-foreground">
                      {p.note}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
        >
          Add pay period
        </button>
      )}

      {open &&
        createPortal(
        // Multi-field, so a dialog rather than inline edit-in-place (spec §5).
        // Portaled to document.body: mounted inside this card, `position:
        // fixed` would otherwise size itself to the card, not the viewport,
        // because `animate-card-enter`'s `both` fill mode leaves a persisted
        // `transform` on the card after the animation ends, and a non-`none`
        // transform makes that ancestor the containing block for `fixed`
        // descendants.
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-bold">Add pay period</h3>
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Effective from
                </span>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Effective to (blank = ongoing)
                </span>
                <input
                  type="date"
                  value={form.effectiveTo}
                  onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Contract type
                </span>
                <select
                  value={form.contractType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contractType: e.target.value as (typeof CONTRACT_TYPES)[number],
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                >
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Rate
                  </span>
                  <input
                    inputMode="decimal"
                    value={form.rateAmount}
                    onChange={(e) => setForm({ ...form, rateAmount: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 tabular-nums focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block w-20">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Currency
                  </span>
                  <input
                    maxLength={3}
                    value={form.rateCurrency}
                    onChange={(e) =>
                      setForm({ ...form, rateCurrency: e.target.value.toUpperCase() })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 uppercase focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block w-24">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Per
                  </span>
                  <select
                    value={form.ratePeriod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ratePeriod: e.target.value as (typeof RATE_PERIODS)[number],
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                  >
                    {RATE_PERIODS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Note
                </span>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate()}
                className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover disabled:opacity-60"
              >
                {create.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
        document.body
        )}
    </div>
  );
}
