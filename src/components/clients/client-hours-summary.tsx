"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Summary = { hours: number; monthlyEstimate: number | null; byDepartment: { department: string; hours: number }[] };

/** Hours logged on this client this month vs. its monthly Estimated Hours (AAC). */
export function ClientHoursSummary({ clientIdCode }: { clientIdCode: string }) {
  const { data } = useQuery<Summary>({
    queryKey: ["client-hours-summary", clientIdCode],
    queryFn: async () => (await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/hours-summary`)).json(),
    staleTime: 60_000,
  });
  if (!data) return null;
  const pct = data.monthlyEstimate ? Math.round((data.hours / data.monthlyEstimate) * 100) : null;
  return (
    <div className="w-full space-y-2 sm:w-80">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Hours this month</p>
        <Link href="/hours" className="text-xs font-medium text-brand hover:text-brand-hover">
          Log time
        </Link>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", pct != null && pct > 100 && "text-red-500")}>{data.hours.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">
          {data.monthlyEstimate != null ? `of ${data.monthlyEstimate} estimated` : "no monthly estimate in AAC"}
        </span>
      </div>
      {pct != null && (
        <div className="h-1.5 rounded-full bg-muted">
          <div className={cn("h-1.5 rounded-full", pct > 100 ? "bg-red-500" : "bg-brand")} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
      {data.byDepartment.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {data.byDepartment.slice(0, 5).map((d) => (
            <li key={d.department} className="flex justify-between">
              <span className="text-muted-foreground">{d.department}</span>
              <span className="tabular-nums">{d.hours.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
