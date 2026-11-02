"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Layers, Package, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContentGuidelinesForm } from "@/components/content/content-guidelines-form";
import { isGuidelinesPresent, resolveGuidelinesFieldByField } from "@/lib/variation-guidelines";
import type { ContentGuidelines } from "@/lib/variation-guidelines";

// ── Types ──────────────────────────────────────────────────────────────

type GuidelineProduct = {
  id: string;
  asin: string | null;
  itemName: string | null;
  contentGuidelines: ContentGuidelines | null;
};

type GuidelineGroup = {
  id: string;
  name: string;
  contentGuidelines: ContentGuidelines | null;
  products: GuidelineProduct[];
};

type GuidelineVariation = {
  id: string;
  name: string;
  contentGuidelines: ContentGuidelines | null;
  groups: GuidelineGroup[];
};

type HierarchyResponse = { variations: GuidelineVariation[] };

type Client = { clientIdCode: string; clientName: string };

// ── Save helpers ───────────────────────────────────────────────────────

async function patchVariation(variationId: string, gl: ContentGuidelines | null) {
  const res = await fetch(`/api/variations/${variationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentGuidelines: gl }),
  });
  if (!res.ok) throw new Error("Failed to save");
}

async function patchGroup(variationId: string, groupId: string, gl: ContentGuidelines | null) {
  const res = await fetch(`/api/variations/${variationId}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentGuidelines: gl }),
  });
  if (!res.ok) throw new Error("Failed to save");
}

async function patchListing(productId: string, gl: ContentGuidelines | null) {
  const res = await fetch(`/api/guidelines/listings/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentGuidelines: gl }),
  });
  if (!res.ok) throw new Error("Failed to save");
}

// ── Sub-components ─────────────────────────────────────────────────────

function GuidelinesSet({
  label,
  isPresent,
}: {
  label: string;
  isPresent: boolean;
}) {
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border",
        isPresent
          ? "bg-brand/10 text-brand border-brand/30"
          : "bg-muted text-muted-foreground border-border"
      )}
    >
      {isPresent ? label : `No ${label}`}
    </span>
  );
}

function ListingRow({
  product,
  inheritedFrom,
  variationGl,
  groupGl,
}: {
  product: GuidelineProduct;
  inheritedFrom: ContentGuidelines | null;
  variationGl: ContentGuidelines | null;
  groupGl: ContentGuidelines | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<ContentGuidelines>(product.contentGuidelines ?? {});

  const mutation = useMutation({
    mutationFn: (gl: ContentGuidelines | null) => patchListing(product.id, gl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidelines"] });
      toast.success("Listing guidelines saved");
    },
    onError: () => toast.error("Failed to save listing guidelines"),
  });

  const handleBlur = useCallback(() => {
    const hasContent = isGuidelinesPresent(local);
    mutation.mutate(hasContent ? local : null);
  }, [local, mutation]);

  const resolved = resolveGuidelinesFieldByField(null, groupGl, variationGl);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 rounded text-left">
          <ChevronRight className={cn("size-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
          <Package className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground font-medium truncate flex-1">
            {product.asin ?? product.id}
            {product.itemName && (
              <span className="text-muted-foreground font-normal ml-1.5">{product.itemName}</span>
            )}
          </span>
          <GuidelinesSet label="Listing" isPresent={isGuidelinesPresent(product.contentGuidelines)} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-8 border-l border-border pl-3 pb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-4 pt-2 pb-1">
            Listing Guidelines
            <span className="ml-2 normal-case font-normal">
              (overrides group/variation per field)
            </span>
          </div>
          <div onBlur={handleBlur}>
            <ContentGuidelinesForm
              value={local}
              onChange={setLocal}
              inheritedFrom={resolved}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupSection({
  group,
  variationId,
  variationGl,
}: {
  group: GuidelineGroup;
  variationId: string;
  variationGl: ContentGuidelines | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<ContentGuidelines>(group.contentGuidelines ?? {});

  const mutation = useMutation({
    mutationFn: (gl: ContentGuidelines | null) => patchGroup(variationId, group.id, gl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidelines"] });
      toast.success("Group guidelines saved");
    },
    onError: () => toast.error("Failed to save group guidelines"),
  });

  const handleBlur = useCallback(() => {
    const hasContent = isGuidelinesPresent(local);
    mutation.mutate(hasContent ? local : null);
  }, [local, mutation]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 rounded text-left">
          <ChevronRight className={cn("size-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
          <Tag className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate flex-1">{group.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{group.products.length} ASINs</span>
          <GuidelinesSet label="Group" isPresent={isGuidelinesPresent(group.contentGuidelines)} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 border-l border-border pl-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-4 pt-2 pb-1">
            Group Guidelines
          </div>
          <div onBlur={handleBlur}>
            <ContentGuidelinesForm
              value={local}
              onChange={setLocal}
              inheritedFrom={variationGl}
            />
          </div>
          {group.products.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1">
                Listing overrides
              </div>
              {group.products.map((p) => (
                <ListingRow
                  key={p.id}
                  product={p}
                  inheritedFrom={local}
                  variationGl={variationGl}
                  groupGl={local}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function VariationSection({ variation }: { variation: GuidelineVariation }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<ContentGuidelines>(variation.contentGuidelines ?? {});

  const mutation = useMutation({
    mutationFn: (gl: ContentGuidelines | null) => patchVariation(variation.id, gl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidelines"] });
      toast.success("Variation defaults saved");
    },
    onError: () => toast.error("Failed to save variation defaults"),
  });

  const handleBlur = useCallback(() => {
    const hasContent = isGuidelinesPresent(local);
    mutation.mutate(hasContent ? local : null);
  }, [local, mutation]);

  const totalAsins = variation.groups.reduce((n, g) => n + g.products.length, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card mb-3">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 rounded-t-lg">
          <ChevronRight className={cn("size-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
          <Layers className="size-4 text-brand shrink-0" />
          <span className="text-sm font-semibold text-foreground flex-1 truncate">{variation.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {variation.groups.length} groups · {totalAsins} ASINs
          </span>
          <GuidelinesSet label="Defaults" isPresent={isGuidelinesPresent(variation.contentGuidelines)} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Variation Defaults <span className="normal-case font-normal">(baseline for all groups)</span>
            </p>
          </div>
          <div onBlur={handleBlur}>
            <ContentGuidelinesForm value={local} onChange={setLocal} />
          </div>
          {variation.groups.length > 0 && (
            <div className="px-4 pb-4 pt-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Groups</p>
              {variation.groups.map((g) => (
                <GroupSection
                  key={g.id}
                  group={g}
                  variationId={variation.id}
                  variationGl={local}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function GuidelinesPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const { data: clientsData } = useQuery<Client[]>({
    queryKey: ["clients-list"],
    queryFn: () => fetch("/api/clients/list?status=Active").then((r) => r.json()),
  });

  const { data: hierarchyData, isLoading } = useQuery<HierarchyResponse>({
    queryKey: ["guidelines", selectedClient],
    queryFn: () =>
      fetch(`/api/guidelines?clientId=${selectedClient}`).then((r) => r.json()),
    enabled: !!selectedClient,
  });

  const clients = Array.isArray(clientsData) ? clientsData : [];
  const variations = hierarchyData?.variations ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tighter">
          <span className="text-foreground">Content</span>
          <span className="text-brand">Guidelines</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set guidelines at any tier — Listing overrides Group overrides Variation (field-by-field).
        </p>
      </div>

      {/* Client selector */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">
          Client
        </label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">Select a client…</option>
          {clients.map((c) => (
            <option key={c.clientIdCode} value={c.clientIdCode}>
              {c.clientName}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {!selectedClient && (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Select a client above to manage their content guidelines.
        </div>
      )}

      {selectedClient && isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {selectedClient && !isLoading && variations.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No variations found for this client. Create variations in the{" "}
          <a href="/variations" className="text-brand hover:underline">Variation Builder</a>.
        </div>
      )}

      {variations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              {variations.length} variation{variations.length !== 1 ? "s" : ""}
            </p>
            <Button variant="ghost" size="sm" asChild className="text-xs h-7">
              <a href={`/clients/${selectedClient}/brand-guidelines`}>View brand guidelines →</a>
            </Button>
          </div>
          {variations.map((v) => (
            <VariationSection key={v.id} variation={v} />
          ))}
        </div>
      )}
    </div>
  );
}
