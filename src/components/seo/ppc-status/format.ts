import type { DateWindow, WindowDays } from "@/lib/seo/ppc-status";

export function blockWindowLabel(
  windows: { before: DateWindow | null; after: DateWindow | null },
  n: WindowDays,
  liveDate: string,
  status: "live" | "future",
): string {
  if (status === "future" || !windows.before || !windows.after) return `Goes live on ${liveDate}`;
  if (windows.after.days === 0) return "Live today — no after-window yet";
  const { before, after } = windows;
  return `Before ${before.start} → ${before.end.slice(5)} · After ${after.start.slice(5)} → ${after.end.slice(5)} (${n} days)`;
}

export function fmtDelta(before: number | null, after: number | null): string {
  if (before == null || after == null) return "—";
  if (before === 0) return after === 0 ? "—" : "new";
  const pct = Math.round(((after - before) / before) * 100);
  return pct >= 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtAvg(n: number): string {
  if (n === 0) return "0";
  if (n < 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 10) return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return Math.round(n).toLocaleString("en-US");
}
