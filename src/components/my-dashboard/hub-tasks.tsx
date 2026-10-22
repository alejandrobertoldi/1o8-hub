"use client";
import { useState } from "react";
import type { DashTask } from "@/lib/my-dashboard/types";

/** Rows shown before the "Show all" toggle — one person can hold dozens of pending onboarding steps. */
const PREVIEW_COUNT = 8;

/** Hub-side work assigned to the person (onboarding steps) — kept apart from the Asana box. */
export function HubTasks({ items }: { items: DashTask[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PREVIEW_COUNT);
  return (
    <div>
      <ul className="divide-y">
        {visible.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
            <a href={t.url} className="min-w-0 flex-1 truncate hover:underline">{t.title}</a>
            {t.clientIdCode && <span className="rounded border px-1.5 font-mono text-[11px]">{t.clientIdCode}</span>}
            {t.status && <span className="hidden max-w-32 truncate text-xs text-muted-foreground md:inline">{t.status}</span>}
          </li>
        ))}
      </ul>
      {items.length > PREVIEW_COUNT && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-xs text-brand hover:underline" aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
