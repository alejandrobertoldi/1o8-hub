"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import type { MyDashboardPayload } from "@/lib/my-dashboard/types";
import { HeaderStrip, type Focus } from "@/components/my-dashboard/header-strip";
import { TaskList } from "@/components/my-dashboard/task-list";
import { AlertsPanel } from "@/components/my-dashboard/alerts-panel";
import { AccountCards } from "@/components/my-dashboard/account-cards";
import { TaskCalendar } from "@/components/my-dashboard/task-calendar";
import { HubTasks } from "@/components/my-dashboard/hub-tasks";
import { ReviewsBox } from "@/components/my-dashboard/reviews-box";
import { ReadinessCard } from "@/components/my-dashboard/readiness-card";
import { splitBySource } from "@/lib/my-dashboard/group-tasks";

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const isFresh = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 3_600_000;

// Module-level so PageMetaSlot's effect doesn't re-publish on every render.
const PAGE_META = (
  <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
    <span className="font-bold text-sidebar-foreground">My</span><span className="font-normal text-brand">Dashboard</span>
  </h1>
);

function MyDashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const user = params.get("user");
  const [overdueNonce, setOverdueNonce] = useState(0);
  const [filterDate, setFilterDate] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["me-dashboard", user],
    queryFn: async (): Promise<MyDashboardPayload> => {
      const qs = new URLSearchParams({ today: localToday() });
      if (user) qs.set("user", user);
      const res = await fetch(`/api/me/dashboard?${qs}`, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <LoadingPlaceholder />;
  if (error || !data) return <p className="p-6 text-sm text-brand-red">Couldn&apos;t load your dashboard ({(error as Error)?.message ?? "no data"}).</p>;

  const syncFresh = isFresh(data.sync.lastSuccessAt);
  const split = data.tasks.data ? splitBySource(data.tasks.data) : null;
  const asanaTasks = split ? { data: split.asana, error: null } : data.tasks;
  const hubItems = split?.hub ?? [];
  const onFocus = (f: Focus) => {
    if (f === "overdue") setOverdueNonce((n) => n + 1);
    setFilterDate(null);
    const target = document.getElementById(f === "alerts" ? (data.reviews.data?.length ? "reviews" : "alerts") : `tasks-${f}`) ?? document.getElementById("my-tasks");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <HeaderStrip data={data} onFocus={onFocus} picker={data.staff && (
        <select value={data.person.id} onChange={(e) => router.push(e.target.value === data.viewer.id ? "/me" : `/me?user=${e.target.value}`)}
          className="w-64 rounded-md border bg-background px-2 py-1 text-sm" aria-label="View dashboard for">
          {!data.staff.some((s) => s.id === data.person.id) && <option value={data.person.id}>{data.person.name ?? data.person.email}</option>}
          {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
        </select>
      )} />
      <ReviewsBox reviews={data.reviews} asanaUrl={data.reviewsAsanaUrl} />
      <ReadinessCard userId={data.person.id} />
      <TaskCalendar tasks={split ? Object.values(split.asana).flat() : []} today={data.today} selected={filterDate} onSelect={setFilterDate} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section id="my-tasks" className="rounded-lg border bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/asana_logo_horizontal_black.png" alt="" className="h-5 dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/asana_logo_horizontal_white.png" alt="" className="hidden h-5 dark:block" />
            My Tasks
          </h2>
          <TaskList tasks={asanaTasks} syncFresh={syncFresh} openNonce={overdueNonce} filterDate={filterDate} onClearFilter={() => setFilterDate(null)} />
        </section>
        <div className="flex flex-col gap-6">
          <section id="alerts" className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Alerts</h2>
            <AlertsPanel alerts={data.alerts} />
          </section>
          {hubItems.length > 0 && (
            <section id="hub-tasks" className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Hub tasks · {hubItems.length}</h2>
              <HubTasks items={hubItems} />
            </section>
          )}
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold">My accounts</h2>
        <AccountCards accounts={data.accounts} />
      </section>
    </div>
  );
}

export default function MyDashboardPage() {
  return (
    <>
      <PageMetaSlot>{PAGE_META}</PageMetaSlot>
      <Suspense fallback={<LoadingPlaceholder />}>
        <MyDashboardContent />
      </Suspense>
    </>
  );
}
