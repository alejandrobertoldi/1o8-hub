/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, RefreshCw, Lock, Unlock, Trash2 } from "lucide-react";
import type { ForecastToolVersion } from "@/lib/db/schema";

interface ProductOption {
  asin: string | null;
  sku: string | null;
  title: string | null;
  price: string | null;
  variations: Record<string, string> | null;
  variationGroup: string | null;
  parentageLevel: string | null;
  varietyPackItemCount?: number;
  vpFlavors?: string[] | null;
}

interface VersionManagerProps {
  clientIdCode: string;
  versions: ForecastToolVersion[];
  activeVersionId: string | null;
  onVersionChange: (versionId: string, periods?: { historicStart?: string; forecastStart?: string; forecastEnd?: string }) => void;
}

export function VersionManager({
  clientIdCode,
  versions,
  activeVersionId,
  onVersionChange,
}: VersionManagerProps) {
  const [showNameInput, setShowNameInput] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedAsinsDraft, setSelectedAsinsDraft] = useState<{ key: string; value: Set<string> }>({
    key: "",
    value: new Set(),
  });
  const [sortCol, setSortCol] = useState<string | null>("varId");
  const [sortAsc, setSortAsc] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Period selection for new version
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [newHistoricStart, setNewHistoricStart] = useState("2025-01");
  const [newForecastStart, setNewForecastStart] = useState(currentMonth);
  const [newForecastEnd, setNewForecastEnd] = useState("2026-12");

  // Fetch products for ASIN picker (exclude Parent ASINs — not needed for forecasting)
  const { data: products } = useQuery<ProductOption[]>({
    queryKey: ["forecast-tool-products", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast-tool/products?clientIdCode=${clientIdCode}`);
      if (!res.ok) throw new Error("Failed to fetch products");
      const all: ProductOption[] = await res.json();
      return all.filter((p) => p.parentageLevel !== "Parent");
    },
    enabled: showPicker,
  });

  const productsKey = products?.map((p) => `${p.asin ?? ""}:${p.sku ?? ""}`).join("|") ?? "";
  const selectedAsins =
    selectedAsinsDraft.key === productsKey
      ? selectedAsinsDraft.value
      : new Set((products ?? []).map((_, i) => String(i)));
  const setSelectedAsinsForProducts = (value: Set<string>) => {
    setSelectedAsinsDraft({ key: productsKey, value });
  };

  const toggleAsin = (idx: string) => {
    setSelectedAsinsDraft((prev) => {
      const current = prev.key === productsKey ? prev.value : selectedAsins;
      const next = new Set(current);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { key: productsKey, value: next };
    });
  };

  const createVersion = useMutation({
    mutationFn: async ({ name, asins, skus, historicStart, forecastStart, forecastEnd }: { name: string; asins: string[]; skus?: string[]; historicStart: string; forecastStart: string; forecastEnd: string }) => {
      const res = await fetch("/api/ppc/forecast-tool/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, name, asins, skus, historicStart, forecastStart, forecastEnd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create version");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
      onVersionChange(data.version.id, {
        historicStart: newHistoricStart,
        forecastStart: newForecastStart,
        forecastEnd: newForecastEnd,
      });
      setShowNameInput(false);
      setShowPicker(false);
      setNewName("");
      setSelectedAsinsForProducts(new Set());
    },
  });

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  const refreshHistorical = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ppc/forecast-tool/versions/${activeVersionId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to refresh");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
    },
  });

  const toggleLock = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ppc/forecast-tool/versions/${activeVersionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !activeVersion?.isLocked }),
      });
      if (!res.ok) throw new Error("Failed to toggle lock");
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["forecast-tool", clientIdCode] });
      const prev = queryClient.getQueryData(["forecast-tool", clientIdCode, activeVersionId]);
      queryClient.setQueryData(["forecast-tool", clientIdCode, activeVersionId], (old: any) => {
        if (!old?.activeVersion) return old;
        return { ...old, activeVersion: { ...old.activeVersion, isLocked: !old.activeVersion.isLocked }, versions: old.versions.map((v: any) => v.id === activeVersionId ? { ...v, isLocked: !v.isLocked } : v) };
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["forecast-tool", clientIdCode, activeVersionId], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
    },
  });

  const pushToForecast = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ppc/forecast-tool/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: activeVersionId }),
      });
      if (!res.ok) throw new Error("Failed to push");
      return res.json();
    },
  });

  const deleteVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(`/api/ppc/forecast-tool/versions/${versionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete version");
      }
      return res.json();
    },
    onSuccess: () => {
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
      // Switch to another version if the deleted one was active
      const remaining = versions.filter((v) => v.id !== deleteConfirm);
      if (remaining.length > 0) {
        onVersionChange(remaining[0].id);
      }
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
      <select
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={activeVersionId || ""}
        onChange={(e) => {
          const v = versions.find((ver) => ver.id === e.target.value);
          onVersionChange(e.target.value, v ? {
            historicStart: v.historicStart ?? undefined,
            forecastStart: v.forecastStart ?? undefined,
            forecastEnd: v.forecastEnd ?? undefined,
          } : undefined);
        }}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}{v.isCurrent ? " (current)" : ""}{v.isLocked ? " \uD83D\uDD12" : ""}
          </option>
        ))}
        {versions.length === 0 && <option value="">No versions</option>}
      </select>

      {showPicker ? (
        <div className="flex items-center gap-1">
          <button type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${!newName || selectedAsins.size === 0 ? "bg-stone-300 text-stone-500 dark:bg-zinc-700 dark:text-zinc-500 cursor-not-allowed" : "bg-brand-solid text-white hover:bg-brand-solid-hover"}`}
            onClick={() => {
              if (!newName || selectedAsins.size === 0 || !products) return;
              const selected = [...selectedAsins].map(Number).map((i) => products[i]).filter(Boolean);
              const asins = selected.map((p) => p.asin).filter(Boolean) as string[];
              const skus = selected.filter((p) => !p.asin && p.sku).map((p) => p.sku) as string[];
              createVersion.mutate({ name: newName, asins, skus, historicStart: newHistoricStart, forecastStart: newForecastStart, forecastEnd: newForecastEnd });
            }}
            disabled={!newName || selectedAsins.size === 0 || createVersion.isPending}
          >
            {createVersion.isPending ? "Creating…" : !newName ? "Name required" : `Create (${selectedAsins.size} ASINs)`}
          </button>
          <button type="button"
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => { setShowPicker(false); setNewName(""); setSelectedAsinsForProducts(new Set()); }}
          >
            Cancel
          </button>
          {createVersion.isError && (
            <span className="text-xs text-red-500">{(createVersion.error as Error)?.message || "Failed"}</span>
          )}
        </div>
      ) : (
        <button type="button"
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={() => setShowPicker(true)}
        >
          + New Version
        </button>
      )}

      {activeVersionId && (
        <button aria-label="Push rolled-up sales & spend data to the Sales Forecast editor" type="button"
          className="rounded-lg bg-brand-green px-3 py-2 text-sm font-bold text-white hover:opacity-90"
          onClick={() => pushToForecast.mutate()}
          disabled={pushToForecast.isPending}
          title="Push rolled-up sales & spend data to the Sales Forecast editor"
        >
          {pushToForecast.isPending ? "Pushing…" : "Push to Sales Forecast"}
        </button>
      )}

      {activeVersionId && (
        <>
          <button type="button"
            className="rounded-lg border border-stone-300 px-2.5 py-2 text-sm hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => refreshHistorical.mutate()}
            disabled={refreshHistorical.isPending || activeVersion?.isLocked}
            title={activeVersion?.isLocked ? "Unlock version first to refresh" : "Re-fetch historical data from Redshift"}
          >
            <RefreshCw className={`size-5 ${refreshHistorical.isPending ? "animate-spin" : ""}`} />
          </button>
          <button type="button"
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              activeVersion?.isLocked
                ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400"
                : "border-stone-300 hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            } disabled:opacity-50`}
            onClick={() => toggleLock.mutate()}
            disabled={toggleLock.isPending}
            title={activeVersion?.isLocked ? "Unlock version to allow historical data updates" : "Lock version to prevent historical data changes"}
          >
            {activeVersion?.isLocked ? <Lock className="size-5" /> : <Unlock className="size-5" />}
          </button>
          {deleteConfirm === activeVersionId ? (
            <div className="flex items-center gap-1">
              <button type="button"
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => deleteVersion.mutate(activeVersionId!)}
                disabled={deleteVersion.isPending}
              >
                {deleteVersion.isPending ? "Deleting…" : "Confirm Delete"}
              </button>
              <button type="button"
                className="rounded-lg border border-stone-300 p-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button aria-label="Delete this version" type="button"
              className="rounded-lg border border-stone-300 px-2.5 py-2 text-sm text-red-400 hover:bg-red-50 hover:border-red-300 dark:border-zinc-700 dark:hover:bg-red-950 dark:hover:border-red-800 disabled:opacity-50"
              onClick={() => setDeleteConfirm(activeVersionId)}
              title="Delete this version"
            >
              <Trash2 className="size-5" />
            </button>
          )}
        </>
      )}

      {refreshHistorical.isSuccess && (
        <span className="text-xs text-brand">Historical refreshed</span>
      )}
      {refreshHistorical.isError && (
        <span className="text-xs text-red-500">{(refreshHistorical.error as Error)?.message || "Refresh failed"}</span>
      )}
      {pushToForecast.isSuccess && (
        <span className="text-xs text-brand-green">Pushed!</span>
      )}
      </div>

      {/* Step 1: Name & Period */}
      {showPicker && (
        <div className="mt-3 rounded-lg border-2 border-brand/40 bg-brand/5 dark:bg-brand/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-brand-solid text-white text-xs font-bold">1</span>
            <h3 className="text-sm font-bold text-foreground">Version Name & Period</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="version-name-337" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Version Name</label>
              <input id="version-name-337" aria-label="e.g. Q3 2026 Forecast"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                placeholder="e.g. Q3 2026 Forecast"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="historic-start-348" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Historic Start</label>
                <input id="historic-start-348"
                  type="month"
                  className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={newHistoricStart}
                  onChange={(e) => setNewHistoricStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="forecast-start-357" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Forecast Start</label>
                <input id="forecast-start-357"
                  type="month"
                  className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={newForecastStart}
                  onChange={(e) => setNewForecastStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="forecast-end-366" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Forecast End</label>
                <input id="forecast-end-366"
                  type="month"
                  className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={newForecastEnd}
                  onChange={(e) => setNewForecastEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{newHistoricStart}</span>
            <span>→</span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{newForecastStart}</span>
            <span className="text-brand font-semibold">historic</span>
            <span className="mx-1">|</span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{newForecastStart}</span>
            <span>→</span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{newForecastEnd}</span>
            <span className="text-brand font-semibold">forecast</span>
          </div>
        </div>
      )}

      {/* Step 2: ASIN picker table */}
      {showPicker && products && (
        <div className="rounded-lg border border-stone-200 dark:border-zinc-700 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 dark:bg-zinc-800/50 border-b border-stone-200 dark:border-zinc-700">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-brand-solid text-white text-xs font-bold">2</span>
            <span className="text-sm font-bold text-foreground">Select Products</span>
            <span className="text-xs text-muted-foreground ml-2">({selectedAsins.size}/{products.length} selected)</span>
            <div className="flex gap-2 ml-auto">
              <button type="button" className="text-xs text-brand hover:underline" onClick={() => setSelectedAsinsForProducts(new Set(products.map((_, i) => String(i))))}>Select all</button>
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSelectedAsinsForProducts(new Set())}>Clear</button>
            </div>
          </div>
          <div className="max-h-[350px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-stone-100 dark:bg-zinc-800 border-b border-stone-200 dark:border-zinc-700">
                  <th className="w-8 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedAsins.size === products.length && products.length > 0}
                      ref={(el) => { if (el) el.indeterminate = selectedAsins.size > 0 && selectedAsins.size < products.length; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedAsins.size > 0) {
                          setSelectedAsinsForProducts(new Set());
                        } else {
                          setSelectedAsinsForProducts(new Set(products.map((_, i) => String(i))));
                        }
                      }}
                      readOnly
                      className="rounded border-stone-300 cursor-pointer"
                    />
                  </th>
                  {(() => {
                    const themeAttrs = ["Flavor", "Color", "Size", "Style"];
                    const presentAttrs = themeAttrs.filter((attr) =>
                      products.some((p) => {
                        const v = (p.variations || {}) as Record<string, string>;
                        if (v[attr] && v[attr] !== "") return true;
                        if (attr === "Flavor" && p.vpFlavors?.length) return true;
                        return false;
                      })
                    );
                    return [
                      { key: "asin", label: "ASIN", align: "left" },
                      { key: "sku", label: "SKU", align: "left" },
                      { key: "title", label: "Title", align: "left" },
                      { key: "varId", label: "Var ID", align: "left" },
                      { key: "vp", label: "VP", align: "left" },
                      ...presentAttrs.map((a) => ({ key: a.toLowerCase(), label: a, align: "left" })),
                      { key: "price", label: "Price", align: "right" },
                    ];
                  })().map((col) => (
                    <th
                      key={col.key}
                      className={`p-2 font-semibold cursor-pointer select-none hover:text-brand transition-colors ${col.align === "right" ? "text-right" : "text-left"}`}
                      onClick={() => { if (sortCol === col.key) setSortAsc(!sortAsc); else { setSortCol(col.key); setSortAsc(true); } }}
                    >
                      {col.label}
                      {sortCol === col.key && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const indexed = products.map((p, i) => ({ p, i, vars: (p.variations || {}) as Record<string, string> }));

                  if (sortCol) {
                    const getVal = (item: typeof indexed[0]): string => {
                      const { p, vars } = item;
                      switch (sortCol) {
                        case "asin": return p.asin || "";
                        case "sku": return p.sku || "";
                        case "title": return p.title || "";
                        case "varId": return vars.VariationID || "";
                        case "vp": return p.variationGroup || "";
                        case "flavor": return vars.Flavor || "";
                        case "color": return vars.Color || "";
                        case "size": return vars.Size || "";
                        case "price": return String(parseFloat(p.price || "0") || 0).padStart(10, "0");
                        default: return "";
                      }
                    };
                    indexed.sort((a, b) => {
                      const cmp = getVal(a).localeCompare(getVal(b), undefined, { numeric: true });
                      return sortAsc ? cmp : -cmp;
                    });
                  }
                  return indexed;
                })().map(({ p, i, vars }) => {
                  const selected = selectedAsins.has(String(i));
                  return (
                    <tr
                      key={i}
                      className={`border-b border-stone-100 dark:border-zinc-800 cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-zinc-800 ${selected ? "" : "opacity-40"}`}
                      onClick={() => toggleAsin(String(i))}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected} readOnly className="rounded border-stone-300 pointer-events-none" />
                      </td>
                      <td className="p-2 font-mono text-muted-foreground whitespace-nowrap">{p.asin || "—"}</td>
                      <td className="p-2 font-mono text-muted-foreground max-w-[100px] truncate">{p.sku || "—"}</td>
                      <td className="p-2 min-w-[280px]"><span className="line-clamp-2 leading-tight">{p.title || "Unknown"}</span></td>
                      <td className="p-2 whitespace-nowrap font-mono text-muted-foreground">{vars.VariationID || "—"}</td>
                      <td className="p-2 text-center">
                        {(p.varietyPackItemCount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold bg-brand-vp/15 text-brand-vp border border-brand-vp/30" title={`${p.varietyPackItemCount} pack items`}>
                            <PackageOpen className="size-2.5" />
                          </span>
                        ) : (
                          <span className="whitespace-nowrap">{p.variationGroup || "—"}</span>
                        )}
                      </td>
                      {["Flavor", "Color", "Size", "Style"].filter((attr) =>
                        products!.some((pr) => { const v = (pr.variations || {}) as Record<string, string>; if (v[attr] && v[attr] !== "") return true; if (attr === "Flavor" && pr.vpFlavors?.length) return true; return false; })
                      ).map((attr) => (
                        <td key={attr} className="p-2">
                          {attr === "Flavor" && (p.varietyPackItemCount ?? 0) > 0 && p.vpFlavors?.length ? (
                            <div className="flex flex-col gap-0.5">
                              {p.vpFlavors.map((f, fi) => (
                                <span key={fi} className="px-1.5 py-0.5 rounded text-[9px] bg-brand-vp/10 text-brand-vp whitespace-nowrap">{f}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="whitespace-nowrap">{vars[attr] || "—"}</span>
                          )}
                        </td>
                      ))}
                      <td className="p-2 text-right whitespace-nowrap">{p.price ? `$${parseFloat(p.price).toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
