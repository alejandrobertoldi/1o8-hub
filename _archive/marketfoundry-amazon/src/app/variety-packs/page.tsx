/* eslint-disable react-doctor/rendering-conditional-render */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PackageOpen,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { hiResAmazonImg } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────

type ClientEntry = { clientIdCode: string; clientName: string };

type ProductEntry = {
  id: string;
  asin: string | null;
  sku: string | null;
  clientIdCode: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  mainImageUrl: string | null;
  parentageLevel?: string | null;
  varietyPackItemCount?: number;
  variations?: Record<string, string> | null;
  isVp?: boolean;
};

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

type VarietyPackProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  clientIdCode: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  mainImageUrl: string | null;
  itemCount: number;
  items: Array<{
    flavor: string | null;
    size: string | null;
    color: string | null;
    style: string | null;
    customLabel: string | null;
    units: number;
    includedAsin: string | null;
    includedSku: string | null;
    includedTitle: string | null;
  }>;
};

// ── Fetchers ──────────────────────────────────────────

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients/list?status=Active");
  if (!res.ok) return [];
  return res.json();
}

async function fetchProducts(client?: string): Promise<ProductEntry[]> {
  const params = new URLSearchParams({ isVp: "true", pageSize: "2000" });
  if (client) params.set("client", client);
  const res = await fetch(`/api/products?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.products)) return data.products;
  return [];
}

async function fetchVarietyPacks(client?: string): Promise<VarietyPackProduct[]> {
  const url = client ? `/api/variety-packs?client=${encodeURIComponent(client)}` : "/api/variety-packs";
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

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
  const payload = {
    items: items.map((it) => ({
      includedProductId: it.includedProductId || null,
      flavor: it.flavor || "",
      size: it.size || "",
      color: it.color || "",
      style: it.style || "",
      customLabel: it.customLabel || "",
      units: it.units,
    })),
  };
  const res = await fetch(`/api/products/${productId}/variety-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save (${res.status}): ${text}`);
  }
}

// ── Page ──────────────────────────────────────────────

export default function VarietyPacksPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");
  // Deep link: /variety-packs?client=HAL_SC_US preselects that client (e.g. from the
  // inventory table's red VP icon). Read after mount so SSR and hydration agree.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("client");
    if (code) setSelectedClient(code);
  }, []);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: fetchClients,
    staleTime: 5 * 60_000,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-for-vp", selectedClient || "all"],
    queryFn: () => fetchProducts(selectedClient || undefined),
    staleTime: 60_000,
  });

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ["variety-packs", selectedClient || "all"],
    queryFn: () => fetchVarietyPacks(selectedClient || undefined),
  });

  // Active-client lookup (dropdown is already status=Active)
  const clientNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.clientIdCode, c.clientName);
    return m;
  }, [clients]);
  const activeClientCodes = useMemo(
    () => new Set(clients.map((c) => c.clientIdCode.toLowerCase())),
    [clients]
  );

  // Group packs by client when showing all — skip inactive clients
  const groupedPacks = useMemo(() => {
    if (selectedClient || packs.length === 0) return null;
    const groups = new Map<string, VarietyPackProduct[]>();
    for (const pack of packs) {
      const key = pack.clientIdCode || "Unknown";
      if (clients.length > 0 && !activeClientCodes.has(key.toLowerCase())) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pack);
    }
    if (groups.size === 0) return null;
    return Array.from(groups.entries()).toSorted(([a], [b]) =>
      (clientNameMap.get(a) || a).localeCompare(clientNameMap.get(b) || b)
    );
  }, [packs, selectedClient, clientNameMap, activeClientCodes, clients.length]);

  // Products filtered by search, excluding those that already have VPs
  const existingVpIds = useMemo(() => new Set(packs.map((p) => p.id)), [packs]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    return products.filter((p) => {
      if (existingVpIds.has(p.id)) return false; // already a defined pack
      if (p.parentageLevel?.toLowerCase() === "parent") return false;
      if (!p.isVp) return false;
      if (!q) return true;
      return (
        p.asin?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.itemName?.toLowerCase().includes(q) ||
        p.summarizedTitle?.toLowerCase().includes(q)
      );
    });
  }, [products, productSearch, existingVpIds]);

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Variety Packs"
        >
          <span className="font-bold text-sidebar-foreground">Variety</span>
          <span className="font-normal text-brand">Packs</span>
        </h1>
      </PageMetaSlot>
      <p className="text-sm text-muted-foreground">
        {packs.length} pack{packs.length !== 1 ? "s" : ""} across active clients.
      </p>

      {/* Client picker + product selector row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={selectedClient || "all"} onValueChange={(v) => { setSelectedClient(v === "all" ? "" : v); setSelectedProduct(null); setProductSearch(""); }}>
          <SelectTrigger className="w-[220px] rounded-md border border-border bg-card text-sm">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All active clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                {c.clientName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search IsVP listings to define as a variety pack…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand-vp focus:outline-none"
          />
        </div>
      </div>

      {/* Product picker — every listing flagged IsVP that does not yet have pack items */}
      {!selectedProduct && (
        <div className="rounded-xl border border-border bg-card">
          {productsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No IsVP listings waiting for a pack definition.
              Toggle IsVP on a product detail page to add one here.
            </p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProduct(p.id); setProductSearch(""); }}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="size-8 rounded border border-border bg-muted overflow-hidden shrink-0">
                    {p.mainImageUrl ? (
                      <img src={hiResAmazonImg(p.mainImageUrl, 100)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <PackageOpen className="size-3 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-brand shrink-0">{p.asin || "—"}</span>
                      {p.sku && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.sku}</span>}
                      {!selectedClient && p.clientIdCode && (
                        <Badge variant="outline" className="text-[9px] shrink-0">{p.clientIdCode}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80 truncate">{p.itemName || p.summarizedTitle || "—"}</p>
                    <VariationChips variations={p.variations} />
                  </div>
                  <Plus className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline composer for selected product */}
      {selectedProduct && (
        <PackComposer
          productId={selectedProduct}
          clientProducts={products}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Existing variety packs */}
      <div className="space-y-3">
        {packsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {selectedClient
              ? "No variety packs for this client. Search a product above to define one."
              : "Select a client to view and manage variety packs."}
          </div>
        ) : groupedPacks ? (
          groupedPacks.map(([clientCode, clientPacks]) => (
            <Fragment key={clientCode}>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
                  {clientNameMap.get(clientCode) || clientCode}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {clientPacks.length}
                </Badge>
                <div className="flex-1 border-t border-border/40" />
              </div>
              {clientPacks.map((pack) => (
                <ExistingPackCard key={pack.id} pack={pack} />
              ))}
            </Fragment>
          ))
        ) : (
          packs.map((pack) => (
            <ExistingPackCard key={pack.id} pack={pack} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Pack Composer (new VP definition) ─────────────────

function PackComposer({ productId, clientProducts, onClose }: { productId: string; clientProducts: ProductEntry[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<PackItem[]>([]);
  const [customOptions, setCustomOptions] = useState<Record<string, Set<string>>>({
    flavor: new Set(), size: new Set(), color: new Set(), style: new Set(),
  });

  const { data: packItems = [], isLoading: packLoading } = useQuery({
    queryKey: ["variety-pack", productId],
    queryFn: () => fetchPackItems(productId),
  });

  const { data: product } = useQuery({
    queryKey: ["product-basic", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.data?.[0] || data;
    },
  });

  // Same-client IsVP listings (siblings endpoint is the primary attribute source)
  const packClient = product?.clientIdCode;
  const availableProducts = useMemo(
    () =>
      clientProducts.filter(
        (p) => p.id !== productId && (!packClient || p.clientIdCode === packClient)
      ),
    [clientProducts, productId, packClient]
  );

  // Siblings — dedicated endpoint extracts flavor/size/color/style from variations JSONB
  const { data: siblings = [] } = useQuery({
    queryKey: ["product-siblings", productId],
    queryFn: () => fetchSiblings(productId),
  });

  // Build available options: siblings first (most reliable), then clientProducts variations, then custom
  const familyOptions = useMemo(() => {
    const opts = { flavor: new Set<string>(), size: new Set<string>(), color: new Set<string>(), style: new Set<string>() };
    for (const s of siblings) {
      if (s.flavor) opts.flavor.add(s.flavor);
      if (s.size) opts.size.add(s.size);
      if (s.color) opts.color.add(s.color);
      if (s.style) opts.style.add(s.style);
    }
    for (const p of availableProducts) {
      const v = p.variations;
      if (v?.Flavor) opts.flavor.add(v.Flavor);
      if (v?.Size) opts.size.add(v.Size);
      if (v?.Color) opts.color.add(v.Color);
      if (v?.Style) opts.style.add(v.Style);
    }
    for (const key of Object.keys(opts) as Array<keyof typeof opts>) {
      for (const v of customOptions[key]) opts[key].add(v);
    }
    return opts;
  }, [siblings, availableProducts, customOptions]);

  // Which attribute columns to show (only if family has them)
  const showFlavor = familyOptions.flavor.size > 0;
  const showSize = familyOptions.size.size > 0;
  const showColor = familyOptions.color.size > 0;
  const showStyle = familyOptions.style.size > 0;
  const noAttributes = !showFlavor && !showSize && !showColor && !showStyle;

  // Init local items from server data
  const initialized = items.length > 0 || packItems.length === 0;
  if (!initialized && packItems.length > 0 && items.length === 0) {
    setItems([...packItems]);
  }

  const saveMutation = useMutation({
    mutationFn: () => savePackItems(productId, items),
    onSuccess: () => {
      toast.success("Variety pack saved");
      queryClient.invalidateQueries({ queryKey: ["variety-pack", productId] });
      queryClient.invalidateQueries({ queryKey: ["variety-packs"] });
      onClose();
    },
    onError: (err) => { console.error("VP save error:", err); toast.error("Failed to save variety pack"); },
  });

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        includedProductId: null, includedAsin: null, includedSku: null,
        includedTitle: null, includedImage: null, flavor: null,
        size: null, color: null, style: null, customLabel: null, units: 1,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof PackItem, value: string | number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    );
  }

  function addCustomOption(field: string, value: string) {
    setCustomOptions((prev) => {
      const next = { ...prev };
      next[field] = new Set(prev[field]);
      next[field].add(value);
      return next;
    });
  }

  if (packLoading) {
    return (
      <div className="rounded-xl border-2 border-brand-vp/30 bg-card p-6 flex items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Build dynamic grid columns — attribute chips + units
  const attrCols = `${showFlavor ? "1fr " : ""}${showSize ? "1fr " : ""}${showColor ? "1fr " : ""}${showStyle ? "1fr " : ""}`;
  const gridCols = noAttributes ? "1fr 80px" : `${attrCols}80px`;

  return (
    <div className="rounded-xl border-2 border-brand-vp/30 bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg border border-border bg-muted overflow-hidden shrink-0">
          {product?.mainImageUrl ? (
            <img src={hiResAmazonImg(product.mainImageUrl, 100)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <PackageOpen className="size-4 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-brand">{product?.asin || "—"}</span>
            <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-brand-vp/15 text-brand-vp border-brand-vp/30">
              New Pack
            </Badge>
          </div>
          <p className="text-xs text-foreground/80 truncate mt-0.5">
            {product?.itemName || product?.summarizedTitle || "Loading…"}
          </p>
        </div>
      </div>

      {/* Column headers */}
      {items.length > 0 && (
        <div className="grid gap-2 px-8" style={{ gridTemplateColumns: gridCols }}>
          {noAttributes && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Custom Label</div>}
          {showFlavor && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Flavor</div>}
          {showSize && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Size</div>}
          {showColor && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Color</div>}
          {showStyle && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Style</div>}
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Units</div>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <span className="text-[10px] text-muted-foreground font-medium shrink-0 w-4 text-center pt-1">{idx + 1}</span>
            <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: gridCols }}>
              {noAttributes && (
                <FieldInput label="" value={item.customLabel || ""} onChange={(v) => updateItem(idx, "customLabel", v)} />
              )}
              {showFlavor && (
                <ChipField
                  options={[...familyOptions.flavor]}
                  value={item.flavor || ""}
                  onChange={(v) => updateItem(idx, "flavor", v)}
                  onAddCustom={(v) => addCustomOption("flavor", v)}
                  placeholder="e.g. Vanilla"
                />
              )}
              {showSize && (
                <ChipField
                  options={[...familyOptions.size]}
                  value={item.size || ""}
                  onChange={(v) => updateItem(idx, "size", v)}
                  onAddCustom={(v) => addCustomOption("size", v)}
                  placeholder="e.g. 4oz"
                />
              )}
              {showColor && (
                <ChipField
                  options={[...familyOptions.color]}
                  value={item.color || ""}
                  onChange={(v) => updateItem(idx, "color", v)}
                  onAddCustom={(v) => addCustomOption("color", v)}
                  placeholder="e.g. Red"
                />
              )}
              {showStyle && (
                <ChipField
                  options={[...familyOptions.style]}
                  value={item.style || ""}
                  onChange={(v) => updateItem(idx, "style", v)}
                  onAddCustom={(v) => addCustomOption("style", v)}
                  placeholder="e.g. Classic"
                />
              )}
              <input
                value={String(item.units)}
                type="number"
                min="1"
                onChange={(e) => updateItem(idx, "units", parseInt(e.target.value) || 1)}
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder-muted-foreground/60 focus:border-brand-vp focus:outline-none text-center"
              />
            </div>
            <button onClick={() => removeItem(idx)} className="shrink-0 p-1 pt-1 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addItem} className="text-xs">
          <Plus className="size-3 mr-1" /> Add Item
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || items.length === 0}
          className="text-xs bg-brand-vp hover:bg-brand-vp/80 text-black"
        >
          {saveMutation.isPending ? "Saving…" : `Save (${items.length} item${items.length !== 1 ? "s" : ""})`}
        </Button>
      </div>
    </div>
  );
}

// ── Existing Pack Card (with inline editing) ──────────

function ExistingPackCard({ pack }: { pack: VarietyPackProduct }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PackItem[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [customOptions, setCustomOptions] = useState<Record<string, Set<string>>>({
    flavor: new Set(), size: new Set(), color: new Set(), style: new Set(),
  });

  const { data: fullItems = [] } = useQuery({
    queryKey: ["variety-pack", pack.id],
    queryFn: () => fetchPackItems(pack.id),
    enabled: editing,
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ["product-siblings", pack.id],
    queryFn: () => fetchSiblings(pack.id),
    enabled: editing,
  });

  // Build same familyOptions as PackComposer
  const familyOptions = useMemo(() => {
    const opts = { flavor: new Set<string>(), size: new Set<string>(), color: new Set<string>(), style: new Set<string>() };
    for (const s of siblings) {
      if (s.flavor) opts.flavor.add(s.flavor);
      if (s.size) opts.size.add(s.size);
      if (s.color) opts.color.add(s.color);
      if (s.style) opts.style.add(s.style);
    }
    // Also seed from existing saved items
    for (const it of fullItems) {
      if (it.flavor) opts.flavor.add(it.flavor);
      if (it.size) opts.size.add(it.size);
      if (it.color) opts.color.add(it.color);
      if (it.style) opts.style.add(it.style);
    }
    for (const key of Object.keys(opts) as Array<keyof typeof opts>) {
      for (const v of customOptions[key]) opts[key].add(v);
    }
    return opts;
  }, [siblings, fullItems, customOptions]);

  const showFlavor = familyOptions.flavor.size > 0;
  const showSize = familyOptions.size.size > 0;
  const showColor = familyOptions.color.size > 0;
  const showStyle = familyOptions.style.size > 0;
  const noAttributes = !showFlavor && !showSize && !showColor && !showStyle;

  function addCustomOption(field: string, value: string) {
    setCustomOptions((prev) => {
      const next = { ...prev };
      next[field] = new Set(prev[field]);
      next[field].add(value);
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: () => savePackItems(pack.id, items),
    onSuccess: () => {
      toast.success("Variety pack updated");
      queryClient.invalidateQueries({ queryKey: ["variety-pack", pack.id] });
      queryClient.invalidateQueries({ queryKey: ["variety-packs"] });
      setEditing(false);
    },
    onError: () => toast.error("Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${pack.id}/variety-pack`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      toast.success("Variety pack removed");
      queryClient.removeQueries({ queryKey: ["variety-pack", pack.id] });
      queryClient.invalidateQueries({ queryKey: ["variety-packs"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  function startEditing() {
    setItems(
      fullItems.length > 0
        ? [...fullItems]
        : [
            {
              includedProductId: null, includedAsin: null, includedSku: null,
              includedTitle: null, includedImage: null, flavor: null,
              size: null, color: null, style: null, customLabel: null, units: 1,
            },
          ]
    );
    setEditing(true);
    setExpanded(true);
  }

  function cancelEditing() {
    setItems([]);
    setEditing(false);
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        includedProductId: null, includedAsin: null, includedSku: null,
        includedTitle: null, includedImage: null, flavor: null,
        size: null, color: null, style: null, customLabel: null, units: 1,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof PackItem, value: string | number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
        <div className="size-10 rounded-lg border border-border bg-muted overflow-hidden shrink-0">
          {pack.mainImageUrl ? (
            <img src={hiResAmazonImg(pack.mainImageUrl, 100)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <PackageOpen className="size-4 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {pack.asin && <span className="font-mono text-xs text-brand shrink-0">{pack.asin}</span>}
            {pack.sku && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{pack.sku}</span>}
            {pack.clientIdCode && <Badge variant="outline" className="text-[9px] shrink-0">{pack.clientIdCode}</Badge>}
            <Badge
              className={`rounded-md px-2 py-0.5 text-[9px] font-bold shrink-0 ${
                pack.itemCount > 0
                  ? "bg-brand-vp/15 text-brand-vp border-brand-vp/30"
                  : "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30"
              }`}
            >
              {pack.itemCount > 0
                ? `${pack.itemCount} unit${pack.itemCount !== 1 ? "s" : ""}`
                : "Needs items"}
            </Badge>
          </div>
          <p className="text-xs text-foreground/80 truncate mt-0.5">
            {pack.itemName || pack.summarizedTitle || "—"}
          </p>
        </div>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteOpen(true);
          }}
          className="shrink-0 p-2 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          <Trash2 className="size-4 text-muted-foreground hover:text-red-500" />
        </span>
        <Link
          href={`/products/${pack.id}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ExternalLink className="size-4 text-muted-foreground hover:text-brand" />
        </Link>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {editing ? (
            <>
              {/* Column headers */}
              {items.length > 0 && (() => {
                const attrCols = `${showFlavor ? "1fr " : ""}${showSize ? "1fr " : ""}${showColor ? "1fr " : ""}${showStyle ? "1fr " : ""}`;
                const gridCols = noAttributes ? "1fr 80px" : `${attrCols}80px`;
                return (
                  <div className="grid gap-2 px-8" style={{ gridTemplateColumns: gridCols }}>
                    {noAttributes && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Custom Label</div>}
                    {showFlavor && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Flavor</div>}
                    {showSize && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Size</div>}
                    {showColor && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Color</div>}
                    {showStyle && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Style</div>}
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Units</div>
                  </div>
                );
              })()}

              {/* Editable items — same ChipField layout as PackComposer */}
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const attrCols = `${showFlavor ? "1fr " : ""}${showSize ? "1fr " : ""}${showColor ? "1fr " : ""}${showStyle ? "1fr " : ""}`;
                  const gridCols = noAttributes ? "1fr 80px" : `${attrCols}80px`;
                  return (
                    <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                      <span className="text-[10px] text-muted-foreground font-medium shrink-0 w-4 text-center pt-1">{idx + 1}</span>
                      <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: gridCols }}>
                        {noAttributes && (
                          <FieldInput label="" value={item.customLabel || ""} onChange={(v) => updateItem(idx, "customLabel", v)} />
                        )}
                        {showFlavor && (
                          <ChipField
                            options={[...familyOptions.flavor]}
                            value={item.flavor || ""}
                            onChange={(v) => updateItem(idx, "flavor", v)}
                            onAddCustom={(v) => addCustomOption("flavor", v)}
                            placeholder="e.g. Vanilla"
                          />
                        )}
                        {showSize && (
                          <ChipField
                            options={[...familyOptions.size]}
                            value={item.size || ""}
                            onChange={(v) => updateItem(idx, "size", v)}
                            onAddCustom={(v) => addCustomOption("size", v)}
                            placeholder="e.g. 4oz"
                          />
                        )}
                        {showColor && (
                          <ChipField
                            options={[...familyOptions.color]}
                            value={item.color || ""}
                            onChange={(v) => updateItem(idx, "color", v)}
                            onAddCustom={(v) => addCustomOption("color", v)}
                            placeholder="e.g. Red"
                          />
                        )}
                        {showStyle && (
                          <ChipField
                            options={[...familyOptions.style]}
                            value={item.style || ""}
                            onChange={(v) => updateItem(idx, "style", v)}
                            onAddCustom={(v) => addCustomOption("style", v)}
                            placeholder="e.g. Classic"
                          />
                        )}
                        <input
                          value={String(item.units)}
                          type="number"
                          min="1"
                          onChange={(e) => updateItem(idx, "units", parseInt(e.target.value) || 1)}
                          className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder-muted-foreground/60 focus:border-brand-vp focus:outline-none text-center"
                        />
                      </div>
                      <button onClick={() => removeItem(idx)} className="shrink-0 p-1 pt-1 text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Edit action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={addItem} className="text-xs">
                  <Plus className="size-3 mr-1" /> Add Item
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={cancelEditing} className="text-xs">Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="text-xs bg-brand-vp hover:bg-brand-vp/80 text-black"
                >
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {pack.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No items defined yet. Add the products included in this pack.
                </p>
              ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {pack.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium text-brand-vp shrink-0">
                      {`${item.units}x`}
                    </span>
                    <div className="min-w-0 flex-1">
                      {(item.includedAsin || item.includedSku) && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {item.includedAsin && <span className="font-mono text-[10px] text-brand">{item.includedAsin}</span>}
                          {item.includedSku && <span className="font-mono text-[9px] text-muted-foreground">{item.includedSku}</span>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {item.flavor && <span className="text-foreground/80">{item.flavor}</span>}
                        {cleanSize(item.size) && <span className="text-muted-foreground">{cleanSize(item.size)}</span>}
                        {item.color && <span className="text-muted-foreground">{item.color}</span>}
                        {item.style && <span className="text-muted-foreground">{item.style}</span>}
                        {item.customLabel && <span className="text-muted-foreground italic">{item.customLabel}</span>}
                        {!item.flavor && !item.size && !item.color && !item.style && !item.customLabel && (
                          <span className="text-muted-foreground italic">Unnamed item</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
              <Button variant="outline" size="sm" onClick={startEditing} className="text-xs">
                {pack.itemCount === 0 ? "Define Pack" : "Edit Pack"}
              </Button>
            </>
          )}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate(undefined, { onSuccess: () => setDeleteOpen(false) })}
        title="Remove variety pack?"
        description={(
          <>
            This will permanently remove the variety pack for{" "}
            <strong className="text-foreground">{pack.asin || pack.sku}</strong>{" "}
            and delete all pack items. This action cannot be undone.
          </>
        )}
        pending={deleteMutation.isPending}
        confirmLabel="Remove pack"
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────

/** Strip "(Pack of N)" from size strings to avoid confusion with VP units */
function cleanSize(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/\s*\(pack\s+of\s+\d+\)/i, "").trim() || null;
}

// ── Chip Field (dropdown with available options) ──────

function ChipField({
  options,
  value,
  onChange,
  onAddCustom,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onAddCustom?: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (value) {
    return (
      <span className="px-2 py-1 rounded text-[10px] font-medium border bg-brand-vp/20 text-brand-vp border-brand-vp/40 flex items-center gap-1 w-fit">
        {value}
        <button type="button" onClick={() => onChange("")} className="hover:text-red-400 ml-0.5 text-[9px]">&times;</button>
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setCustomMode(false); setCustomVal(""); }}
        className="px-2 py-1 rounded text-[10px] font-medium border border-dashed border-border text-muted-foreground hover:border-brand-vp/40 hover:text-brand-vp transition-all"
      >
        + Add
      </button>
      {open && !customMode && (
        <div className="absolute z-20 top-full left-0 mt-1 min-w-[140px] max-h-48 overflow-y-auto rounded-lg border border-brand-vp/30 bg-card shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className="block w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-brand-vp/10 hover:text-brand-vp transition-colors"
              >
                {opt}
              </button>
            ))
          )}
          {onAddCustom && (
            <>
              <div className="border-t border-border" />
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="block w-full text-left px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-brand-vp/10 hover:text-brand-vp transition-colors italic"
              >
                Custom value…
              </button>
            </>
          )}
        </div>
      )}
      {open && customMode && (
        <div className="absolute z-20 top-full left-0 mt-1 min-w-[180px] rounded-lg border border-brand-vp/30 bg-card shadow-lg p-2">
          <div className="flex gap-1">
            <input
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customVal.trim()) {
                  onAddCustom?.(customVal.trim());
                  onChange(customVal.trim());
                  setCustomVal("");
                  setOpen(false);
                }
                if (e.key === "Escape") { setCustomMode(false); setCustomVal(""); }
              }}
              placeholder={placeholder}
              autoFocus
              className="flex-1 rounded border border-brand-vp/30 bg-background px-2 py-1 text-[11px] text-foreground placeholder-muted-foreground/60 focus:border-brand-vp focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (customVal.trim()) {
                  onAddCustom?.(customVal.trim());
                  onChange(customVal.trim());
                  setCustomVal("");
                  setOpen(false);
                }
              }}
              className="px-2 py-1 rounded text-[10px] bg-brand-vp text-white hover:bg-brand-vp/80"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Variation attribute chips ─────────────────────────

const VARIATION_KEYS = ["Flavor", "Size", "Color", "Style"] as const;

function VariationChips({ variations }: { variations?: Record<string, string> | null }) {
  if (!variations) return null;
  const chips = VARIATION_KEYS.map((k) => variations[k]).filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {VARIATION_KEYS.map((k) => {
        const v = variations[k];
        if (!v) return null;
        return (
          <span key={k} className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0 text-[9px]">
            <span className="text-muted-foreground">{k}:</span>
            <span className="font-medium text-foreground/80">{v}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Shared field input ────────────────────────────────

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
      <label className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</label>
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
