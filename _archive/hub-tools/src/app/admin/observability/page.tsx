/* eslint-disable react-doctor/no-long-transition-duration */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/no-giant-component */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Database,
  DollarSign,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  Monitor,
  PackageOpen,
  RefreshCw,
  Route,
  Server,
  ShoppingCart,
  Table2,
  TrendingUp,
  Upload,
  Users,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ─────────────────────────────────────────────────────────────

type Summary = {
  totalCost30d: number;
  totalInputTokens30d: number;
  totalOutputTokens30d: number;
  totalCalls30d: number;
  totalErrors30d: number;
  eventsLast7d: number;
  errorsLast7d: number;
};

type FeatureUsage = Record<
  string,
  {
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    avgDurationMs: number;
  }
>;

type ServiceHealth = {
  name: string;
  lastSuccess: string | null;
  lastSuccessAction: string | null;
  lastError: string | null;
  lastErrorMessage: string | null;
  status: "healthy" | "degraded" | "unknown";
};

type ErrorEntry = {
  id: number;
  section: string;
  action: string;
  message: string | null;
  userEmail: string | null;
  detail: Record<string, unknown> | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  createdAt: string;
};

interface TableInfo {
  name: string;
  rows: number;
}

interface CheckResult {
  name: string;
  status: "ok" | "error";
  latencyMs: number;
  details?: string;
  tables?: TableInfo[];
}

interface DataIntegrity {
  totalProducts: number;
  dirtyProducts: number;
  missingAsin: number;
  missingUuid: number;
  missingItemName: number;
  clientBreakdown: Array<{ client: string; count: number; dirty: number }>;
}

interface LastPublish {
  publishedBy: string;
  publishedAt: string;
  rowsPublished: number;
  dirtyCount: number;
}

interface SpApiStatus {
  clientIdCode: string;
  marketplaceId: string;
  isActive: boolean;
  lastSyncAt: string | null;
}

interface CategoryDefSummary {
  totalDefinitions: number;
  totalAttributes: number;
  clients: number;
}

interface RecentActivity {
  editsToday: number;
  editsThisWeek: number;
  activeEditors: number;
}

type SystemHealth = {
  status: "healthy" | "degraded";
  timestamp: string;
  checks: CheckResult[];
  dataIntegrity: DataIntegrity;
  lastPublish: LastPublish | null;
  spApiStatus: SpApiStatus[];
  categoryDefs: CategoryDefSummary;
  recentActivity: RecentActivity;
  env: Record<string, string>;
};

type ObservabilityData = {
  summary: Summary;
  featureUsage: FeatureUsage;
  dailyCosts: Record<string, number>;
  serviceHealth: ServiceHealth[];
  recentErrors: ErrorEntry[];
  systemHealth: SystemHealth;
};

// ── Helpers ───────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US");
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US");
}

/** Map a section name to its app route */
function sectionRoute(section: string, resourceType?: string | null, resourceId?: string | null): string | null {
  const s = section.toLowerCase();

  // If we have a resource, try to build a deep link
  if (resourceId) {
    if (resourceType === "product" || s.includes("product")) return `/products/${resourceId}`;
    if (resourceType === "aplus" || s.includes("aplus") || s.includes("a+")) return "/design/aplus2";
  }

  // Section-level routes
  if (s.includes("product")) return "/products";
  if (s.includes("aplus") || s.includes("a+")) return "/design/aplus2";
  if (s.includes("seo")) return "/seo";
  if (s.includes("amazon") || s.includes("sp-api")) return "/amazon-sync";
  if (s.includes("portal")) return "/portal";
  if (s.includes("publish")) return "/publish";
  if (s.includes("report") || s.includes("export")) return "/reports";
  if (s.includes("admin") || s.includes("user")) return "/admin";
  if (s.includes("redshift") || s.includes("sync")) return "/admin/sync";
  if (s.includes("drive")) return "/design/aplus2";
  if (s.includes("claude") || s.includes("ai")) return "/admin/ai";
  if (s.includes("rainforest")) return "/amazon-sync";
  if (s.includes("keyword")) return "/seo";
  return null;
}

// ── Shared UI components ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-foreground",
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 space-y-1.5 card-glow ${
        alert
          ? "border-amber-500/25 bg-amber-500/5 dark:border-amber-500/20 dark:bg-amber-500/5"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`size-4 ${alert ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`}
        />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color} font-[family-name:var(--font-outfit)]`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && (
        <p className="text-[11px] text-muted-foreground leading-tight">{sub}</p>
      )}
    </div>
  );
}

function ServiceStatusDot({ status }: { status: string }) {
  if (status === "healthy")
    return <span className="inline-block size-2.5 rounded-full bg-emerald-500" />;
  if (status === "degraded")
    return <span className="inline-block size-2.5 rounded-full bg-amber-500 animate-pulse" />;
  return <span className="inline-block size-2.5 rounded-full bg-muted-foreground/30" />;
}

function StatusBadge({ status }: { status: "ok" | "error" }) {
  return status === "ok" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500 dark:text-emerald-400">
      <CheckCircle className="size-3" />
      OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-500 dark:text-red-400">
      <XCircle className="size-3" />
      Error
    </span>
  );
}

function PulsingDot({ status }: { status?: "ok" | "error" }) {
  if (!status)
    return <span className="size-2.5 rounded-full bg-muted-foreground/20" />;
  const c =
    status === "ok"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
      : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]";
  return (
    <span className="relative flex size-2.5">
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
          status === "ok" ? "bg-emerald-400" : "bg-red-400"
        } ${status === "ok" ? "animate-ping" : ""}`}
        style={{ animationDuration: "2.5s" }}
      />
      <span className={`relative inline-flex rounded-full size-2.5 ${c}`} />
    </span>
  );
}

function LatencyBar({ ms, max }: { ms: number; max: number }) {
  const pct = Math.min((ms / max) * 100, 100);
  const color =
    ms < 500 ? "bg-emerald-500" : ms < 2000 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} animate-bar-fill`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap font-mono">
        {ms}ms
      </span>
    </div>
  );
}

function Section({
  icon: Icon,
  iconColor,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden card-glow">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-card hover:bg-accent/30 transition-colors cursor-pointer"
      >
        <Icon className={`size-4.5 ${iconColor} flex-shrink-0`} />
        <span className="font-semibold text-foreground flex-1 text-left text-sm font-[family-name:var(--font-outfit)]">
          {title}
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="border-t border-border/40">{children}</div>}
    </div>
  );
}

function KVRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-foreground ${mono ? "font-mono" : "font-medium"} tabular-nums`}
      >
        {value}
      </span>
    </div>
  );
}

function IntegrityMetric({
  label,
  value,
  total,
  status,
}: {
  label: string;
  value: number;
  total: number;
  status: "good" | "warn" | "info";
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  const colors = {
    good: "text-emerald-500 dark:text-emerald-400",
    warn: "text-amber-500 dark:text-amber-400",
    info: "text-blue-500 dark:text-blue-400",
  };
  return (
    <div className="rounded-xl border border-border/60 px-3.5 py-3">
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={`text-xl font-bold tabular-nums font-[family-name:var(--font-outfit)] ${colors[status]}`}
        >
          {value.toLocaleString()}
        </span>
        {value > 0 && (
          <span className="text-[10px] text-muted-foreground/70">({pct}%)</span>
        )}
      </div>
    </div>
  );
}

// ── Architecture diagram ──────────────────────────────────────────────

function ConnectorLine() {
  return (
    <div className="flex justify-center py-0.5">
      <div className="relative w-px h-8">
        <div className="absolute inset-0 bg-brand/30" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 size-1 rounded-full bg-brand/40"
          style={{ animation: "flow-down 2s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}

function ArchLayer({
  icon: Icon,
  iconColor,
  title,
  badge,
  badgeColor,
  tags,
  tagColor,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  tags: string[];
  tagColor: string;
  status?: "ok" | "error";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        {status !== undefined && <PulsingDot status={status} />}
        <Icon className={`size-4 ${iconColor} shrink-0`} />
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {badge && (
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${tagColor}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ArchitectureDiagram({ checks }: { checks?: CheckResult[] }) {
  const pgStatus = checks?.find((c) => c.name.includes("PostgreSQL"))?.status;
  const bqOk = checks
    ?.filter((c) => c.name.startsWith("BQ:"))
    .every((c) => c.status === "ok");
  const bqStatus = checks
    ? ((bqOk ? "ok" : "error") as "ok" | "error")
    : undefined;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-1 card-glow">
      <div className="flex items-center gap-2.5 mb-4">
        <Wifi className="size-4 text-brand" />
        <h2 className="text-sm font-[family-name:var(--font-outfit)] text-foreground">
          Architecture
        </h2>
      </div>

      <ArchLayer
        icon={Monitor}
        iconColor="text-sky-500 dark:text-sky-400"
        title="Browser"
        badge="Client"
        badgeColor="bg-sky-500/10 text-sky-500 dark:text-sky-400"
        tags={["React 19", "TanStack Query", "shadcn/ui", "TanStack Table"]}
        tagColor="bg-sky-500/10 text-sky-600 dark:text-sky-400/90"
      />

      <ConnectorLine />

      <ArchLayer
        icon={Route}
        iconColor="text-amber-500 dark:text-amber-400"
        title="Next.js API Routes"
        badge="Serverless"
        badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        tags={["Products CRUD", "Import / Export", "Publish to BQ", "SP-API Sync", "Category Defs"]}
        tagColor="bg-amber-500/10 text-amber-600 dark:text-amber-400/80"
      />

      <ConnectorLine />

      <div className="grid grid-cols-3 gap-2.5">
        <ArchLayer
          icon={Database}
          iconColor="text-violet-500 dark:text-violet-400"
          title="Supabase"
          tags={["Products", "Users", "Activity"]}
          tagColor="bg-violet-500/10 text-violet-600 dark:text-violet-400/80"
          status={pgStatus}
        />
        <ArchLayer
          icon={Cloud}
          iconColor="text-blue-500 dark:text-blue-400"
          title="BigQuery"
          tags={["Master", "AAC", "Attributes", "SEO"]}
          tagColor="bg-blue-500/10 text-blue-600 dark:text-blue-400/80"
          status={bqStatus}
        />
        <ArchLayer
          icon={ShoppingCart}
          iconColor="text-orange-500 dark:text-orange-400"
          title="Amazon"
          tags={["Listings", "Catalog", "Compare"]}
          tagColor="bg-orange-500/10 text-orange-600 dark:text-orange-400/80"
        />
      </div>

      <div className="pt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-brand/50" />
          Data flow
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-violet-400/50" />
          Primary store
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-blue-400/50" />
          Publish target
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-3" /> Google OAuth
        </span>
      </div>
    </div>
  );
}

// ── Errors Table (expandable rows with deep links) ────────────────────

function ErrorsTable({ errors }: { errors: ErrorEntry[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-border/40 bg-card">
      <div className="px-4 py-3 border-b border-border/30">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="size-4 text-red-400" />
          Recent Errors (Last 50)
        </h2>
      </div>
      {errors.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-400" />
          No errors recorded
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/20 bg-muted/20">
                <th className="w-8 p-2" />
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Time
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Section
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Action
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Message
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  User
                </th>
              </tr>
            </thead>
            <tbody>
              {errors.map((err) => {
                const isExpanded = expandedId === err.id;
                const route = sectionRoute(err.section, err.resourceType, err.resourceId);
                return (
                  <ErrorRow
                    key={err.id}
                    err={err}
                    isExpanded={isExpanded}
                    route={route}
                    onToggle={() => setExpandedId(isExpanded ? null : err.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ErrorRow({
  err,
  isExpanded,
  route,
  onToggle,
}: {
  err: ErrorEntry;
  isExpanded: boolean;
  route: string | null;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border/10 hover:bg-red-500/[0.03] cursor-pointer select-none"
        onClick={onToggle}
      >
        <td className="p-2 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {relativeTime(err.createdAt)}
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {err.section}
          </span>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-foreground">
          {err.action}
        </td>
        <td className="px-3 py-2 text-xs text-red-400 max-w-[300px] truncate">
          {err.message || "\u2014"}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {err.userEmail || "system"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border/10 bg-red-500/[0.02]">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-3">
              {/* Full error message */}
              <div>
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Error Message
                </div>
                <div className="text-sm text-red-400 whitespace-pre-wrap break-all font-mono bg-muted/30 rounded-lg px-3 py-2">
                  {err.message || "No message"}
                </div>
              </div>

              {/* Resource info + navigation */}
              <div className="flex flex-wrap items-center gap-3">
                {err.resourceLabel && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">Resource:</span>{" "}
                    {err.resourceLabel}
                    {err.resourceType && (
                      <span className="text-muted-foreground/60 ml-1">({err.resourceType})</span>
                    )}
                  </div>
                )}
                {route && (
                  <a
                    href={route}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand/80 transition-colors"
                  >
                    <ExternalLink className="size-3" />
                    Go to {err.section}
                  </a>
                )}
                <div className="text-xs text-muted-foreground/60">
                  {new Date(err.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Detail JSON */}
              {err.detail && Object.keys(err.detail).length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Detail
                  </div>
                  <pre className="text-xs text-muted-foreground font-mono bg-muted/30 rounded-lg px-3 py-2 overflow-x-auto max-h-48">
                    {JSON.stringify(err.detail, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ObservabilityData>({
    queryKey: ["admin-observability"],
    queryFn: async () => {
      const res = await fetch("/api/admin/observability");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const health = data?.systemHealth;
  const integrity = health?.dataIntegrity;
  const lastPublish = health?.lastPublish;
  const spApi = health?.spApiStatus ?? [];
  const catDefs = health?.categoryDefs;
  const activity = health?.recentActivity;
  const checks = health?.checks ?? [];
  const pgCheck = checks.find((c) => c.name.includes("PostgreSQL"));
  const bqChecks = checks.filter((c) => c.name.startsWith("BQ:"));
  const bqDataset = health?.env?.BQ_DATASET ?? "";
  const maxLatency = checks.length > 0
    ? Math.max(...checks.map((c) => c.latencyMs), 1000)
    : 1000;

  const timeSincePublish = lastPublish
    ? formatTimeAgo(new Date(lastPublish.publishedAt))
    : null;

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="System Health"
        >
          <span className="font-bold text-sidebar-foreground">System</span>
          <span className="font-normal text-brand">Health</span>
        </h1>
      </PageMetaSlot>
      {/* Page header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background flex flex-col sm:flex-row sm:items-start sm:justify-end gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-border/60 hover:border-brand/30 hover:shadow-[0_0_12px_-4px_var(--brand-glow)] mt-2 sm:mt-0"
        >
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">Loading observability data…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-500 dark:text-red-400 flex items-center gap-3">
          <XCircle className="size-5 shrink-0" />
          Failed to load observability data
        </div>
      ) : data ? (
        <>
          {/* Overall System Status Banner */}
          {health && (
            <div
              className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
                health.status === "healthy"
                  ? "border-emerald-500/25 bg-emerald-500/5 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                  : "border-red-500/25 bg-red-500/5 dark:border-red-500/20 dark:bg-red-500/5"
              }`}
            >
              {health.status === "healthy" ? (
                <div className="relative">
                  <CheckCircle className="size-7 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  <span
                    className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping"
                    style={{ animationDuration: "3s" }}
                  />
                </div>
              ) : (
                <XCircle className="size-7 text-red-500 dark:text-red-400 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-bold text-foreground font-[family-name:var(--font-outfit)]">
                  {health.status === "healthy"
                    ? "All systems operational"
                    : "Some services are experiencing issues"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Checked at {new Date(health.timestamp).toLocaleString()}
                </p>
              </div>
              {lastPublish && (
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-[0.08em] font-medium">
                    Last publish
                  </p>
                  <p className="text-sm font-bold text-foreground font-[family-name:var(--font-outfit)]">
                    {timeSincePublish}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* AI Stats */}
            <StatCard
              label="AI Cost (30d)"
              value={formatCost(data.summary.totalCost30d)}
              sub={`${data.summary.totalCalls30d} calls`}
              icon={DollarSign}
              color="text-brand"
            />
            <StatCard
              label="Tokens (30d)"
              value={formatTokens(
                data.summary.totalInputTokens30d +
                  data.summary.totalOutputTokens30d
              )}
              sub={`${formatTokens(data.summary.totalInputTokens30d)} in / ${formatTokens(data.summary.totalOutputTokens30d)} out`}
              icon={Zap}
            />
            <StatCard
              label="Events (7d)"
              value={data.summary.eventsLast7d}
              sub="all system events"
              icon={Activity}
            />
            <StatCard
              label="Errors (7d)"
              value={data.summary.errorsLast7d}
              sub={`${data.summary.totalErrors30d} in 30d`}
              icon={AlertCircle}
              color={
                data.summary.errorsLast7d > 0
                  ? "text-red-400"
                  : "text-emerald-400"
              }
            />
            {/* Health Stats */}
            {integrity && activity && (
              <>
                <StatCard
                  label="Products"
                  value={integrity.totalProducts}
                  icon={PackageOpen}
                  sub={`${integrity.clientBreakdown.length} clients`}
                />
                <StatCard
                  label="Unpublished"
                  value={integrity.dirtyProducts}
                  icon={Upload}
                  alert={integrity.dirtyProducts > 0}
                  sub={
                    integrity.dirtyProducts > 0
                      ? `${((integrity.dirtyProducts / integrity.totalProducts) * 100).toFixed(1)}% of products`
                      : "All synced"
                  }
                />
                <StatCard
                  label="Edits Today"
                  value={activity.editsToday}
                  icon={Activity}
                  sub={`${activity.editsThisWeek.toLocaleString()} this week`}
                />
                <StatCard
                  label="Active Editors"
                  value={activity.activeEditors}
                  icon={Users}
                  sub="Past 7 days"
                />
              </>
            )}
          </div>

          {/* Architecture Diagram */}
          <ArchitectureDiagram checks={health?.checks} />

          {/* Two-Column Layout: AI Usage + Service Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Claude Feature Breakdown */}
            <div className="rounded-xl border border-border/40 bg-card">
              <div className="px-4 py-3 border-b border-border/30">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="size-4 text-brand" />
                  Claude AI Usage by Feature (30d)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/20 bg-muted/20">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Feature</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Calls</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tokens</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Avg Time</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.featureUsage)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([feature, usage]) => (
                        <tr
                          key={feature}
                          className="border-b border-border/10 hover:bg-muted/10"
                        >
                          <td className="px-4 py-2 font-mono text-xs text-foreground">
                            {feature}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                            {usage.calls}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground/80">
                            {formatTokens(usage.inputTokens + usage.outputTokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-brand">
                            {formatCost(usage.cost)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {usage.avgDurationMs >= 1000
                              ? `${(usage.avgDurationMs / 1000).toFixed(1)}s`
                              : `${usage.avgDurationMs}ms`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {usage.errors > 0 ? (
                              <span className="text-red-400 font-medium">{usage.errors}</span>
                            ) : (
                              <span className="text-muted-foreground/40">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    {Object.keys(data.featureUsage).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No Claude API calls in the last 30 days
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* External Service Health */}
            <div className="rounded-xl border border-border/40 bg-card">
              <div className="px-4 py-3 border-b border-border/30">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Server className="size-4 text-brand" />
                  External Service Health
                </h2>
              </div>
              <div className="divide-y divide-border/20">
                {data.serviceHealth.map((svc) => (
                  <div
                    key={svc.name}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <ServiceStatusDot status={svc.status} />
                      <div>
                        <div className="text-sm font-medium text-foreground">{svc.name}</div>
                        {svc.status === "degraded" && svc.lastErrorMessage && (
                          <div className="text-xs text-red-400 mt-0.5 max-w-[250px] truncate">
                            {svc.lastErrorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {svc.status === "unknown" ? (
                          <span className="flex items-center gap-1">
                            <HelpCircle className="size-3" /> No data
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {relativeTime(svc.lastSuccess)}
                          </span>
                        )}
                      </div>
                      {svc.lastSuccessAction && (
                        <div className="text-[10px] text-muted-foreground/60 font-mono">
                          {svc.lastSuccessAction}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Cost Sparkline */}
          {Object.keys(data.dailyCosts).length > 0 && (
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <DollarSign className="size-4 text-brand" />
                Daily AI Cost (Last 7 Days)
              </h2>
              <div className="flex items-end gap-2 h-24">
                {(() => {
                  const days: string[] = [];
                  for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    days.push(d.toISOString().slice(0, 10));
                  }
                  const maxCost = Math.max(
                    ...days.map((d) => data.dailyCosts[d] || 0),
                    0.001
                  );
                  return days.map((day) => {
                    const cost = data.dailyCosts[day] || 0;
                    const height = Math.max(4, Math.round((cost / maxCost) * 80));
                    return (
                      <div key={day} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {cost > 0 ? formatCost(cost) : ""}
                        </span>
                        <div
                          className="w-full rounded-t bg-brand/60 transition-all"
                          style={{ height: `${height}px` }}
                        />
                        <span className="text-[10px] text-muted-foreground/60">
                          {day.slice(5)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* ── System Health Sections ── */}

          {/* PostgreSQL Check */}
          {pgCheck && (
            <Section
              icon={Database}
              iconColor="text-violet-500 dark:text-violet-400"
              title={pgCheck.name}
            >
              <div className="px-5 py-3 flex items-center gap-4 bg-card/50">
                <StatusBadge status={pgCheck.status} />
                <LatencyBar ms={pgCheck.latencyMs} max={maxLatency} />
              </div>
              {pgCheck.tables && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t bg-muted/30 dark:bg-muted/20">
                      <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Table</th>
                      <th className="text-right font-medium text-muted-foreground px-5 py-2 text-xs">Rows</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {pgCheck.tables.map((t) => (
                      <tr key={t.name} className="hover:bg-accent/20 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Table2 className="size-3.5 text-muted-foreground/60" />
                            <span className="font-mono text-xs text-foreground">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <span className="font-mono text-xs text-foreground tabular-nums">
                            {t.rows.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 dark:bg-muted/20">
                      <td className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">Total</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs font-bold text-foreground tabular-nums">
                        {pgCheck.tables.reduce((sum, t) => sum + t.rows, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Section>
          )}

          {/* BigQuery Tables */}
          {bqChecks.length > 0 && (
            <Section
              icon={Cloud}
              iconColor="text-blue-500 dark:text-blue-400"
              title={`BigQuery (${bqDataset})`}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 dark:bg-muted/20">
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Table</th>
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Status</th>
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Rows</th>
                    <th className="text-right font-medium text-muted-foreground px-5 py-2 text-xs">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {bqChecks.map((check) => {
                    const tableName = check.name.replace(/^BQ:\s*\S+\./, "");
                    return (
                      <tr key={check.name} className="hover:bg-accent/20 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Table2 className="size-3.5 text-muted-foreground/60" />
                            <span className="font-mono text-xs text-foreground">{tableName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={check.status} />
                        </td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`text-xs ${
                              check.status === "ok"
                                ? "text-muted-foreground"
                                : "text-red-500 dark:text-red-400"
                            }`}
                          >
                            {check.details}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <LatencyBar ms={check.latencyMs} max={maxLatency} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {/* Data Integrity */}
          {integrity && (
            <Section
              icon={AlertTriangle}
              iconColor="text-amber-500 dark:text-amber-400"
              title="Data Integrity"
            >
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <IntegrityMetric
                    label="Missing ASIN"
                    value={integrity.missingAsin}
                    total={integrity.totalProducts}
                    status={integrity.missingAsin === 0 ? "good" : "warn"}
                  />
                  <IntegrityMetric
                    label="Missing UUID"
                    value={integrity.missingUuid}
                    total={integrity.totalProducts}
                    status={integrity.missingUuid === 0 ? "good" : "warn"}
                  />
                  <IntegrityMetric
                    label="Missing Item Name"
                    value={integrity.missingItemName}
                    total={integrity.totalProducts}
                    status={integrity.missingItemName === 0 ? "good" : "warn"}
                  />
                  <IntegrityMetric
                    label="Dirty (unpublished)"
                    value={integrity.dirtyProducts}
                    total={integrity.totalProducts}
                    status={integrity.dirtyProducts === 0 ? "good" : "info"}
                  />
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-3">
                    Products by Client
                  </h3>
                  <div className="space-y-2">
                    {integrity.clientBreakdown.map((c) => {
                      const pct =
                        integrity.totalProducts > 0
                          ? (c.count / integrity.totalProducts) * 100
                          : 0;
                      return (
                        <div key={c.client} className="flex items-center gap-3">
                          <span className="text-xs font-mono text-foreground w-24 truncate shrink-0">
                            {c.client || "\u2014"}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand/60 animate-bar-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-12 text-right shrink-0 font-mono">
                            {c.count.toLocaleString()}
                          </span>
                          {c.dirty > 0 && (
                            <span className="text-[10px] text-amber-500 dark:text-amber-400 tabular-nums shrink-0 font-medium">
                              {c.dirty} dirty
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Last Publish & Category Defs side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section
              icon={Upload}
              iconColor="text-blue-500 dark:text-blue-400"
              title="Last Publish"
            >
              <div className="p-5">
                {lastPublish ? (
                  <div className="space-y-2.5">
                    <KVRow label="When" value={timeSincePublish} />
                    <KVRow label="By" value={lastPublish.publishedBy} mono />
                    <KVRow label="Rows published" value={lastPublish.rowsPublished.toLocaleString()} />
                    <KVRow label="Dirty at publish" value={lastPublish.dirtyCount.toLocaleString()} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No publishes recorded yet.</p>
                )}
              </div>
            </Section>

            <Section
              icon={FileText}
              iconColor="text-orange-500 dark:text-orange-400"
              title="Category Definitions"
            >
              <div className="p-5">
                {catDefs && catDefs.totalDefinitions > 0 ? (
                  <div className="space-y-2.5">
                    <KVRow label="Definitions" value={catDefs.totalDefinitions} />
                    <KVRow label="Total Attributes" value={catDefs.totalAttributes.toLocaleString()} />
                    <KVRow label="Clients with defs" value={catDefs.clients} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No category reports uploaded yet.</p>
                )}
              </div>
            </Section>
          </div>

          {/* SP-API Credentials */}
          {spApi.length > 0 && (
            <Section
              icon={ShoppingCart}
              iconColor="text-orange-500 dark:text-orange-400"
              title="SP-API Credentials"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 dark:bg-muted/20">
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Client</th>
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Marketplace</th>
                    <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">Status</th>
                    <th className="text-right font-medium text-muted-foreground px-5 py-2 text-xs">Last Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {spApi.map((cred) => (
                    <tr
                      key={`${cred.clientIdCode}-${cred.marketplaceId}`}
                      className="hover:bg-accent/20 transition-colors"
                    >
                      <td className="px-5 py-2.5 font-mono text-xs text-foreground">{cred.clientIdCode}</td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{cred.marketplaceId}</td>
                      <td className="px-5 py-2.5">
                        {cred.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500 dark:text-emerald-400">
                            <Zap className="size-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-500 dark:text-red-400">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-xs text-muted-foreground">
                        {cred.lastSyncAt ? formatTimeAgo(new Date(cred.lastSyncAt)) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Recent Errors */}
          <ErrorsTable errors={data.recentErrors} />

          {/* Environment Config */}
          {health?.env && (
            <Section
              icon={Server}
              iconColor="text-muted-foreground"
              title="Environment"
              defaultOpen={false}
            >
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border/40">
                  {Object.entries(health.env).map(([key, value]) => (
                    <tr key={key} className="hover:bg-accent/20 transition-colors">
                      <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{key}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-foreground text-right">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </>
      ) : null}
    </div>
  );
}
