"use client";

import { buildCompanyScale } from "@/lib/team/departments";

const CARD =
  "rounded-[18px] border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md " +
  "transition-all card-glow animate-card-enter dark:border-zinc-800 dark:hover:border-zinc-700";

export function CompanyScaleChart({
  members,
}: {
  members: { departments: string[] }[];
}) {
  const scale = buildCompanyScale(members);
  const max = Math.max(1, ...scale.rows.map((r) => r.count));

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-brand">
        Company Scale
      </h2>
      <p className="text-4xl font-bold tracking-tighter tabular-nums leading-none">
        {scale.total}
        <span className="ml-2 text-sm font-normal tracking-normal text-muted-foreground">
          {scale.total === 1 ? "assignment" : "assignments"}
        </span>
      </p>
      {scale.rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No active team members.</p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {scale.rows.map((row) => {
            const pct = Math.round((row.count / max) * 100);
            return (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(7rem,9.5rem)_1fr_2rem] items-center gap-3"
              >
                <span className="truncate text-[10px] font-bold uppercase text-muted-foreground">
                  {row.label}
                </span>
                <div
                  className="h-2 rounded-full bg-stone-200 dark:bg-zinc-800"
                  role="meter"
                  aria-label={`${row.label} headcount`}
                  aria-valuenow={row.count}
                  aria-valuemin={0}
                  aria-valuemax={scale.total}
                >
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: row.color }}
                  />
                </div>
                <span className="text-right text-sm tabular-nums">{row.count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
