"use client";
import { FileCheck } from "lucide-react";
import type { ReviewItem, Section } from "@/lib/my-dashboard/types";

/** Monthly reports waiting on this person's review — always shown, with an empty state. */
export function ReviewsBox({ reviews, asanaUrl }: { reviews: Section<ReviewItem[]>; asanaUrl?: string | null }) {
  if (reviews.error) {
    return (
      <section id="reviews" className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Reports to review</h2>
        <p className="text-sm text-brand-red">Couldn&apos;t load monthly reports: {reviews.error}</p>
      </section>
    );
  }
  const items = reviews.data ?? [];
  return (
    <section id="reviews" className={`rounded-lg border bg-card p-4 ${items.length ? "border-brand/40" : ""}`}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <FileCheck className={`size-4 ${items.length ? "text-brand" : "text-muted-foreground"}`} aria-hidden />
        Reports to review · {items.length}
        {asanaUrl && <a href={asanaUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand hover:underline">Open in Asana</a>}
      </h2>
      {!items.length && <p className="text-sm text-muted-foreground">No monthly reports waiting on you.</p>}
      <ul className="divide-y">
        {items.map((r) => (
          <li key={r.id}>
            <a href={r.url} className="flex items-center gap-2 py-2 text-sm hover:underline">
              <span className="min-w-0 flex-1 truncate">{r.clientName} — {r.periodLabel} monthly report</span>
              <span className="rounded border px-1.5 font-mono text-[11px]">{r.clientIdCode}</span>
              <span className="rounded bg-brand-solid px-1.5 text-[11px] text-white">{r.stageLabel}</span>
              <span className={`w-20 text-right text-xs tabular-nums ${r.waitingDays >= 3 ? "text-brand-red" : "text-muted-foreground"}`}>
                {r.waitingDays === 0 ? "today" : `${r.waitingDays}d waiting`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
