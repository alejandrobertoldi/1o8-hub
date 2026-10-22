/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextResponse } from "next/server";
import { getReportClients } from "@/lib/report-clients";

export const maxDuration = 60;

const WORKERS = [
  "overview-cards",
  "overview-tables",
  "period-comparative",
  "inventory",
  "share-of-voice",
  "subscribe-save",
  "advertising-audit",
];

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

function startOfWeekSunday(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay());
  return out;
}

function computeRanges(now: Date) {
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentSunday = startOfWeekSunday(now);
  const currentSaturday = addDays(currentSunday, 6);
  const prevSunday = addDays(currentSunday, -7);
  const prevSaturday = addDays(prevSunday, 6);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return [
    { id: "mtd", start: fmt(mtdStart), end: fmt(now) },
    { id: "this-week", start: fmt(currentSunday), end: fmt(currentSaturday) },
    { id: "prev-week", start: fmt(prevSunday), end: fmt(prevSaturday) },
    { id: "last-month", start: fmt(lastMonthStart), end: fmt(lastMonthEnd) },
  ];
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const ranges = computeRanges(now);
  const clients = getReportClients();
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
    "x-cron-refresh": "true",
  };

  // Order Geography has its own cron (/api/cron/refresh-order-geography).
  const jobs = WORKERS.map((name) => ({ name, body: { ranges, clients } }));

  const t0 = Date.now();
  const settled = await Promise.allSettled(
    jobs.map(async (job) => {
      const workerStart = Date.now();
      const res = await fetch(`${baseUrl}/api/internal/refresh/${job.name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(job.body),
      });
      const data = res.ok ? await res.json() : { ok: 0, errors: 1 };
      return { name: job.name, status: res.ok ? "ok" : "error", durationMs: Date.now() - workerStart, ...data };
    }),
  );

  const workers = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return { name: jobs[i].name, status: "error", error: String(s.reason) };
  });

  return NextResponse.json({
    timestamp: now.toISOString(),
    durationMs: Date.now() - t0,
    ranges,
    workers,
  });
}
