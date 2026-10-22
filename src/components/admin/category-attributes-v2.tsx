"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Upload,
  Loader2,
  ChevronDown,
  ChevronRight,
  Package,
  AlertTriangle,
} from "lucide-react";

const REQUIREMENT_ORDER = [
  "Required",
  "Conditionally Required",
  "Recommended",
  "Optional",
] as const;

interface CategorySummary {
  productType: string;
  marketplaceId: string;
  clientCount: number;
  attrCount: number;
  divergentCount: number;
}

interface CategoryDetailClient {
  clientIdCode: string;
  clientName: string | null;
  lastUploadedAt: string;
  attrCount: number;
  divergentCount: number;
}

interface CategoryDetailAttribute {
  uuid: string;
  hubLabel: string | null;
  referenceGroup: string | null;
  referenceSubgroup: string | null;
  requirement: string | null;
  description: string | null;
  validValues: string | null;
  contributingClients: string[];
  divergentClientCount: number;
}

interface AacClient {
  clientIdCode: string;
  clientName: string | null;
}

export function CategoryAttributesV2() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedAttrUuid, setSelectedAttrUuid] = useState<string | null>(null);
  const [uploadClient, setUploadClient] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [refGroupFilter, setRefGroupFilter] = useState<string>("all");

  const { data: clientsData } = useQuery({
    queryKey: ["aac-clients"],
    queryFn: async () => {
      const res = await fetch("/api/aac");
      if (!res.ok) throw new Error("Failed to load clients");
      return (await res.json()) as { clients: AacClient[] };
    },
  });
  const clients = clientsData?.clients ?? [];

  const { data: categoriesData, isLoading: catLoading } = useQuery({
    queryKey: ["attributes-categories"],
    queryFn: async () => {
      const res = await fetch("/api/attributes/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return (await res.json()) as { categories: CategorySummary[] };
    },
  });
  const categories = useMemo(
    () => categoriesData?.categories ?? [],
    [categoriesData]
  );

  const visibleCategories = useMemo(() => {
    if (clientFilter === "all") return categories;
    // Filter top-level rows to those that include the selected client.
    // Client filter requires loading detail per category to know its
    // client list; we hide rows whose clientCount=0 and otherwise show all
    // and rely on the detail panel to confirm membership. This is a
    // best-effort filter at the summary level; detail view is the source
    // of truth.
    return categories.filter((c) => c.clientCount > 0);
  }, [categories, clientFilter]);

  const uploadMutation = useMutation({
    mutationFn: async (args: { file: File; clientIdCode: string }) => {
      const fd = new FormData();
      fd.append("file", args.file);
      fd.append("clientIdCode", args.clientIdCode);
      const res = await fetch("/api/category-definitions", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        `Upload OK · canonical: ${data.attributesMaster?.canonicalInserted ?? 0} new, ${data.attributesMaster?.canonicalMatched ?? 0} matched, ${data.attributesMaster?.divergencesDetected ?? 0} divergences`
      );
      queryClient.invalidateQueries({ queryKey: ["attributes-categories"] });
      queryClient.invalidateQueries({ queryKey: ["category-detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleUploadClick() {
    if (!uploadClient) return;
    fileInputRef.current?.click();
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadClient) {
      uploadMutation.mutate({ file, clientIdCode: uploadClient });
    }
    e.target.value = "";
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">Admin access required.</p>
    );
  }

  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0"
            aria-label="Attribute Manager"
          >
            <span className="font-bold text-sidebar-foreground">Attribute</span>
            <span className="font-normal text-brand">Manager</span>
          </h1>
          <div className="flex items-center gap-2">
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {c.clientName ?? c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {visibleCategories.length} categor{visibleCategories.length === 1 ? "y" : "ies"}
            </span>
            <div className="w-px h-5 bg-sidebar-border/60 mx-1" />
            <Select value={uploadClient} onValueChange={setUploadClient}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {c.clientName ?? c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!uploadClient || uploadMutation.isPending}
              onClick={handleUploadClick}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="size-3.5 mr-1" />
              )}
              Upload XLSM
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>
      </PageMetaSlot>

      {catLoading ? (
        <p className="text-sm text-muted-foreground/70">Loading categories…</p>
      ) : visibleCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Package className="size-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No categories yet. Upload a Category Listing Report (.xlsm) above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCategories.map((cat) => {
            const key = `${cat.productType}::${cat.marketplaceId}`;
            const expanded = expandedKey === key;
            return (
              <CategoryRow
                key={key}
                summary={cat}
                expanded={expanded}
                onToggle={() => setExpandedKey(expanded ? null : key)}
                onSelectAttribute={setSelectedAttrUuid}
                refGroupFilter={refGroupFilter}
                clientFilter={clientFilter}
              />
            );
          })}
        </div>
      )}

      <AttributeSidePanel
        attributeUuid={selectedAttrUuid}
        onClose={() => setSelectedAttrUuid(null)}
      />
    </div>
  );
}

function CategoryRow(props: {
  summary: CategorySummary;
  expanded: boolean;
  onToggle: () => void;
  onSelectAttribute: (uuid: string) => void;
  refGroupFilter: string;
  clientFilter: string;
}) {
  const { summary, expanded, onToggle, onSelectAttribute, clientFilter } = props;
  const { data, isLoading } = useQuery({
    queryKey: [
      "category-detail",
      summary.productType,
      summary.marketplaceId,
    ],
    enabled: expanded,
    queryFn: async () => {
      const res = await fetch(
        `/api/attributes/categories/${encodeURIComponent(summary.productType)}/${encodeURIComponent(summary.marketplaceId)}`
      );
      if (!res.ok) throw new Error("Failed to load detail");
      return (await res.json()) as {
        productType: string;
        marketplaceId: string;
        clients: CategoryDetailClient[];
        attributes: CategoryDetailAttribute[];
      };
    },
  });

  // Group attributes by requirement, ordered Required → Conditional → Recommended → Optional → Other.
  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ requirement: string; attrs: CategoryDetailAttribute[] }>;
    const buckets = new Map<string, CategoryDetailAttribute[]>();
    for (const a of data.attributes) {
      const key = a.requirement ?? "Other";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(a);
    }
    const ordered: Array<{ requirement: string; attrs: CategoryDetailAttribute[] }> = [];
    for (const req of REQUIREMENT_ORDER) {
      const attrs = buckets.get(req);
      if (attrs && attrs.length) ordered.push({ requirement: req, attrs });
      buckets.delete(req);
    }
    for (const [requirement, attrs] of buckets) ordered.push({ requirement, attrs });
    return ordered;
  }, [data]);

  // If a client filter is set, hide categories that don't include that client.
  // (After hooks, never before — keep hook order stable across renders.)
  if (
    clientFilter !== "all" &&
    data &&
    !data.clients.some((c) => c.clientIdCode === clientFilter)
  ) {
    return null;
  }

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 hover:bg-accent/30 text-left">
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <span className="font-medium truncate">
              {summary.productType}
              <span className="text-muted-foreground"> / {summary.marketplaceId}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap">
            <span>{summary.clientCount} client{summary.clientCount === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{summary.attrCount} attrs</span>
            {summary.divergentCount > 0 && (
              <>
                <span>·</span>
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  <AlertTriangle className="size-3 mr-1" />
                  {summary.divergentCount} divergent
                </Badge>
              </>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 py-3 border-x border-b border-border rounded-b-md bg-background">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data ? (
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Clients in this category
              </h3>
              <div className="space-y-1">
                {data.clients.map((c) => (
                  <div
                    key={c.clientIdCode}
                    className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-b-0"
                  >
                    <span className="font-medium">{c.clientName ?? c.clientIdCode}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.lastUploadedAt).toLocaleDateString()} ·
                      {" "}{c.attrCount} attrs · {c.divergentCount} divergent
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Canonical attributes
              </h3>
              <div className="space-y-4">
                {grouped.map(({ requirement, attrs }) => (
                  <div key={requirement}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <RequirementBadge requirement={requirement} />
                      <span className="text-xs text-muted-foreground">
                        {attrs.length}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {attrs.map((a) => (
                        <button
                          key={a.uuid}
                          onClick={() => onSelectAttribute(a.uuid)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-accent/30 text-left text-sm"
                        >
                          <span className="truncate">{a.hubLabel ?? "(unnamed)"}</span>
                          <span className="flex items-center gap-1 text-xs">
                            {a.contributingClients.slice(0, 3).map((cc) => (
                              <Badge key={cc} variant="secondary" className="h-5 text-[10px]">
                                {cc}
                              </Badge>
                            ))}
                            {a.contributingClients.length > 3 && (
                              <span className="text-muted-foreground">
                                +{a.contributingClients.length - 3}
                              </span>
                            )}
                            {a.divergentClientCount > 0 && (
                              <Badge variant="outline" className="h-5 text-[10px] border-amber-500 text-amber-600">
                                ⚠ {a.divergentClientCount} diverge
                              </Badge>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AttributeSidePanel(props: {
  attributeUuid: string | null;
  onClose: () => void;
}) {
  const { attributeUuid, onClose } = props;
  const open = attributeUuid !== null;
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);

  // For Phase 1 we fetch the attribute detail by hitting the categories
  // endpoint for every (pt, mp) the attr lives in — but the simpler path
  // is a dedicated lookup against attributes_master + provenance. To
  // keep the plan additive we reuse a small inline endpoint via fetch.
  const { data, isLoading } = useQuery({
    queryKey: ["attribute-detail", attributeUuid],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/attributes/detail?uuid=${attributeUuid}`);
      if (!res.ok) throw new Error("Failed to load attribute");
      return (await res.json()) as {
        canonical: {
          uuid: string;
          hubLabel: string | null;
          referenceGroup: string | null;
          referenceSubgroup: string | null;
          requirement: string | null;
          description: string | null;
          validValues: string | null;
          requirementMap: Record<string, string> | null;
          descriptionMap: Record<string, string> | null;
          validValuesMap: Record<string, string[]> | null;
          clrLabel: string | null;
          format: string | null;
          pgType: string | null;
          bqType: string | null;
        };
        divergences: Array<{
          clientIdCode: string;
          clientName: string | null;
          productType: string;
          marketplaceId: string;
          clientRequirement: string | null;
          clientDescription: string | null;
          clientValidValues: string[] | null;
          canonicalRequirement: string | null;
          canonicalDescription: string | null;
          canonicalValidValues: string[] | null;
        }>;
      };
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (args: {
      attributeUuid: string;
      clientIdCode: string;
      productType: string;
      marketplaceId: string;
      field: "requirement" | "description" | "validValues";
    }) => {
      const res = await fetch("/api/attributes/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Promote failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Canonical updated");
      queryClient.invalidateQueries({ queryKey: ["attribute-detail", attributeUuid] });
      queryClient.invalidateQueries({ queryKey: ["category-detail"] });
      queryClient.invalidateQueries({ queryKey: ["attributes-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.canonical.hubLabel ?? "Attribute"}</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading…</p>
        ) : data ? (
          <div className="mt-4 space-y-4">
            <section className="text-sm space-y-1">
              <Field label="Group" value={data.canonical.referenceGroup} />
              <Field label="Subgroup" value={data.canonical.referenceSubgroup} />
              <ScalarBreakdownField
                label="Requirement"
                map={data.canonical.requirementMap}
              />
              <Field label="Format" value={data.canonical.format} />
              <Field label="PG type" value={data.canonical.pgType} />
              <Field label="BQ type" value={data.canonical.bqType} />
              <Field label="CLR label" value={data.canonical.clrLabel} />
              <ArrayBreakdownField
                label="Valid values"
                map={data.canonical.validValuesMap}
              />
              <ScalarBreakdownField
                label="Description"
                map={data.canonical.descriptionMap}
              />
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Per-client divergences ({data.divergences.length})
              </h3>
              {data.divergences.length === 0 ? (
                <p className="text-xs text-muted-foreground">All clients match canonical.</p>
              ) : (
                <div className="space-y-3">
                  {data.divergences.map((d) => (
                    <div
                      key={`${d.clientIdCode}::${d.productType}::${d.marketplaceId}`}
                      className="rounded border border-border p-2 text-xs space-y-1"
                    >
                      <div className="font-medium">
                        {d.clientName ?? d.clientIdCode}
                        <span className="text-muted-foreground">
                          {" "}· {d.productType} / {d.marketplaceId}
                        </span>
                      </div>
                      {d.clientRequirement !== null && (
                        <DivergeRow
                          label="Requirement"
                          canonical={d.canonicalRequirement}
                          client={d.clientRequirement}
                          canPromote={isAdmin && !promoteMutation.isPending}
                          onPromote={() =>
                            promoteMutation.mutate({
                              attributeUuid: data.canonical.uuid,
                              clientIdCode: d.clientIdCode,
                              productType: d.productType,
                              marketplaceId: d.marketplaceId,
                              field: "requirement",
                            })
                          }
                        />
                      )}
                      {d.clientDescription !== null && (
                        <DivergeRow
                          label="Description"
                          canonical={d.canonicalDescription}
                          client={d.clientDescription}
                          canPromote={isAdmin && !promoteMutation.isPending}
                          onPromote={() =>
                            promoteMutation.mutate({
                              attributeUuid: data.canonical.uuid,
                              clientIdCode: d.clientIdCode,
                              productType: d.productType,
                              marketplaceId: d.marketplaceId,
                              field: "description",
                            })
                          }
                        />
                      )}
                      {d.clientValidValues !== null && (
                        <DivergeRow
                          label="Valid values"
                          canonical={
                            d.canonicalValidValues
                              ? JSON.stringify(d.canonicalValidValues)
                              : null
                          }
                          client={JSON.stringify(d.clientValidValues)}
                          canPromote={isAdmin && !promoteMutation.isPending}
                          onPromote={() =>
                            promoteMutation.mutate({
                              attributeUuid: data.canonical.uuid,
                              clientIdCode: d.clientIdCode,
                              productType: d.productType,
                              marketplaceId: d.marketplaceId,
                              field: "validValues",
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field(props: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{props.label}</span>
      <span className="flex-1 min-w-0 break-words whitespace-pre-wrap">
        {props.value ?? "—"}
      </span>
    </div>
  );
}

function ScalarBreakdownField(props: {
  label: string;
  map: Record<string, string> | null;
}) {
  const entries = props.map ? Object.entries(props.map) : [];
  if (entries.length === 0) {
    return <Field label={props.label} value={null} />;
  }
  if (entries.length === 1 && entries[0][0] === "ALL") {
    return <Field label={props.label} value={entries[0][1]} />;
  }
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{props.label}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[12px]">
            <span className="text-muted-foreground/80 w-32 shrink-0">{k}</span>
            <span className="flex-1 min-w-0 break-words whitespace-pre-wrap">
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrayBreakdownField(props: {
  label: string;
  map: Record<string, string[]> | null;
}) {
  const entries = props.map ? Object.entries(props.map) : [];
  if (entries.length === 0) {
    return <Field label={props.label} value={null} />;
  }
  if (entries.length === 1 && entries[0][0] === "ALL") {
    return <Field label={props.label} value={entries[0][1].join(", ")} />;
  }
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{props.label}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[12px]">
            <span className="text-muted-foreground/80 w-32 shrink-0">{k}</span>
            <span className="flex-1 min-w-0 break-words whitespace-pre-wrap">
              {v.join(", ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DivergeRow(props: {
  label: string;
  canonical: string | null;
  client: string | null;
  canPromote: boolean;
  onPromote: () => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{props.label}</span>
        {props.canPromote && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={props.onPromote}
          >
            Promote to canonical
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        <div className="rounded bg-muted/40 px-1.5 py-0.5">
          <span className="text-muted-foreground">canonical:</span> {props.canonical ?? "—"}
        </div>
        <div className="rounded bg-amber-500/10 px-1.5 py-0.5">
          <span className="text-muted-foreground">client:</span> {props.client ?? "—"}
        </div>
      </div>
    </div>
  );
}

function RequirementBadge({ requirement }: { requirement: string | null }) {
  switch (requirement) {
    case "Required":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-2 py-0.5 border-red-500/50 text-red-400"
        >
          Required
        </Badge>
      );
    case "Conditionally Required":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-2 py-0.5 border-amber-500/50 text-amber-400"
        >
          Conditional
        </Badge>
      );
    case "Recommended":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-2 py-0.5 border-blue-500/50 text-blue-400"
        >
          Recommended
        </Badge>
      );
    case "Optional":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-2 py-0.5 border-border text-muted-foreground"
        >
          Optional
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-2 py-0.5 border-border text-muted-foreground"
        >
          {requirement ?? "Other"}
        </Badge>
      );
  }
}
