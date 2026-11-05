"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3, Gauge } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { HoursDashboard } from "@/components/admin/hours-dashboard";
import { HoursInsightsTab } from "@/components/time-logs/hours-insights-tab";
import { hasPeopleAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "insights", label: "Capacity & budget", icon: Gauge },
] as const;

/**
 * Team-wide time analytics with export (from MarketFoundry's Admin Hours),
 * plus the former Hours Insights page as a tab: only what the main tab
 * doesn't show (capacity, compliance, hours vs estimate…). Admin and up.
 */
export default function HoursAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <HoursAnalytics />
    </Suspense>
  );
}

function HoursAnalytics() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "insights" ? "insights" : "analytics";

  if (status === "loading") return null;
  if (!hasPeopleAccess(session?.user?.role)) {
    return <div className="p-8 text-sm text-muted-foreground">You don&apos;t have access to hours analytics.</div>;
  }

  return (
    <div className="space-y-5">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Hours Analytics">
          <span className="font-bold text-sidebar-foreground">Hours</span>
          <span className="font-normal text-brand">Analytics</span>
        </h1>
      </PageMetaSlot>
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Hours analytics views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.replace(t.key === "analytics" ? "/hours/analytics" : `/hours/analytics?tab=${t.key}`, { scroll: false })}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === t.key ? "border-brand font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "analytics" ? <HoursDashboard /> : <HoursInsightsTab />}
    </div>
  );
}
