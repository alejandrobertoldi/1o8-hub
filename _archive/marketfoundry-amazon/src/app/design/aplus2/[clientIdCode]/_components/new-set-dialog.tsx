"use client";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { aplus2ContentTypeLabel, aplus2SetHref, aplusProductDetailHref } from "@/lib/aplus2/set-path";
import {
  aplusGroupLabelFromFilters,
  filterAplusGroupMembers,
  sameAsinSet,
  type AplusThemeAxis,
  type AplusThemeFilters,
} from "@/lib/aplus2/variation-scope";

type Product = {
  id: string;
  asin: string;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  parentAsin: string | null;
  country: string | null;
  marketplace: string | null;
  status: string | null;
  parentageLevel: string | null;
  variationId: string | null;
};

type ContentType = "PA+" | "BA+";
type ScopeType = "ASIN" | "PARENT" | "GROUP";

type ExistingSet = {
  scopeType: ScopeType;
  marketplace: string;
  scopeIdentifier: string;
  productId: string;
  coveredAsins: string[] | null;
  contentType: string;
  latestVersionNumber: number | null;
  versionCount: number;
};

type GroupMember = {
  id: string;
  asin: string;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  parentAsin: string | null;
  parentageLevel: string | null;
  status: string | null;
  variationId: string | null;
  variationName: string | null;
  color: string | null;
  size: string | null;
  flavor: string | null;
  style: string | null;
};

type VariationMembersResponse = {
  variationId: string | null;
  variationName: string | null;
  parentAsin: string | null;
  themeAttributes: AplusThemeAxis[];
  members: GroupMember[];
};

function versionLabel(s: ExistingSet) {
  return `V${String(s.latestVersionNumber ?? s.versionCount ?? 1).padStart(2, "0")}`;
}

// Product listing-status palette (matches the products table tokens).
const STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
  suppressed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap ${style}`}>
      {status}
    </span>
  );
}

const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

function ParentageBadge({ value }: { value: string }) {
  const style = PARENTAGE_STYLES[value.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${style}`}>
      {value}
    </span>
  );
}

export function NewSetDialog({
  open, onOpenChange, clientIdCode,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  clientIdCode: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>("ASIN");
  const [marketplace, setMarketplace] = useState<string>("US");
  const [contentType, setContentType] = useState<ContentType>("PA+");
  const [groupFilters, setGroupFilters] = useState<AplusThemeFilters>({});
  const [selectedGroupAsins, setSelectedGroupAsins] = useState<Set<string>>(new Set());
  const [memberScope, setMemberScope] = useState<"variation" | "all">("variation");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const productsQ = useQuery({
    queryKey: ["aplus2-products", clientIdCode, debouncedSearch, scopeType],
    queryFn: async (): Promise<Product[]> => {
      const params = new URLSearchParams({
        clientIdCode,
        q: debouncedSearch,
      });
      if (scopeType !== "ASIN") params.set("parentsOnly", "1");
      const r = await fetch(`/api/aplus2/products?${params}`);
      if (!r.ok) throw new Error("Failed to load products");
      return r.json();
    },
    enabled: open,
  });

  const setsQ = useQuery({
    queryKey: ["aplus2-sets", clientIdCode],
    queryFn: async (): Promise<{ sets: ExistingSet[] }> => {
      const r = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
      if (!r.ok) throw new Error("Failed to load sets");
      return r.json();
    },
    enabled: open,
  });

  const products = productsQ.data ?? [];
  const selected = products.find((p) => p.id === productId);

  const membersQ = useQuery({
    queryKey: ["aplus2-variation-members", clientIdCode, memberScope, selected?.variationId],
    queryFn: async (): Promise<VariationMembersResponse> => {
      const params = new URLSearchParams({ clientIdCode });
      if (memberScope === "variation") {
        params.set("variationId", selected!.variationId!);
      }
      const r = await fetch(`/api/aplus2/variation-members?${params}`);
      if (!r.ok) throw new Error("Failed to load variation members");
      return r.json();
    },
    enabled:
      open
      && scopeType === "GROUP"
      && (memberScope === "all" || Boolean(selected?.variationId)),
  });
  const groupMembers = membersQ.data?.members ?? [];
  const visibleGroupMembers = filterAplusGroupMembers(groupMembers, groupFilters);
  const selectedGroupAnchor = groupMembers.find((member) =>
    selectedGroupAsins.has(member.asin),
  );

  function scopeFor(p: Product) {
    return p.asin;
  }

  function handleScopeType(next: ScopeType) {
    if (next === scopeType) return;
    setScopeType(next);
    setProductId(null);
    setGroupFilters({});
    setSelectedGroupAsins(new Set());
    setMemberScope(next === "GROUP" ? "all" : "variation");
  }

  function existingSetFor(p: Product) {
    if (scopeType === "GROUP") return undefined;
    const id = scopeFor(p);
    if (!id) return undefined;
    return setsQ.data?.sets.find(
      (s) => s.marketplace === marketplace && s.scopeIdentifier === id
    );
  }

  const selectedExisting =
    scopeType === "GROUP"
      ? setsQ.data?.sets.find(
          (set) =>
            set.scopeType === "GROUP"
            && set.marketplace === marketplace
            && sameAsinSet(set.coveredAsins ?? [], [...selectedGroupAsins]),
        )
      : selected
        ? existingSetFor(selected)
        : undefined;

  function resetState() {
    setSearch("");
    setProductId(null);
    setScopeType("ASIN");
    setMarketplace("US");
    setContentType("PA+");
    setGroupFilters({});
    setSelectedGroupAsins(new Set());
    setMemberScope("variation");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/aplus2/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          productId: scopeType === "GROUP"
            ? productId ?? selectedGroupAnchor?.id
            : productId,
          scopeType,
          marketplace,
          contentType,
          ...(scopeType === "GROUP"
            ? {
                coveredAsins: [...selectedGroupAsins],
                groupName: aplusGroupLabelFromFilters(groupFilters),
              }
            : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Create failed");
      return d as {
        setId: string;
        versionId: string;
        scopeIdentifier: string;
        marketplace: string;
        contentType: string;
      };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aplus2-sets", clientIdCode] });
      handleOpenChange(false);
      router.push(
        aplus2SetHref({
          clientIdCode,
          marketplace: d.marketplace,
          scopeIdentifier: d.scopeIdentifier,
          contentType: d.contentType ?? contentType,
        })
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const axisKey: Record<AplusThemeAxis, "color" | "size" | "flavor" | "style"> = {
    Color: "color",
    Size: "size",
    Flavor: "flavor",
    Style: "style",
  };
  const filterOptions = (axis: AplusThemeAxis) =>
    [...new Set(groupMembers.map((member) => member[axisKey[axis]]).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b));
  const toggleFilter = (axis: AplusThemeAxis, value: string, checked: boolean) => {
    setGroupFilters((current) => {
      const values = new Set(current[axis] ?? []);
      if (checked) values.add(value);
      else values.delete(value);
      return { ...current, [axis]: [...values] };
    });
  };
  const toggleGroupAsin = (asin: string, checked: boolean) => {
    setSelectedGroupAsins((current) => {
      const next = new Set(current);
      if (checked) next.add(asin);
      else next.delete(asin);
      return next;
    });
  };
  const allVisibleSelected =
    visibleGroupMembers.length > 0
    && visibleGroupMembers.every((member) => selectedGroupAsins.has(member.asin));
  const selectVisible = (checked: boolean) => {
    setSelectedGroupAsins((current) => {
      const next = new Set(current);
      for (const member of visibleGroupMembers) {
        if (checked) next.add(member.asin);
        else next.delete(member.asin);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle>New A+ Set</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto min-h-0 flex-1 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Scope</Label>
              <div className="flex gap-2 mt-1">
                {(["ASIN", "PARENT", "GROUP"] as const).map((v) => {
                  const selected = scopeType === v;
                  const variation = v === "PARENT";
                  const group = v === "GROUP";
                  return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleScopeType(v)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      group
                        ? selected
                          ? "border-teal-500/40 bg-teal-500/10 text-teal-400 font-bold"
                          : "border-teal-500/25 text-teal-400/80"
                        : variation
                        ? selected
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-400 font-bold"
                          : "border-blue-500/25 text-blue-400/80"
                        : selected
                          ? "border-brand bg-brand/10 text-brand font-bold"
                          : "border-stone-200 dark:border-zinc-700 text-muted-foreground"
                    }`}
                  >
                    {variation ? "VARIATION" : v}
                  </button>
                  );
                })}
              </div>
              {scopeType === "PARENT" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Parent ASINs only. The set is assigned to the parent and every child in that variation.
                </p>
              )}
              {scopeType === "GROUP" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Filter all variations immediately, or choose a parent to browse one variation. Select at least two ASINs.
                </p>
              )}
              {selected && (
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                  {scopeType === "ASIN"
                    ? selected.asin
                    : (selected.variationId ?? selected.asin)}
                </p>
              )}
              {scopeType !== "ASIN" && selected && !selected.variationId && (
                <p className="text-[11px] text-brand-red mt-1">
                  This parent has no Variation ID.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">A+ Type</Label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PA+">Premium A+</SelectItem>
                  <SelectItem value="BA+">Basic A+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {scopeType === "GROUP" && (
            <div>
              <Label className="text-xs">Browse ASINs from</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={memberScope === "all" ? "border-teal-500/40 bg-teal-500/10 text-teal-700" : ""}
                  onClick={() => setMemberScope("all")}
                >
                  All variations
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={memberScope === "variation" ? "border-teal-500/40 bg-teal-500/10 text-teal-700" : ""}
                  onClick={() => setMemberScope("variation")}
                >
                  One variation
                </Button>
              </div>
              {memberScope === "variation" && !selected?.variationId && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Choose a parent variation below.
                </p>
              )}
            </div>
          )}

          {(scopeType !== "GROUP" || memberScope === "variation") && (
            <>
              <div>
                <Label className="text-xs">{scopeType === "ASIN" ? "Search products" : "Search parent ASINs"}</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ASIN, SKU, title…" className="mt-1" />
              </div>

              <div className="max-h-52 overflow-y-auto rounded-md border">
            {productsQ.isLoading ? (
              <p className="text-xs text-muted-foreground p-3">Loading products…</p>
            ) : productsQ.isError ? (
              <p className="text-xs text-red-600 dark:text-red-400 p-3">Failed to load products.</p>
            ) : products.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                {scopeType === "ASIN" ? "No products match." : "No parent ASINs match."}
              </p>
            ) : (
              products.map((p) => {
                const existing = existingSetFor(p);
                return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={productId === p.id}
                  onClick={() => {
                    setProductId(p.id);
                    if (scopeType !== "GROUP") {
                      setGroupFilters({});
                      setSelectedGroupAsins(new Set());
                    }
                  }}
                  className={`flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left ${
                    productId === p.id
                      ? "bg-brand/10"
                      : existing
                        ? "bg-brand-red/10 hover:bg-brand-red/15"
                        : "hover:bg-stone-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 font-mono text-sm font-bold text-brand">
                      {scopeType === "ASIN" && p.parentAsin && <span className="mr-1 font-normal text-muted-foreground">↳</span>}
                      <Link
                        href={aplusProductDetailHref(p.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          router.push(aplusProductDetailHref(p.id));
                        }}
                        className="hover:underline"
                      >
                        {p.asin}
                      </Link>
                      <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <AmazonPdpLink asin={p.asin} />
                      </span>
                    </div>
                    {p.sku && <div className="font-mono text-xs text-foreground/70">{p.sku}</div>}
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.summarizedTitle ?? p.itemName ?? ""}
                    </div>
                    {existing && (
                      <p className="mt-0.5 text-[10px] font-bold text-brand-red">
                        {versionLabel(existing)} already created
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {p.status && <StatusBadge status={p.status} />}
                    {p.parentageLevel && <ParentageBadge value={p.parentageLevel} />}
                    {p.variationId && (
                      <span className="font-mono text-[10px] text-muted-foreground">{p.variationId}</span>
                    )}
                  </div>
                </div>
                );
              })
            )}
              </div>
            </>
          )}

          {scopeType === "GROUP" && (memberScope === "all" || selected?.variationId) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs">Group ASINs</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedGroupAsins.size} selected
                    {memberScope === "all"
                      ? " · All variations"
                      : membersQ.data?.variationName
                        ? ` · ${membersQ.data.variationName}`
                        : ""}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {membersQ.data?.themeAttributes.map((axis) => {
                    const selectedValues = groupFilters[axis] ?? [];
                    return (
                      <DropdownMenu key={axis}>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="xs">
                            {axis}
                            {selectedValues.length > 0 ? ` (${selectedValues.length})` : ""}
                            <ChevronDown className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {filterOptions(axis).map((value) => (
                            <DropdownMenuCheckboxItem
                              key={value}
                              checked={selectedValues.includes(value)}
                              onCheckedChange={(checked) => toggleFilter(axis, value, checked === true)}
                              onSelect={(event) => event.preventDefault()}
                            >
                              {value}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border">
                <label className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => selectVisible(checked === true)}
                    aria-label="Select visible ASINs"
                  />
                  Select visible ({visibleGroupMembers.length})
                </label>
                <div className="max-h-56 overflow-y-auto">
                  {membersQ.isLoading ? (
                    <p className="p-3 text-xs text-muted-foreground">Loading variation ASINs…</p>
                  ) : membersQ.isError ? (
                    <p className="p-3 text-xs text-brand-red">Failed to load variation ASINs.</p>
                  ) : visibleGroupMembers.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No ASINs match these filters.</p>
                  ) : (
                    visibleGroupMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selectedGroupAsins.has(member.asin)}
                          onCheckedChange={(checked) => toggleGroupAsin(member.asin, checked === true)}
                          aria-label={`Include ${member.asin}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {member.parentageLevel && <ParentageBadge value={member.parentageLevel} />}
                            {memberScope === "all" && member.variationId && (
                              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-500">
                                {member.variationId}
                              </span>
                            )}
                            <Link
                              href={aplusProductDetailHref(member.id)}
                              className="font-mono text-xs font-bold text-brand hover:underline"
                            >
                              {member.asin}
                            </Link>
                            <AmazonPdpLink asin={member.asin} />
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {member.summarizedTitle ?? member.itemName ?? member.sku ?? ""}
                          </p>
                        </div>
                        <div className="flex max-w-56 flex-wrap justify-end gap-1">
                          {membersQ.data?.themeAttributes.map((axis) => {
                            const value = member[axisKey[axis]];
                            return value ? (
                              <span key={axis} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                {axis}: {value}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Marketplace</Label>
            <Select value={marketplace} onValueChange={(v) => setMarketplace(v)}>
              <SelectTrigger className="w-32 mt-1"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {["US","UK","DE","FR","IT","ES","JP","CA","MX","AU","IN","NL","SE","PL","TR","AE","SA","SG","BR","EG"].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col items-stretch sm:flex-col gap-2">
          {selectedExisting && (
            <p className="text-xs font-medium text-brand-red text-left">
              {versionLabel(selectedExisting)} already exists for this {scopeType === "ASIN" ? "ASIN" : scopeType === "GROUP" ? "group" : "variation"} in {marketplace}. Creating will add V{String((selectedExisting.latestVersionNumber ?? selectedExisting.versionCount ?? 1) + 1).padStart(2, "0")} as {aplus2ContentTypeLabel(contentType)}.
            </p>
          )}
          <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={
              !marketplace
              || createMut.isPending
              || (scopeType !== "GROUP" && !productId)
              || (scopeType === "PARENT" && !selected?.variationId)
              || (scopeType === "GROUP" && selectedGroupAsins.size < 2)
              || (scopeType === "GROUP" && !productId && !selectedGroupAnchor)
            }
          >
            {createMut.isPending ? "Creating…" : selectedExisting ? "Add version" : "Create set"}
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
