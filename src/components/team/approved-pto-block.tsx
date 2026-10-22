"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { todayKeyInZone } from "./holiday-block";

export type ApprovedPtoItem = {
  id: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  decidedAt: string | null;
  reason?: string;
  decisionNote?: string | null;
};

type ApprovedPtoResponse = {
  year: number;
  daysTaken: number;
  requests: ApprovedPtoItem[];
};

/** Split approved PTO into past (end ≤ today) vs future (start > today).
 * In-progress ranges (start ≤ today ≤ end) count as enjoyed. */
export function partitionApprovedPto(
  requests: ApprovedPtoItem[],
  todayKey: string
): { enjoyed: ApprovedPtoItem[]; upcoming: ApprovedPtoItem[] } {
  const enjoyed: ApprovedPtoItem[] = [];
  const upcoming: ApprovedPtoItem[] = [];
  for (const r of requests) {
    if (r.startDate > todayKey) upcoming.push(r);
    else enjoyed.push(r);
  }
  return { enjoyed, upcoming };
}

function formatRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function PtoList({
  items,
  showPrivate,
}: {
  items: ApprovedPtoItem[];
  showPrivate: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li
          key={r.id}
          className="rounded-lg border border-border/40 px-3 py-2 text-sm"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium tabular-nums">
              {formatRange(r.startDate, r.endDate)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {r.workingDays} day{r.workingDays === 1 ? "" : "s"}
            </span>
          </div>
          {showPrivate && r.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
          ) : null}
          {showPrivate && r.decisionNote ? (
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              Note: {r.decisionNote}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ApprovedPtoBlock({
  userId,
  year,
  residenceTimezone,
  showPrivate,
}: {
  userId: string;
  year: number;
  residenceTimezone: string | null;
  /** Reason + decision note — self or admin only. */
  showPrivate: boolean;
}) {
  const { data, isLoading, isError, error } = useQuery<ApprovedPtoResponse>({
    queryKey: ["team-time-off", userId, year],
    queryFn: async () => {
      const res = await fetch(`/api/team/${userId}/time-off?year=${year}`);
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Failed to load approved time off" }));
        throw new Error(body.error ?? "Failed to load approved time off");
      }
      return res.json();
    },
  });

  const requests = useMemo(() => data?.requests ?? [], [data]);
  const daysTaken = data?.daysTaken ?? 0;
  const todayKey = todayKeyInZone(residenceTimezone);
  const { enjoyed, upcoming } = useMemo(
    () => partitionApprovedPto(requests, todayKey),
    [requests, todayKey]
  );

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">
          Approved time off
        </span>
        <span className="text-xs text-muted-foreground">
          <strong className="tabular-nums text-foreground">{daysTaken}</strong>{" "}
          day{daysTaken === 1 ? "" : "s"} taken in {year}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading approved time off…</p>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load approved time off: {error?.message ?? "unknown error"}.
        </p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approved time-off requests with a start date in {year}.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand">
              Upcoming{" "}
              <span className="tabular-nums">{upcoming.length}</span>
            </p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">None scheduled.</p>
            ) : (
              <PtoList items={upcoming} showPrivate={showPrivate} />
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand">
              Enjoyed{" "}
              <span className="tabular-nums">{enjoyed.length}</span>
            </p>
            {enjoyed.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet this year.</p>
            ) : (
              <PtoList items={enjoyed} showPrivate={showPrivate} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
