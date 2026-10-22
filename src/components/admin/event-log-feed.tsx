/* eslint-disable react-doctor/no-prevent-default */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  X,
} from "lucide-react";

type EventLogEntry = {
  id: number;
  userEmail: string | null;
  userName: string | null;
  section: string;
  action: string;
  status: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  message: string | null;
  detail: Record<string, unknown> | null;
  durationMs: number | null;
  createdAt: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const SECTIONS = [
  { value: "", label: "All Sections" },
  { value: "seo", label: "SEO Manager" },
  { value: "products", label: "Products" },
  { value: "publish", label: "Publish" },
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
  { value: "auth", label: "Auth" },
  { value: "admin", label: "Admin" },
];

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
];

async function fetchLogs(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/admin/logs?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json() as Promise<{ data: EventLogEntry[]; pagination: Pagination }>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
        <AlertCircle className="size-3" /> Error
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
        <AlertTriangle className="size-3" /> Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
      <CheckCircle2 className="size-3" /> Success
    </span>
  );
}

function SectionBadge({ section }: { section: string }) {
  const colors: Record<string, string> = {
    seo: "bg-violet-500/15 text-violet-400",
    products: "bg-blue-500/15 text-blue-400",
    publish: "bg-brand/15 text-brand",
    import: "bg-cyan-500/15 text-cyan-400",
    export: "bg-teal-500/15 text-teal-400",
    auth: "bg-pink-500/15 text-pink-400",
    admin: "bg-orange-500/15 text-orange-400",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors[section] || "bg-muted text-muted-foreground"}`}
    >
      {section}
    </span>
  );
}

function RelativeTime({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  let relative: string;
  if (diffMin < 1) relative = "just now";
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffHr < 24) relative = `${diffHr}h ago`;
  else if (diffDay < 7) relative = `${diffDay}d ago`;
  else relative = d.toLocaleDateString("en-US");

  return (
    <span title={d.toLocaleString()} className="text-xs text-muted-foreground whitespace-nowrap">
      {relative}
    </span>
  );
}

export function EventLogFeed() {
  const [page, setPage] = useState(1);
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const params: Record<string, string> = { page: String(page), pageSize: "50" };
  if (section) params.section = section;
  if (status) params.status = status;
  if (search) params.search = search;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-event-logs", params],
    queryFn: () => fetchLogs(params),
    refetchInterval: 15000,
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const clearFilters = useCallback(() => {
    setSection("");
    setStatus("");
    setSearch("");
    setSearchInput("");
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  const hasFilters = section || status || search || from || to;
  const logs = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Event Logs</h1>
          <p className="text-sm text-muted-foreground">
            Admin-only log of all system events
            {pagination ? ` — ${pagination.total.toLocaleString()} total` : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Section
          </label>
          <Select value={section || "_all"} onValueChange={(v) => { setSection(v === "_all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s.value || "_all"} value={s.value || "_all"}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Status
          </label>
          <Select value={status || "_all"} onValueChange={(v) => { setStatus(v === "_all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value || "_all"} value={s.value || "_all"}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            From
          </label>
          <DatePicker
            value={from}
            onChange={(v) => { setFrom(v); setPage(1); }}
            className="h-9 w-full"
          />
        </div>

        <div className="w-36">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            To
          </label>
          <DatePicker
            value={to}
            onChange={(v) => { setTo(v); setPage(1); }}
            className="h-9 w-full"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Search
          </label>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            className="flex gap-1.5"
          >
            <Input
              placeholder="Search action, message, user…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-9 px-3">
              <Search className="size-3.5" />
            </Button>
          </form>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>
            <X className="mr-1 size-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="py-12 text-center text-red-400">Failed to load logs</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No events found</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">User</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Section</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Message</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className={`border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors ${
                      log.status === "error" ? "bg-red-500/[0.03]" : ""
                    }`}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-3 py-2">
                      <RelativeTime date={log.createdAt} />
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground/80 max-w-[180px] truncate">
                      {log.userName || log.userEmail || "system"}
                    </td>
                    <td className="px-3 py-2">
                      <SectionBadge section={log.section} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">
                      {log.action}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
                      {log.message || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {log.durationMs != null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {log.durationMs >= 1000
                            ? `${(log.durationMs / 1000).toFixed(1)}s`
                            : `${log.durationMs}ms`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-muted/10">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                          <div>
                            <span className="font-medium text-muted-foreground">User:</span>{" "}
                            {log.userEmail || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Resource:</span>{" "}
                            {log.resourceType ? `${log.resourceType}:${log.resourceId || "—"}` : "—"}
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-muted-foreground">Label:</span>{" "}
                            {log.resourceLabel || "—"}
                          </div>
                          {log.detail && (
                            <div className="col-span-2">
                              <span className="font-medium text-muted-foreground">Detail:</span>
                              <pre className="mt-1 overflow-x-auto rounded bg-background/60 p-2 text-[11px] leading-relaxed">
                                {JSON.stringify(log.detail, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
            {pagination.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground">
              {page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
