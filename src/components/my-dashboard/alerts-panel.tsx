"use client";
import { useState } from "react";
import type { DashAlert, Section } from "@/lib/my-dashboard/types";
const DOT = { critical: "bg-brand-red", warning: "bg-orange-500", info: "bg-muted-foreground" } as const;
const SHOWN = 8;

export function AlertsPanel({ alerts }: { alerts: Section<DashAlert[]> }) {
  const [all, setAll] = useState(false);
  if (alerts.error) return <p className="text-sm text-brand-red">Couldn&apos;t load alerts: {alerts.error}</p>;
  if (!alerts.data!.length) return <p className="text-sm text-muted-foreground">No alerts. Go Lives, late tasks and your clients are on track.</p>;
  const list = all ? alerts.data! : alerts.data!.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {list.map((a, i) => (
          <li key={`${a.kind}-${a.clientIdCode}-${i}`} className="flex gap-2 text-sm">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[a.severity]}`} />
            <a href={a.url} className="hover:underline" {...(a.url.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
              {a.clientIdCode && <span className="mr-1 font-mono text-xs">{a.clientIdCode}</span>}{a.message}
            </a>
          </li>
        ))}
      </ul>
      {alerts.data!.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-xs text-brand hover:underline">
          {all ? "Show fewer" : `Show all ${alerts.data!.length}`}
        </button>
      )}
    </div>
  );
}
