/* eslint-disable react-doctor/query-mutation-missing-invalidation */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = { clientIdCode: string; onSuccess: () => void };

interface ProductTypeBucket {
  productType: string;
  count: number;
  missingRequired: number;
}

interface HubListing {
  sku: string;
  productType: string;
  asin: string;
  itemName: string;
  inHub: boolean;
}

interface UnmatchedSku {
  sku: string;
  productType: string;
  itemName: string;
}

interface PreviewResponse {
  totalRows: number;
  totalMissingRequired: number;
  productTypes: ProductTypeBucket[];
  hasAlr: boolean;
  hub: {
    matched: number;
    unmatched: number;
    existing: number;
    missing: number;
  };
  listings: HubListing[];
  unmatchedSkus: UnmatchedSku[];
}

interface ExecuteResponse {
  staged: number;
  schemasUpserted: number;
  matchCount: number;
  created: number;
  overwritten: number;
  skippedExisting: number;
  unmatched: number;
  seoVersion0: number;
}

interface StagingStateResponse {
  hasClr: boolean;
  hasAlr: boolean;
  clr: { count: number; productTypes: number; missingRequired: number };
  alr: { count: number; byStatus: Record<string, number> };
  master: { count: number; lastUpdatedAt: string | null };
}

export function ClrAttributeImport({ clientIdCode, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  // Hold the uploaded file so execute can re-send it (server re-parses,
  // keeping the request payload small enough for Vercel's 4.5MB limit).
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const [recreateSkus, setRecreateSkus] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stagingState = useQuery<StagingStateResponse>({
    queryKey: ["staging-state", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/onboarding/staging-state?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) throw new Error("Failed to load staging state");
      return (await res.json()) as StagingStateResponse;
    },
  });

  const previewMutation = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("clientIdCode", clientIdCode);
      const res = await fetch("/api/onboarding/clr-import?phase=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preview failed (${res.status})`);
      }
      return (await res.json()) as PreviewResponse;
    },
    onSuccess: (data, file) => {
      setPreview(data);
      setPreviewFile(file);
      setRecreateSkus(
        (data.listings ?? []).filter((row) => row.inHub).map((row) => row.sku)
      );
    },
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  const executeMutation = useMutation<ExecuteResponse, Error, void>({
    mutationFn: async () => {
      if (!preview || !previewFile) throw new Error("No preview loaded");
      const fd = new FormData();
      fd.set("file", previewFile);
      fd.set("clientIdCode", clientIdCode);
      fd.set("overwriteSkus", JSON.stringify(recreateSkus));
      const res = await fetch("/api/onboarding/clr-import?phase=execute", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Execute failed (${res.status})`);
      }
      return (await res.json()) as ExecuteResponse;
    },
    onSuccess: (data) => {
      const parts = [`Staged ${data.staged} SKUs`];
      if (data.created) parts.push(`created ${data.created} in the Hub`);
      if (data.overwritten) parts.push(`overwrote ${data.overwritten}`);
      if (data.skippedExisting) parts.push(`left ${data.skippedExisting} unchanged`);
      if (data.unmatched) parts.push(`${data.unmatched} without an ALR ASIN`);
      toast.success(parts.join(", ") + ".");
      setPreview(null);
      setPreviewFile(null);
      setRecreateSkus([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      stagingState.refetch();
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onSuccess();
    },
    onError: (err) => toast.error(`Execute failed: ${err.message}`),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(xlsm|xlsx)$/i)) {
        toast.error("Please upload a .xlsm or .xlsx file");
        return;
      }
      setPreview(null);
      setPreviewFile(null);
      setRecreateSkus([]);
      previewMutation.mutate(file);
    },
    [previewMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const alreadyStaged = stagingState.data?.clr.count ?? 0;
  const masterCount = stagingState.data?.master.count ?? 0;
  const masterLastUpdated = stagingState.data?.master.lastUpdatedAt ?? null;

  return (
    <div className="space-y-4">
      {alreadyStaged > 0 && !preview && (
        <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md p-3">
          <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <span>
            CLR already staged for this client:{" "}
            <strong>{stagingState.data!.clr.count}</strong> SKUs across{" "}
            <strong>{stagingState.data!.clr.productTypes}</strong> product
            type(s),{" "}
            <strong>{stagingState.data!.clr.missingRequired}</strong> with
            missing required attributes. Drop a new file below to replace.
          </span>
        </div>
      )}

      {alreadyStaged === 0 && masterCount > 0 && !preview && (
        <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md p-3">
          <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <span>
            Merged to master: <strong>{masterCount}</strong> products
            {masterLastUpdated
              ? ` on ${new Date(masterLastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : ""}
            . Drop a new file below to re-import.
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-neutral-300 rounded-md p-6 text-center"
      >
        <Upload className="mx-auto mb-2 size-6 text-neutral-500" />
        <p className="text-sm text-neutral-700">
          Drop the Category Listing Report (.xlsm) here, or{" "}
          <button
            type="button"
            className="underline text-blue-600"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          CLR has SKUs only. ASINs come from a staged All Listings Report
          (seller-sku). Upload the ALR step first, or listings without a match
          stay staged until ASINs are linked.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsm,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {previewMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="size-4 animate-spin" />
          Parsing CLR…
        </div>
      )}

      {preview && (
        <div className="border border-neutral-200 rounded-md p-4 space-y-3">
          <div className="text-sm">
            <strong>{preview.productTypes.length}</strong> product types parsed,{" "}
            <strong>{preview.totalRows}</strong> SKUs,{" "}
            <strong>{preview.totalMissingRequired}</strong> with missing required attributes.
          </div>

          <button
            type="button"
            className="flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-900"
            onClick={() => setBreakdownOpen((v) => !v)}
          >
            {breakdownOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            Per-product-type breakdown
          </button>
          {breakdownOpen && (
            <table className="w-full text-sm border-t border-neutral-200">
              <thead>
                <tr className="text-left text-neutral-600">
                  <th className="py-2 font-medium">Product Type</th>
                  <th className="py-2 font-medium">SKUs</th>
                  <th className="py-2 font-medium">Missing required</th>
                </tr>
              </thead>
              <tbody>
                {preview.productTypes.map((b) => (
                  <tr key={b.productType} className="border-t border-neutral-100">
                    <td className="py-2">{b.productType}</td>
                    <td className="py-2">{b.count}</td>
                    <td className="py-2">{b.missingRequired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!preview.hasAlr && (
            <p className="text-xs text-muted-foreground">
              No All Listings Report is staged yet, so ASINs cannot be resolved.
              Attribute schemas will still be saved. Upload the ALR (seller-sku)
              first if you want listings created in the Hub now.
            </p>
          )}

          {preview.hasAlr && (
            <p className="text-xs text-muted-foreground">
              {preview.hub.matched} SKU{preview.hub.matched === 1 ? "" : "s"} matched
              to ALR seller-sku ASINs
              {preview.hub.missing ? ` (${preview.hub.missing} new)` : ""}
              {preview.hub.existing ? `, ${preview.hub.existing} already in the Hub` : ""}
              {preview.hub.unmatched
                ? `. ${preview.hub.unmatched} have no ALR ASIN.`
                : "."}
            </p>
          )}

          {preview.listings.some((row) => row.inHub) && (
            <div className="rounded-md border border-red-300/40 bg-red-50 dark:bg-red-500/10 p-2.5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Overwrite warning
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                These SKUs already exist in the Hub. Recreating overwrites catalog
                fields and listing copy, and can change Amazon Sync alerts.
                Uncheck any product to leave it unchanged.
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Already in the Hub ({preview.listings.filter((row) => row.inHub).length})
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
                    onClick={() =>
                      setRecreateSkus(
                        preview.listings.filter((row) => row.inHub).map((row) => row.sku)
                      )
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
                    onClick={() => setRecreateSkus([])}
                  >
                    Select none
                  </button>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden bg-background max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-8" />
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">ASIN</th>
                      <th className="px-2 py-1.5 text-left">Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.listings
                      .filter((row) => row.inHub)
                      .map((row) => {
                        const selected = recreateSkus.some(
                          (sku) => sku.toLowerCase() === row.sku.toLowerCase()
                        );
                        return (
                          <tr key={row.sku} className="border-t">
                            <td className="px-2 py-1.5">
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(value) => {
                                  const on = value === true;
                                  setRecreateSkus((prev) => {
                                    const next = prev.filter(
                                      (sku) => sku.toLowerCase() !== row.sku.toLowerCase()
                                    );
                                    return on ? [...next, row.sku] : next;
                                  });
                                }}
                                aria-label={`Recreate ${row.sku}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">{row.sku}</td>
                            <td className="px-2 py-1.5 font-mono">{row.asin}</td>
                            <td className="px-2 py-1.5">{row.itemName || "-"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.listings.some((row) => !row.inHub) && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                New listings to create ({preview.listings.filter((row) => !row.inHub).length})
              </p>
              <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">ASIN</th>
                      <th className="px-2 py-1.5 text-left">Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.listings
                      .filter((row) => !row.inHub)
                      .map((row) => (
                        <tr key={row.sku} className="border-t">
                          <td className="px-2 py-1.5">{row.sku}</td>
                          <td className="px-2 py-1.5 font-mono">{row.asin}</td>
                          <td className="px-2 py-1.5">{row.itemName || "-"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.unmatchedSkus.length > 0 && preview.hasAlr && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                No ALR ASIN ({preview.unmatchedSkus.length})
              </p>
              <div className="rounded-md border overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.unmatchedSkus.map((row) => (
                      <tr key={row.sku} className="border-t">
                        <td className="px-2 py-1.5">{row.sku}</td>
                        <td className="px-2 py-1.5">{row.itemName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                setRecreateSkus([]);
              }}
              disabled={executeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || preview.totalRows === 0}
            >
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {preview.hub.missing + recreateSkus.length > 0
                ? `Stage and upload ${preview.hub.missing + recreateSkus.length} listings`
                : `Stage ${preview.totalRows} SKUs`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
