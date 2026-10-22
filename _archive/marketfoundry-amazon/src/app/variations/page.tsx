/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Layers,
  FolderTree,
  Package,
  Loader2,
  Search,
  Lock,
  PackageOpen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ─────────────────────────────────────────────────────────────

type ClientEntry = {
  clientIdCode: string;
  clientName: string;
};

type VariationSummary = {
  id: string;
  clientId: string;
  name: string;
  code: string;
  primaryDimension: string | null;
  themeAttributes: string[] | null;
  description: string | null;
  status: "draft" | "locked";
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  groupCount: number;
  vpCount: number;
};

// ── Fetchers ──────────────────────────────────────────────────────────

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients/list?status=Active");
  if (!res.ok) return [];
  return res.json();
}

async function fetchVariations(
  clientId: string
): Promise<VariationSummary[]> {
  const params = clientId ? `?clientId=${clientId}` : "";
  const res = await fetch(`/api/variations${params}`);
  if (!res.ok) throw new Error("Failed to fetch variations");
  return res.json();
}

async function createVariation(body: {
  name: string;
  code: string;
  clientId: string;
}): Promise<VariationSummary> {
  const res = await fetch("/api/variations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = "Failed to create variation";
    try { msg = JSON.parse(text).error ?? msg; } catch { msg = text || msg; }
    throw new Error(`${msg} (${res.status})`);
  }
  return res.json();
}

// ── Component ─────────────────────────────────────────────────────────

export default function VariationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedClient, setSelectedClient] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [newClient, setNewClient] = useState("");
  const [variationName, setVariationName] = useState("");
  const [dialogStep, setDialogStep] = useState<1 | 2>(1);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  function toggleClient(clientId: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  // ── Queries ──────────────────────────────────────────────────────

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: fetchClients,
    staleTime: 5 * 60_000,
  });

  const {
    data: variations = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["variations", selectedClient],
    queryFn: () => fetchVariations(selectedClient === "all" ? "" : selectedClient),
  });

  const createMut = useMutation({
    mutationFn: createVariation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["variations"] });
      setDialogOpen(false);
      setNewClient("");
      setVariationName("");
      setDialogStep(1);
      router.push(`/variations/${data.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/variations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variations"] });
      toast.success("Variation deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Derived ──────────────────────────────────────────────────────

  const clientNameMap = useMemo(
    () =>
      Object.fromEntries(clients.map((c) => [c.clientIdCode, c.clientName])),
    [clients]
  );

  const filtered = useMemo(() => {
    if (!search) return variations;
    const q = search.toLowerCase();
    return variations.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q)
    );
  }, [variations, search]);

  // Group by client; sort variations within each group by code (ascending)
  const groupedByClient = useMemo(() => {
    const map = new Map<string, VariationSummary[]>();
    for (const v of filtered) {
      const arr = map.get(v.clientId) ?? [];
      arr.push(v);
      map.set(v.clientId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }
    return Array.from(map.entries()).sort((a, b) => {
      const nameA = clientNameMap[a[0]] ?? a[0];
      const nameB = clientNameMap[b[0]] ?? b[0];
      return nameA.localeCompare(nameB);
    });
  }, [filtered, clientNameMap]);

  // ── Handlers ─────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newClient) return;
    const name = variationName.trim() || "New Variation";
    try {
      const res = await fetch(`/api/variations/next-code?clientId=${encodeURIComponent(newClient)}`);
      if (!res.ok) throw new Error("Failed to get next code");
      const { code } = await res.json();
      createMut.mutate({ name, code, clientId: newClient });
    } catch {
      toast.error("Failed to generate variation code");
    }
  }

  function openDialog() {
    setNewClient(selectedClient && selectedClient !== "all" ? selectedClient : "");
    setVariationName("");
    setDialogStep(1);
    setDialogOpen(true);
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="-mt-6 lg:-mt-8">
      {/* Page heading + controls portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
            <span className="font-bold text-sidebar-foreground">Variation</span>
            <span className="font-normal text-brand">Builder</span>
          </h1>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            Define variation families, groups, and cross-cutting tags for product catalogs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="h-8 w-[180px] rounded-md border border-sidebar-border bg-sidebar-accent/50 text-xs">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search variations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 rounded-md border border-sidebar-border bg-sidebar-accent/50 text-xs"
            />
          </div>

          <Button
            onClick={openDialog}
            size="sm"
            className="h-8 rounded-md bg-brand-solid px-3 text-xs font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
          >
            <Plus className="size-3.5 mr-1" />
            New Variation
          </Button>
        </div>
      </PageMetaSlot>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-5 w-40 mb-3" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2].map((j) => (
                  <div
                    key={j}
                    className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800"
                  >
                    <Skeleton className="h-5 w-3/4 mb-3" />
                    <Skeleton className="h-4 w-1/2 mb-2" />
                    <div className="flex gap-2 mt-4">
                      <Skeleton className="h-6 w-16 rounded-md" />
                      <Skeleton className="h-6 w-16 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Failed to load variations. Please try again.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Layers className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search
              ? "No variations match your search."
              : `No variations yet${selectedClient && selectedClient !== "all" ? ` for ${clientNameMap[selectedClient] ?? selectedClient}` : ""}. Create your first one.`}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByClient.map(([clientId, clientVariations]) => {
            // Auto-expand when a specific client filter is active
            const expanded =
              expandedClients.has(clientId) ||
              (selectedClient !== "" && selectedClient !== "all");
            return (
            <div key={clientId}>
              <button
                type="button"
                onClick={() => toggleClient(clientId)}
                className="flex items-center gap-2 mb-3 w-full text-left"
              >
                <span
                  className={cn(
                    "text-[10px] text-brand transition-transform",
                    expanded && "rotate-90"
                  )}
                >
                  ▸
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
                  {clientNameMap[clientId] ?? clientId}
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  ({clientVariations.length})
                </span>
                <div className="flex-1 h-px bg-border" />
              </button>
              {expanded && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {clientVariations.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => router.push(`/variations/${v.id}`)}
                    className={cn(
                      "text-left rounded-xl border p-5 transition-all card-glow animate-card-enter cursor-pointer relative group",
                      v.status === "locked"
                        ? "border-amber-200 bg-amber-50/30 hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:border-amber-500/30"
                        : "border-stone-200 bg-card hover:border-stone-300 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-700"
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: v.id, name: v.name });
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      title="Delete variation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="flex items-start justify-between gap-2 mb-1 pr-6">
                      <h3 className="text-sm font-bold text-foreground truncate">
                        {v.name}
                      </h3>
                      {v.status === "locked" && (
                        <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 shrink-0">
                          <Lock className="size-2.5 mr-1" />
                          Locked
                        </Badge>
                      )}
                    </div>

                    <p className="text-[10px] font-bold text-muted-foreground mb-3 font-mono">
                      {v.code}
                    </p>

                    {v.themeAttributes && v.themeAttributes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {v.themeAttributes.map((attr) => (
                          <Badge
                            key={attr}
                            variant="secondary"
                            className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                          >
                            {attr}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-auto pt-2 border-t border-stone-100 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                        <Package className="size-3.5" />
                        {v.productCount} products
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-group">
                        <FolderTree className="size-3.5" />
                        {v.groupCount} groups
                      </div>
                      {v.vpCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-vp">
                          <PackageOpen className="size-3.5" />
                          {v.vpCount} Variety Pack{v.vpCount !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Create dialog — two-step wizard */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setDialogStep(1);
          }}>
        <DialogContent className="rounded-xl p-5 sm:max-w-md backdrop-blur-sm font-[family-name:var(--font-outfit)]">
          <DialogHeader>
            <DialogTitle className="text-xs font-bold text-foreground">
              {dialogStep === 1 ? "New Variation" : "Insert Variation Name"}
            </DialogTitle>
          </DialogHeader>

          {/* Stepper indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              dialogStep >= 1 ? "bg-[#F7BF1D]" : "bg-stone-200 dark:bg-zinc-700"
            )} />
            <div className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              dialogStep >= 2 ? "bg-[#F7BF1D]" : "bg-stone-200 dark:bg-zinc-700"
            )} />
          </div>

          {dialogStep === 1 ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold font-[family-name:var(--font-outfit)] text-foreground">Client</Label>
                <Select value={newClient} onValueChange={setNewClient}>
                  <SelectTrigger className="rounded-md border border-stone-300 bg-white text-sm font-[family-name:var(--font-outfit)] dark:border-zinc-700 dark:bg-white">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.clientIdCode} value={c.clientIdCode} className="font-[family-name:var(--font-outfit)]">
                        {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold font-[family-name:var(--font-outfit)] text-foreground">Insert a Name</Label>
                <Input
                  autoFocus
                  placeholder="Enter name…"
                  value={variationName}
                  onChange={(e) => setVariationName(e.target.value)}
                  className="rounded-md border border-stone-300 bg-white text-sm font-[family-name:var(--font-outfit)] dark:border-zinc-700 dark:bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDialogOpen(false);
                setDialogStep(1);
                setNewClient("");
                setVariationName("");
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </Button>
            {dialogStep === 1 ? (
              <>
                <Button
                  onClick={() => setDialogStep(2)}
                  disabled={!newClient || createMut.isPending}
                  variant="brand"
                  className="rounded-lg px-4 py-2 text-sm font-bold"
                >
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={handleCreate}
                  disabled={!newClient || createMut.isPending}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Skip
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newClient || createMut.isPending || !variationName.trim()}
                  variant="brand"
                  className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMut.isPending && (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  )}
                  Create
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMut.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
        title="Delete variation?"
        description={deleteTarget ? (
          <>
            This will permanently delete <strong className="text-foreground">{deleteTarget.name}</strong> and all its groups and tags. Products will be unlinked but not deleted. This action cannot be undone.
          </>
        ) : null}
        pending={deleteMut.isPending}
        confirmLabel="Delete variation"
      />
    </div>
  );
}
