/* eslint-disable react-doctor/prefer-useReducer */
"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Pencil,
  Layers,
} from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";
import { DEPARTMENTS, type DepartmentId } from "@/lib/permissions";

type ActivityEntry = {
  id: number;
  productId: string;
  asin: string | null;
  sku: string | null;
  clientIdCode: string | null;
  itemName: string | null;
  fieldLabel: string;
  bqName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
  editType: string;
};

type ActivityResponse = {
  data: ActivityEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ClientEntry = { clientIdCode: string; count: number; activeCount: number };

async function fetchActivity(params: URLSearchParams): Promise<ActivityResponse> {
  const res = await fetch(`/api/activity?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients?lite=1");
  if (!res.ok) return [];
  return res.json();
}

function truncate(str: string | null, max: number): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeed() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [client, setClient] = useState("");
  const [editType, setEditType] = useState("");
  const [department, setDepartment] = useState("");

  const { data: clientsData = [] } = useQuery({
    queryKey: ["clients", "lite"],
    queryFn: fetchClients,
    staleTime: 5 * 60 * 1000,
  });

  const clientCodes = useMemo(
    () => clientsData.map((c) => c.clientIdCode),
    [clientsData]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", "50");
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (client) p.set("client", client);
    if (editType) p.set("editType", editType);
    if (department) p.set("department", department);
    return p;
  }, [page, debouncedSearch, client, editType, department]);

  const { data, isLoading } = useQuery({
    queryKey: ["activity", params.toString()],
    queryFn: () => fetchActivity(params),
  });

  const entries = data?.data ?? [];
  const pagination = data?.pagination;
  const hasFilters = search || client || editType || department;

  return (
    <div>
      {/* Header */}
      <div className="pb-3 border-b mb-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search ASIN, SKU, field…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select
            value={client || "all"}
            onValueChange={(v) => {
              setClient(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clientCodes.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={department || "all"}
            onValueChange={(v) => {
              setDepartment(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {Object.entries(DEPARTMENTS).map(([id, dept]) => (
                <SelectItem key={id} value={id}>
                  {dept.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={editType || "all"}
            onValueChange={(v) => {
              setEditType(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Edit Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="bulk">Bulk</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setClient("");
                setEditType("");
                setDepartment("");
                setPage(1);
              }}
            >
              <X className="mr-1 size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Activity List */}
      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="py-3 px-2 flex gap-3">
              <Skeleton className="size-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No activity found.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="py-3 px-2 flex gap-3 hover:bg-muted/50 transition-colors"
            >
              {/* Icon */}
              <div
                className={`flex-shrink-0 mt-0.5 size-8 rounded-full flex items-center justify-center ${
                  entry.editType === "bulk"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-500/15 text-blue-400"
                }`}
              >
                {entry.editType === "bulk" ? (
                  <Layers className="size-4" />
                ) : (
                  <Pencil className="size-4" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-sm">
                    <span className="font-medium">{entry.changedBy}</span>{" "}
                    edited{" "}
                    <span className="font-medium">{entry.fieldLabel}</span>
                  </span>
                  {entry.editType === "bulk" && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      bulk
                    </Badge>
                  )}
                </div>

                {/* Product info */}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {entry.asin && (
                    <span className="mr-2">
                      ASIN: <span className="font-mono">{entry.asin}</span>
                    </span>
                  )}
                  {entry.sku && (
                    <span className="mr-2">
                      SKU: <span className="font-mono">{entry.sku}</span>
                    </span>
                  )}
                  {entry.clientIdCode && (
                    <span className="mr-2">
                      {CLIENT_NAMES[entry.clientIdCode] || entry.clientIdCode}
                    </span>
                  )}
                </div>

                {/* Value change */}
                <div className="mt-1 text-xs flex items-center gap-1 flex-wrap">
                  <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono inline-block max-w-[300px] truncate">
                    {truncate(entry.oldValue, 80)}
                  </span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono inline-block max-w-[300px] truncate">
                    {truncate(entry.newValue, 80)}
                  </span>
                </div>

                {/* Item name */}
                {entry.itemName && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">
                    {truncate(entry.itemName, 100)}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex-shrink-0 text-right">
                <div className="text-xs text-muted-foreground" title={formatDateTime(entry.changedAt)}>
                  {formatDate(entry.changedAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}&ndash;
            {Math.min(pagination.page * pagination.pageSize, pagination.total)}{" "}
            of {pagination.total} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
