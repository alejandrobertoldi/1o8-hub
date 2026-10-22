"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, Plus, Trash2, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Product } from "@/lib/db/schema";

type PackItem = {
  id?: string;
  includedProductId: string | null;
  includedAsin: string | null;
  includedSku: string | null;
  includedTitle: string | null;
  includedImage: string | null;
  flavor: string | null;
  size: string | null;
  color: string | null;
  style: string | null;
  customLabel: string | null;
  units: number;
};

type SiblingProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  mainImageUrl: string | null;
  flavor: string | null;
  size: string | null;
  color: string | null;
  style: string | null;
};

async function fetchPackItems(productId: string): Promise<PackItem[]> {
  const res = await fetch(`/api/products/${productId}/variety-pack`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchSiblings(productId: string): Promise<SiblingProduct[]> {
  const res = await fetch(`/api/products/${productId}/siblings`);
  if (!res.ok) return [];
  return res.json();
}

async function savePackItems(productId: string, items: PackItem[]): Promise<void> {
  const res = await fetch(`/api/products/${productId}/variety-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((it) => ({
        includedProductId: it.includedProductId || null,
        flavor: it.flavor || "",
        size: it.size || "",
        color: it.color || "",
        style: it.style || "",
        customLabel: it.customLabel || "",
        units: it.units,
      })),
    }),
  });
  if (!res.ok) throw new Error("Failed to save");
}

export function VarietyPackSection({
  product,
  readOnly,
}: {
  product: Product;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const productId = product.id;

  const [items, setItems] = useState<PackItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSiblingPicker, setShowSiblingPicker] = useState(false);

  const { data: savedItems = [], isLoading } = useQuery({
    queryKey: ["variety-pack", productId],
    queryFn: () => fetchPackItems(productId),
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ["product-siblings", productId],
    queryFn: () => fetchSiblings(productId),
    enabled: editing || savedItems.length > 0,
  });

  // Use local state when editing, otherwise use server data
  const displayItems = editing && items !== null ? items : savedItems;

  const saveMutation = useMutation({
    mutationFn: () => savePackItems(productId, items || []),
    onSuccess: () => {
      toast.success("Variety pack saved");
      queryClient.invalidateQueries({ queryKey: ["variety-pack", productId] });
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      setEditing(false);
      setItems(null);
    },
    onError: () => toast.error("Failed to save variety pack"),
  });

  function startEditing() {
    setItems([...savedItems]);
    setEditing(true);
  }

  function cancelEditing() {
    setItems(null);
    setEditing(false);
    setShowSiblingPicker(false);
  }

  function addFromSibling(sib: SiblingProduct) {
    const v = (sib as Record<string, unknown>) || {};
    setItems((prev) => [
      ...(prev || []),
      {
        includedProductId: sib.id,
        includedAsin: sib.asin,
        includedSku: sib.sku,
        includedTitle: sib.itemName || sib.summarizedTitle,
        includedImage: sib.mainImageUrl,
        flavor: (v.flavor as string) || null,
        size: (v.size as string) || null,
        color: (v.color as string) || null,
        style: (v.style as string) || null,
        customLabel: null,
        units: 1,
      },
    ]);
    setShowSiblingPicker(false);
  }

  function addCustom() {
    setItems((prev) => [
      ...(prev || []),
      {
        includedProductId: null,
        includedAsin: null,
        includedSku: null,
        includedTitle: null,
        includedImage: null,
        flavor: null,
        size: null,
        color: null,
        style: null,
        customLabel: null,
        units: 1,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => (prev || []).filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof PackItem, value: string | number) {
    setItems((prev) =>
      (prev || []).map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    );
  }

  // Available siblings (not already in pack, not the product itself)
  const usedIds = new Set(
    displayItems.filter((it) => it.includedProductId).map((it) => it.includedProductId)
  );
  const availableSiblings = siblings.filter(
    (s) => s.id !== productId && !usedIds.has(s.id)
  );

  if (isLoading) return null;
  if (savedItems.length === 0 && !editing) {
    // Show a small "Define as variety pack" button
    if (readOnly) return null;
    return (
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 bg-card rounded-lg hover:bg-muted transition-colors">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-4 w-4 text-brand-vp" />
            <span className="text-sm font-medium text-white">Variety Pack</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Define what items are included in this variety pack product.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startEditing();
              addCustom();
            }}
            className="text-xs"
          >
            <PackageOpen className="h-3 w-3 mr-1.5" />
            Define as Variety Pack
          </Button>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Collapsible defaultOpen={savedItems.length > 0}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 bg-card rounded-lg hover:bg-muted transition-colors">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-brand-vp" />
          <span className="text-sm font-medium text-white">Variety Pack</span>
          <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-brand-vp/15 text-brand-vp border-brand-vp/30">
            {displayItems.length} item{displayItems.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-lg border border-border bg-card">
        <div className="p-4 space-y-3">
          {/* Items table */}
          <div className="space-y-2">
            {displayItems.map((item, idx) => (
              <div
                key={item.id || `new-${idx}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                {/* Image thumbnail */}
                <div className="shrink-0 w-10 h-10 rounded border border-border bg-background flex items-center justify-center overflow-hidden">
                  {item.includedImage ? (
                    <img
                      src={item.includedImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <PackageOpen className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title / ASIN row */}
                  <div className="flex items-center gap-2">
                    {item.includedAsin && (
                      <span className="font-mono text-[10px] text-brand shrink-0">
                        {item.includedAsin}
                      </span>
                    )}
                    <span className="text-xs text-foreground/80 truncate">
                      {item.includedTitle || item.customLabel || "Custom item"}
                    </span>
                    {item.includedProductId && (
                      <a
                        href={`/products/${item.includedProductId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-brand transition-colors" />
                      </a>
                    )}
                  </div>

                  {/* Attribute fields */}
                  {editing ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <FieldInput
                        label="Flavor"
                        value={item.flavor || ""}
                        onChange={(v) => updateItem(idx, "flavor", v)}
                      />
                      <FieldInput
                        label="Size"
                        value={item.size || ""}
                        onChange={(v) => updateItem(idx, "size", v)}
                      />
                      <FieldInput
                        label="Color"
                        value={item.color || ""}
                        onChange={(v) => updateItem(idx, "color", v)}
                      />
                      <FieldInput
                        label="Style"
                        value={item.style || ""}
                        onChange={(v) => updateItem(idx, "style", v)}
                      />
                      <FieldInput
                        label="Units"
                        value={String(item.units)}
                        onChange={(v) => updateItem(idx, "units", parseInt(v) || 1)}
                        type="number"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {item.flavor && <AttrChip label="Flavor" value={item.flavor} />}
                      {item.size && <AttrChip label="Size" value={item.size} />}
                      {item.color && <AttrChip label="Color" value={item.color} />}
                      {item.style && <AttrChip label="Style" value={item.style} />}
                      <AttrChip label="Units" value={String(item.units)} />
                    </div>
                  )}
                </div>

                {/* Delete button */}
                {editing && (
                  <button
                    onClick={() => removeItem(idx)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {!editing && !readOnly && (
              <Button variant="outline" size="sm" onClick={startEditing} className="text-xs">
                Edit
              </Button>
            )}
            {editing && (
              <>
                {/* Add sibling picker */}
                {showSiblingPicker ? (
                  <div className="flex-1 min-w-0">
                    <div className="rounded-lg border border-brand-vp/30 bg-background p-2 max-h-48 overflow-y-auto space-y-1">
                      {availableSiblings.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground px-2 py-1">
                          No siblings available
                        </p>
                      ) : (
                        availableSiblings.map((sib) => (
                          <button
                            key={sib.id}
                            onClick={() => addFromSibling(sib)}
                            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-brand-vp/10 transition-colors"
                          >
                            <span className="font-mono text-[10px] text-brand shrink-0">
                              {sib.asin || "—"}
                            </span>
                            <span className="text-xs text-foreground/80 truncate">
                              {sib.itemName || sib.summarizedTitle || "—"}
                            </span>
                          </button>
                        ))
                      )}
                      <button
                        onClick={() => setShowSiblingPicker(false)}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSiblingPicker(true)}
                      className="text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Sibling
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addCustom}
                      className="text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Custom Item
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelEditing}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="text-xs bg-brand-vp hover:bg-brand-vp/80 text-black"
                    >
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[9px] text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder-muted-foreground/60 focus:border-brand-vp focus:outline-none"
        min={type === "number" ? 1 : undefined}
      />
    </div>
  );
}

/** Small badge for the product header — shows "Variety Pack" when items exist */
export function VarietyPackBadge({ productId }: { productId: string }) {
  const { data: items = [] } = useQuery({
    queryKey: ["variety-pack", productId],
    queryFn: () => fetchPackItems(productId),
  });

  if (items.length === 0) return null;

  return (
    <Badge className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold bg-brand-vp/15 text-brand-vp border-brand-vp/30">
      <PackageOpen className="h-3 w-3 mr-1" />
      Variety Pack
    </Badge>
  );
}

function AttrChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/** Card beside the Variations card on the product detail page.
 *  - isVp toggle: editable (PATCH /api/products/[id])
 *  - When active: shows included listings from /api/products/[id]/variety-pack
 */
export function VarietyPackCard({
  product,
  readOnly,
}: {
  product: { id: string; isVp: boolean };
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const productId = product.id;
  const [isVp, setIsVp] = useState(product.isVp);

  useEffect(() => {
    setIsVp(product.isVp);
  }, [product.isVp]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["variety-pack", productId],
    queryFn: () => fetchPackItems(productId),
    enabled: isVp,
  });

  const vpMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVp: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: (_data, value) => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["products-for-vp"] });
      queryClient.invalidateQueries({ queryKey: ["variety-packs"] });
      if (value) {
        queryClient.invalidateQueries({ queryKey: ["variety-pack", productId] });
      }
    },
    onError: (_err, value) => {
      setIsVp(!value); // revert on failure
      toast.error("Failed to save Variety Pack flag");
    },
  });

  function handleToggle(v: boolean) {
    setIsVp(v);
    vpMutation.mutate(v);
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <div className="flex flex-row justify-between items-center px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <PackageOpen className="h-4 w-4 text-brand-vp shrink-0" />
          <span className="text-sm font-semibold">Variety Pack</span>
          {isVp && items.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {items.length} listing{items.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {isVp && (
            <Badge className="rounded-md px-1.5 py-0 h-4 text-[9px] font-bold bg-brand-vp/15 text-brand-vp border-brand-vp/30">
              Active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">IsVP</span>
          <Switch
            checked={isVp}
            disabled={readOnly}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-brand-vp"
          />
        </div>
      </div>

      {isVp ? (
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Included listings
            </p>
            <a
              href="/variety-packs"
              className="text-[10px] text-brand hover:underline shrink-0"
            >
              Manage in builder
            </a>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground py-2">Loading pack items…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No listings linked yet. Use the{" "}
              <a href="/variety-packs" className="text-brand hover:underline">
                Variety Pack builder
              </a>{" "}
              to add included products.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, i) => {
                const title =
                  item.includedTitle ||
                  item.customLabel ||
                  item.includedSku ||
                  item.includedAsin ||
                  "Included item";
                const attrs = [item.flavor, item.size, item.color, item.style].filter(Boolean);
                return (
                  <li
                    key={item.id ?? `${item.includedProductId ?? "x"}-${i}`}
                    className="flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
                  >
                    <span className="inline-flex items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500 font-mono tabular-nums shrink-0 min-w-[2rem]">
                      {item.units}×
                    </span>
                    <div className="relative h-9 w-9 shrink-0 rounded border border-border bg-background overflow-hidden">
                      {item.includedImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.includedImage}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <PackageOpen className="h-3.5 w-3.5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.includedAsin && (
                          <span className="font-mono text-[10px] text-brand shrink-0">
                            {item.includedAsin}
                          </span>
                        )}
                        <span className="text-xs text-foreground truncate">{title}</span>
                      </div>
                      {attrs.length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {attrs.join(" · ")}
                        </p>
                      )}
                    </div>
                    {item.includedProductId && (
                      <a
                        href={`/products/${item.includedProductId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Open listing"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Toggle IsVP on to mark this listing as a variety pack and show included listings.
          </p>
        </div>
      )}
    </div>
  );
}
