/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { effectivePhase } from "@/lib/seo/post-s6-phases";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarCircle } from "@/components/seo/avatar-circle";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ─────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  review_approved?: boolean;
  pushed?: boolean;
  current_phase: string;
  client_id_code: string | null;
  created_by: string;
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_image: string | null;
  created_at: string;
  updated_at: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
  linked_product_id: string | null;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const PHASES = [
  { code: "S1", label: "Intake", route: "intake" },
  { code: "S2", label: "Keywords", route: "keywords" },
  { code: "S3", label: "Reviews", route: "reviews" },
  { code: "S4", label: "Alexa for Shopping", route: "rufus" },
  { code: "S5", label: "COSMO", route: "cosmo" },
  { code: "S6", label: "Content", route: "seo" },
];

// Funnel / activity labels include the derived S7 / S8 (they live on the S6 page)
const FLOW_PHASES = [...PHASES, { code: "S7", label: "Review & Share", route: "seo" }, { code: "S8", label: "Push Content", route: "seo" }];

const phaseRouteMap: Record<string, string> = {
  S1: "intake",
  S2: "keywords",
  S3: "reviews",
  S4: "rufus",
  S5: "cosmo",
  S6: "seo",
};

// ── Helpers ───────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  );
}

function daysSince(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function lastActivityDate(p: ProjectSummary): string {
  const approvals = [
    p.s1_approved_at, p.s2_approved_at, p.s3_approved_at,
    p.s4_approved_at, p.s5_approved_at, p.s6_approved_at,
  ].filter(Boolean) as string[];
  if (approvals.length === 0) return p.created_at;
  return approvals.reduce((latest, t) =>
    new Date(t) > new Date(latest) ? t : latest
  );
}

function approvedPhaseCount(p: ProjectSummary): number {
  let count = 0;
  if (p.s1_approved_at) count++;
  if (p.s2_approved_at) count++;
  if (p.s3_approved_at) count++;
  if (p.s4_approved_at) count++;
  if (p.s5_approved_at) count++;
  if (p.s6_approved_at) count++;
  if (p.review_approved) count++; // S7 Review & Share
  if (p.pushed) count++; // S8 Push Content
  return count;
}

function uniqueAsins(projects: ProjectSummary[]): number {
  const linked = new Set<string>();
  for (const p of projects) {
    if (p.linked_product_id) linked.add(p.linked_product_id);
  }
  return linked.size;
}

// ── Skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-stone-200 dark:bg-zinc-800 rounded-xl ${className}`}
    />
  );
}

// ── Metric Card ───────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  progress,
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  progress?: number;
  delay?: number;
}) {
  return (
    <div
      className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tighter text-foreground font-[family-name:var(--font-outfit)]">
        {value}
      </p>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      {sub && (
        <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
      )}
    </div>
  );
}

// ── Phase Funnel Bar ──────────────────────────────────────────────────

function PhaseFunnel({ projects }: { projects: ProjectSummary[] }) {
  const phaseCounts: Record<string, number> = {};
  let completedCount = 0;

  for (const phase of FLOW_PHASES) {
    phaseCounts[phase.code] = 0;
  }

  for (const p of projects) {
    const phase = effectivePhase(p);
    if (p.status === "completed" || p.status === "live") {
      completedCount++;
    } else if (p.status !== "archived" && p.status !== "deprecated" && phaseCounts[phase] !== undefined) {
      phaseCounts[phase]++;
    }
  }

  const maxCount = Math.max(
    ...Object.values(phaseCounts),
    completedCount,
    1
  );

  const rows = [
    ...FLOW_PHASES.map((ph) => ({
      label: `${ph.code} ${ph.label}`,
      count: phaseCounts[ph.code],
      color: "bg-brand",
    })),
    {
      label: "Completed",
      count: completedCount,
      color: "bg-emerald-500",
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground w-28 shrink-0 text-right">
            {row.label}
          </span>
          <div className="flex-1 h-6 rounded bg-stone-100 dark:bg-zinc-800/60 overflow-hidden relative">
            <div
              className={`h-full rounded ${row.color} transition-all duration-700`}
              style={{
                width: row.count > 0 ? `${(row.count / maxCount) * 100}%` : "0%",
              }}
            />
            {row.count > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-foreground/70">
                {row.count}
              </span>
            )}
          </div>
          {row.count === 0 && (
            <span className="text-xs text-muted-foreground/40 w-6">0</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Client Health Card ────────────────────────────────────────────────

function ClientHealthCard({
  clientCode,
  clientName,
  projects,
  delay,
}: {
  clientCode: string;
  clientName: string;
  projects: ProjectSummary[];
  delay: number;
}) {
  const router = useRouter();
  const totalPhases = projects.length * 8; // S1–S6 + S7 Review & Share + S8 Push
  const approvedTotal = projects.reduce(
    (sum, p) => sum + approvedPhaseCount(p),
    0
  );
  const pct = totalPhases > 0 ? Math.round((approvedTotal / totalPhases) * 100) : 0;

  const barColor =
    pct > 75
      ? "bg-emerald-500"
      : pct >= 25
        ? "bg-amber-500"
        : "bg-red-500";

  // Phase breakdown
  const phaseBreakdown = PHASES.map((ph) => {
    const approved = projects.filter((p) => {
      const key = `${ph.code.toLowerCase()}_approved_at` as keyof ProjectSummary;
      return !!p[key];
    }).length;
    return { code: ph.code, approved, total: projects.length };
  }).concat(
    { code: "S7", approved: projects.filter((p) => p.review_approved).length, total: projects.length },
    { code: "S8", approved: projects.filter((p) => p.pushed).length, total: projects.length },
  );

  return (
    <div
      className="rounded-xl border border-stone-200 bg-card p-5 cursor-pointer hover:border-stone-300 hover:shadow-md transition-all dark:border-zinc-800 dark:hover:border-zinc-700 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => router.push(`/seo/clients/${clientCode}`)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground truncate font-[family-name:var(--font-outfit)]">
          {clientName}
        </h3>
        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">{pct}% phases approved</p>

      {/* Phase breakdown */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {phaseBreakdown.map((pb) => (
          <span
            key={pb.code}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
              pb.approved === pb.total && pb.total > 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                : pb.approved > 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  : "bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-500"
            }`}
          >
            {pb.code}:{pb.approved}/{pb.total}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Activity Item ─────────────────────────────────────────────────────

function buildActivity(projects: ProjectSummary[]): {
  type: "approval" | "export";
  description: string;
  time: string;
}[] {
  const items: { type: "approval" | "export"; description: string; time: string }[] = [];

  for (const p of projects) {
    const phases = [
      { code: "S1", label: "Intake", at: p.s1_approved_at },
      { code: "S2", label: "Keywords", at: p.s2_approved_at },
      { code: "S3", label: "Reviews", at: p.s3_approved_at },
      { code: "S4", label: "Alexa for Shopping", at: p.s4_approved_at },
      { code: "S5", label: "COSMO", at: p.s5_approved_at },
      { code: "S6", label: "Content", at: p.s6_approved_at },
    ];

    for (const ph of phases) {
      if (ph.at) {
        items.push({
          type: "approval",
          description: `${p.assignee_name || "Someone"} approved ${ph.code} ${ph.label} for ${p.brand_name || p.name}`,
          time: ph.at,
        });
      }
    }
  }

  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return items.slice(0, 12);
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function SEODashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [activeCodes, setActiveCodes] = useState<Set<string> | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);

  const loading = !projectsLoaded;

  useEffect(() => {
    // Fetch independently so partial data renders as it arrives
    fetch("/api/seo/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));

    fetch("/api/seo/team")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTeam)
      .catch(() => {});

    fetch("/api/clients/list")
      .then((r) => (r.ok ? r.json() : []))
      .then(setClients)
      .catch(() => {});

    // Client Health shows Active clients only (until this loads, or if it fails, show all)
    fetch("/api/clients/list?status=Active")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Array<{ clientIdCode: string }> | null) => { if (Array.isArray(rows)) setActiveCodes(new Set(rows.map((c) => c.clientIdCode))); })
      .catch(() => {});
  }, []);

  // Client name lookup
  const clientNameMap = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.clientIdCode, c.clientName])),
    [clients]
  );

  // Filter by selected assignee
  const filtered = useMemo(() => {
    if (!selectedAssignee) return projects;
    return projects.filter((p) => p.assigned_to === selectedAssignee);
  }, [projects, selectedAssignee]);

  // ── Computed metrics ──────────────────────────────────────────────

  const activeProjects = filtered.filter(
    (p) =>
      p.status !== "completed" &&
      p.status !== "live" &&
      p.status !== "archived" &&
      p.status !== "deprecated",
  );
  const completedProjects = filtered.filter(
    (p) => p.status === "completed" || p.status === "live",
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedThisMonth = completedProjects.filter(
    (p) => new Date(p.updated_at) >= monthStart
  ).length;

  const avgProgress = useMemo(() => {
    if (filtered.length === 0) return 0;
    const total = filtered.reduce(
      (sum, p) => sum + approvedPhaseCount(p),
      0
    );
    return Math.round((total / (filtered.length * 6)) * 100);
  }, [filtered]);

  const asinsOptimized = uniqueAsins(
    filtered.filter((p) => p.status === "completed" || p.status === "live"),
  );

  // Real export count from enriched API response
  const exportsSent = filtered.reduce((sum, p) => {
    const info = (p as any).export_info;
    return sum + (info?.export_count || 0);
  }, 0);

  // Team workload
  const teamWorkload = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      if (p.assigned_to) {
        counts[p.assigned_to] = (counts[p.assigned_to] || 0) + 1;
      }
    }
    return team
      .map((m) => ({ ...m, projectCount: counts[m.id] || 0 }))
      .filter((m) => m.projectCount > 0)
      .sort((a, b) => b.projectCount - a.projectCount);
  }, [team, projects]);

  // Stale projects: idle 7+ days based on most recent phase approval (or created_at if none)
  const staleProjects = useMemo(() => {
    return filtered
      .filter(
        (p) =>
          p.status !== "completed" &&
          p.status !== "live" &&
          p.status !== "archived" &&
          p.status !== "deprecated" &&
          daysSince(lastActivityDate(p)) >= 7,
      )
      .sort((a, b) => daysSince(lastActivityDate(b)) - daysSince(lastActivityDate(a)));
  }, [filtered]);

  // Client-grouped projects for health cards
  const clientGroups = useMemo(() => {
    const groups: Record<string, ProjectSummary[]> = {};
    for (const p of filtered) {
      if (p.client_id_code && (!activeCodes || activeCodes.has(p.client_id_code))) {
        if (!groups[p.client_id_code]) groups[p.client_id_code] = [];
        groups[p.client_id_code].push(p);
      }
    }
    return Object.entries(groups).sort((a, b) =>
      (clientNameMap[a[0]] || a[0]).localeCompare(clientNameMap[b[0]] || b[0])
    );
  }, [filtered, clientNameMap, activeCodes]);

  // Activity feed
  const activity = useMemo(() => buildActivity(filtered), [filtered]);

  // Recently completed
  const recentlyCompleted = useMemo(() => {
    return completedProjects
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .slice(0, 8);
  }, [completedProjects]);

  // Selected assignee info
  const selectedMember = team.find((m) => m.id === selectedAssignee);

  // ── Render ────────────────────────────────────────────────────────

  // Empty state
  if (!loading && projects.length === 0) {
    return (
      <div>
        <PageMetaSlot>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="SEO Projects"
          >
            <span className="font-bold text-sidebar-foreground">SEO</span>
            <span className="font-normal text-brand">Projects</span>
          </h1>
        </PageMetaSlot>
        <div className="text-center py-20">
          <p className="text-muted-foreground text-sm mb-3">
            No SEO projects yet.
          </p>
          <Link
            href="/seo/manager"
            className="text-brand hover:text-brand-hover underline text-sm font-medium"
          >
            Create your first project in SEO Manager
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="SEO Projects"
        >
          <span className="font-bold text-sidebar-foreground">SEO</span>
          <span className="font-normal text-brand">Projects</span>
        </h1>
        <div className="ml-4">
          <Link
            href="/seo/manager"
            className="rounded-lg bg-brand-solid px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)] shrink-0"
          >
            Go to Manager &rarr;
          </Link>
        </div>
      </PageMetaSlot>

      {/* Filter indicator */}
      {selectedAssignee && selectedMember && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 animate-card-enter">
          <AvatarCircle
            name={selectedMember.name}
            image={selectedMember.image}
            size={20}
          />
          <span className="text-xs font-medium text-foreground">
            Filtering by{" "}
            <span className="font-bold">
              {selectedMember.name || selectedMember.email}
            </span>
          </span>
          <button
            onClick={() => setSelectedAssignee(null)}
            className="ml-auto text-[10px] font-bold text-brand hover:text-brand-hover underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* ── 2. Hero Metrics Row ────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <MetricCard
            label="Active Projects"
            value={activeProjects.length}
            delay={0}
          />
          <MetricCard
            label="Completed This Month"
            value={completedThisMonth}
            delay={60}
          />
          <MetricCard
            label="Avg Progress"
            value={`${avgProgress}%`}
            progress={avgProgress}
            delay={120}
          />
          <MetricCard
            label="ASINs Optimized"
            value={asinsOptimized}
            delay={180}
          />
          <MetricCard
            label="Exports Sent"
            value={exportsSent}
            delay={240}
          />
        </div>
      )}

      {/* ── 3. Team Workload Strip ─────────────────────────────────── */}
      {!loading && teamWorkload.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Team Workload
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {teamWorkload.map((member) => {
              const isActive = selectedAssignee === member.id;
              return (
                <button
                  key={member.id}
                  onClick={() =>
                    setSelectedAssignee(isActive ? null : member.id)
                  }
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
                    isActive
                      ? "border-brand bg-brand/10 shadow-[0_0_12px_-4px_var(--brand-glow)]"
                      : "border-stone-200 bg-card hover:border-stone-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                >
                  <AvatarCircle
                    name={member.name}
                    image={member.image}
                    size={22}
                  />
                  <span className="text-xs font-medium text-foreground">
                    {(member.name || member.email).split(" ")[0]}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {member.projectCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Phase Funnel ────────────────────────────────────────── */}
      {loading ? (
        <Skeleton className="h-52 mb-8" />
      ) : (
        <div className="mb-8">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Phase Funnel
          </p>
          <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800">
            <PhaseFunnel projects={filtered} />
          </div>
        </div>
      )}

      {/* ── 5. Client Health Cards ─────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : clientGroups.length > 0 ? (
        <div className="mb-8">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Client Health
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {clientGroups.map(([code, prjs], index) => (
              <ClientHealthCard
                key={code}
                clientCode={code}
                clientName={clientNameMap[code] || code}
                projects={prjs}
                delay={index * 60}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── 6. Bottom Row: Activity + Recently Completed ───────────── */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Activity Feed */}
          {activity.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800 animate-card-enter">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Recent Activity
              </p>
              <div className="space-y-2.5">
                {activity.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 size-5 rounded-full flex items-center justify-center shrink-0 ${
                        item.type === "approval"
                          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                      }`}
                    >
                      {item.type === "approval" ? (
                        <svg
                          className="size-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="size-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground leading-snug">
                        {item.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {relativeTime(item.time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently Completed */}
          {recentlyCompleted.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800 animate-card-enter">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Recently Completed
              </p>
              <div className="space-y-2.5">
                {recentlyCompleted.map((p) => (
                  <div key={p.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 size-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 dark:bg-emerald-500/20 dark:text-emerald-400">
                      <svg
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.client_id_code
                          ? clientNameMap[p.client_id_code] || p.client_id_code
                          : "No client"}{" "}
                        &middot; completed {daysSince(p.updated_at)}d ago
                        {p.created_at &&
                          p.updated_at &&
                          ` · took ${daysBetween(p.created_at, p.updated_at)}d`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 7. Stale Alerts (last) ─────────────────────────────────────── */}
      {!loading && staleProjects.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-300/60 bg-amber-50/50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5 animate-card-enter">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-3 flex items-center gap-2">
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            Stale Projects
          </p>
          <div className="space-y-2">
            {staleProjects.map((p) => (
              <Link
                key={p.id}
                href={`/seo/${p.id}/${phaseRouteMap[p.current_phase] || "intake"}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-amber-100/60 dark:hover:bg-amber-500/10 transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-foreground truncate block">
                    {p.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {p.client_id_code
                      ? clientNameMap[p.client_id_code] || p.client_id_code
                      : "No client"}{" "}
                    &middot; {effectivePhase(p)}{" "}
                    {FLOW_PHASES.find((ph) => ph.code === effectivePhase(p))?.label}
                    {p.assignee_name && ` · ${p.assignee_name}`}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0 ml-3">
                  {daysSince(lastActivityDate(p))} days idle
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
