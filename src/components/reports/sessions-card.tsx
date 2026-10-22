"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

interface OverviewData {
  sessions: number;
  sessionsPY: number;
  sessionsYoY: number;
  sessionsYoYPct: number;
  mobileSessions: number;
  browserSessions: number;
  daily: { report_date: string; mobile_app_sessions: number | null; browser_session: number | null }[];
  dailyPY: { report_date: string; mobile_app_sessions: number | null; browser_session: number | null }[];
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] shadow-md">
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-2">
          <span className="text-gray-700">{item.name}</span>
          <span className="font-semibold text-black">{fmtInt(Number(item.value))}</span>
        </div>
      ))}
    </div>
  );
}

function SmallMetricBox({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-[#2C2B35] px-2.5 py-2">
      <div className="grid h-full grid-rows-[14px_1fr] text-center">
        <div className="text-[10px] leading-none font-semibold text-black">
          {title}
        </div>
        <div className="flex items-center justify-center">
          <div className="text-[25px] font-bold leading-none text-white whitespace-nowrap">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionsCard({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: OverviewData | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/overview?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (loading) {
    return <div className="h-[200px] rounded-lg border border-[#6f7275] bg-white animate-pulse" />;
  }
  if (!data) return null;

  const isPositive = data.sessionsYoY >= 0;

  const chartData = data.daily.map((d, i) => ({
    current: (d.mobile_app_sessions ?? 0) + (d.browser_session ?? 0),
    py: (data.dailyPY[i]?.mobile_app_sessions ?? 0) + (data.dailyPY[i]?.browser_session ?? 0),
  }));

  return (
    <div className="h-[200px] rounded-lg border border-[#6f7275] bg-white p-1 shadow-sm">
      <div className="grid h-full grid-cols-[0.95fr_1.05fr] gap-1">
        <div className="grid grid-rows-3 gap-1">
          <SmallMetricBox title="Sessions" value={fmtInt(data.sessions)} />
          <SmallMetricBox title="Sessions Mobile" value={fmtInt(data.mobileSessions)} />
          <SmallMetricBox title="Sessions Browser" value={fmtInt(data.browserSessions)} />
        </div>

        <div className="grid grid-rows-[82px_1fr] gap-1">
          <div className="rounded-md bg-[#3C4043] px-2.5 py-2">
            <div className="grid h-full grid-rows-[14px_1fr_auto] text-center">
              <div className="text-[10px] leading-none font-semibold text-[#F7BF1D]">
                Sessions PY
              </div>

              <div className="flex items-center justify-center">
                <div className="text-[16px] font-bold leading-none text-white whitespace-nowrap">
                  {fmtInt(data.sessionsPY)}
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                <span className={`rounded px-1.5 py-[1px] text-[8px] font-bold text-white ${isPositive ? "bg-green-600" : "bg-red-600"}`}>
                  {isPositive ? "▲" : "▼"} {fmtInt(Math.abs(data.sessionsYoY))}
                </span>
                <span className={`rounded px-1.5 py-[1px] text-[8px] font-bold text-white ${isPositive ? "bg-green-600" : "bg-red-600"}`}>
                  {isPositive ? "▲" : "▼"} {Math.abs(data.sessionsYoYPct).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md bg-white p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                <defs>
                  <linearGradient id="sessionsFillCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F7BF1D" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#F7BF1D" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="sessionsFillPY" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3C4043" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#3C4043" stopOpacity={0.03} />
                  </linearGradient>
                </defs>

                <Tooltip content={<CustomTooltip />} />

                <Area type="monotone" dataKey="current" name="Sessions" stroke="#F7BF1D" strokeWidth={0.75} fill="url(#sessionsFillCurrent)" dot={false} />
                <Area type="monotone" dataKey="py" name="Sessions PY" stroke="#3C4043" strokeWidth={0.75} fill="url(#sessionsFillPY)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
