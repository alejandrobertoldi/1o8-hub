"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";
import { Card, fmt, h2, iso, periodRange } from "./hours-insights-tab";

/** Hours under a full week's 40 that still pass (40 − 5 = 35 h). */
const MARGIN_HOURS = 5;
/** Copied on every reminder: the leaders (owners) who asked for it. */
const LEADERS_CC = ["jake@1o8.agency", "aalap@1o8.agency"];

/**
 * Last week's logging check: everyone who logged under 35 h (expected −5;
 * holidays lower the bar), and a prepared reminder email — it opens in the
 * sender's Gmail with the people in To and the leaders in Cc, to send there.
 */
export function LastWeekCompliance() {
  const [from, to] = periodRange("Last week")!;
  const qs = new URLSearchParams({ from, to, today: iso(new Date()) }).toString();
  const { data, isLoading } = useQuery<TimeInsights>({
    queryKey: ["time-insights", "last-week", qs],
    queryFn: async () => {
      const res = await fetch(`/api/time-logs/insights?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load last week");
      return json;
    },
  });

  const short = useMemo(
    () =>
      (data?.compliance ?? [])
        .filter((c) => c.expectedHours > 0 && c.hoursLogged < c.expectedHours - MARGIN_HOURS)
        .sort((a, b) => a.hoursLogged - b.hoursLogged),
    [data],
  );
  // Owners are left out of the reminder by default (they get it in Cc); anyone can be ticked or unticked.
  const [unticked, setUnticked] = useState<Set<string> | null>(null);
  const off = unticked ?? new Set(short.filter((c) => c.role === "owner").map((c) => c.userId));
  const picked = short.filter((c) => !off.has(c.userId) && c.email);
  const tick = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUnticked(next);
  };

  const week = `${fmt(from).replace(/, \d{4}$/, "")} – ${fmt(to)}`;
  const gmailUrl = () => {
    const subject = `Reminder: please log your hours for last week (${week})`;
    const body = [
      "Hi team,",
      "",
      `This is a quick reminder to log your hours in the 1o8 Hub. Our records show fewer than ${40 - MARGIN_HOURS} hours logged for you last week (${week}).`,
      "",
      "Logging time accurately and every day really matters. It is how we:",
      "- see each client's real workload against what they pay for,",
      "- plan capacity and staffing so nobody is overloaded,",
      "- and make sure the work we deliver is reflected in what we bill.",
      "",
      "Please add any missing hours for last week as soon as possible (by end of day tomorrow at the latest). Remember to log PTO and holidays as Time Off so your week adds up.",
      "",
      `Log your time here: ${window.location.origin}/hours`,
      "",
      "Thank you!",
    ].join("\n");
    const p = new URLSearchParams({ view: "cm", fs: "1", to: picked.map((c) => c.email).join(","), cc: LEADERS_CC.join(","), su: subject, body });
    return `https://mail.google.com/mail/?${p.toString()}`;
  };

  return (
    <Card
      title={`Last week · under ${40 - MARGIN_HOURS} h`}
      subtitle={`${week}. Everyone who logged less than their expected hours minus ${MARGIN_HOURS} (35 h on a full week; holidays lower it). Tick who gets the reminder.`}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading last week…</p>
      ) : !short.length ? (
        <p className="text-sm text-muted-foreground">Everyone logged at least {40 - MARGIN_HOURS} h last week. 🎉</p>
      ) : (
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5">Employee</th>
                <th className="px-2 py-1.5 text-right">Logged</th>
                <th className="px-2 py-1.5 text-right">Expected</th>
                <th className="px-2 py-1.5 text-right">Missing</th>
                <th className="px-2 py-1.5 text-right">Days under 8 h</th>
              </tr>
            </thead>
            <tbody>
              {short.map((c) => (
                <tr key={c.userId} className={cn("border-t border-border/40", off.has(c.userId) && "opacity-50")}>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={!off.has(c.userId)} onChange={() => tick(c.userId)} disabled={!c.email} className="accent-[var(--brand)]" aria-label={`Send the reminder to ${c.name}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    {c.name}
                    {c.role === "owner" && <span className="ml-1.5 text-[10px] text-muted-foreground">owner</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-red-500">{h2(c.hoursLogged)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h2(c.expectedHours)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h2(c.gap)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.workdaysUnderMinimum}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={picked.length ? gmailUrl() : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!picked.length}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground",
                !picked.length && "pointer-events-none opacity-50",
              )}
            >
              <Mail className="size-3.5" /> Email reminder to {picked.length} {picked.length === 1 ? "person" : "people"}
            </a>
            <span className="text-xs text-muted-foreground">Opens a ready-to-send email in your Gmail · Cc Jake and Aalap. Review it and press Send there.</span>
          </div>
        </div>
      )}
    </Card>
  );
}
