"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  parseImportWorkbook,
  parseProductImportRecords,
  type ClrSkuDiff,
  type ImportIssue,
  type ImportRow,
  type ImportWorkbookSource,
} from "@/lib/product-excel-import";

type ClientEntry = { clientIdCode: string; count: number; activeCount: number };
type CategoryDefsResponse = {
  definitions: Array<{ productType: string }>;
};

interface ImportProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Preview = {
  fileName: string;
  source: ImportWorkbookSource;
  valid: ImportRow[];
  errors: ImportIssue[];
  skuDiff: ClrSkuDiff | null;
};

function listingTitle(row: ImportRow): string {
  return row.seoV0?.ItemName || row.extra?.ItemName || "";
}

export function ImportProductsDialog({
  open,
  onOpenChange,
}: ImportProductsDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clientIdCode, setClientIdCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [recreateSkus, setRecreateSkus] = useState<string[]>([]);

  const { data: clients = [] } = useQuery<ClientEntry[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: categoryData, isFetching: loadingCategories } = useQuery<CategoryDefsResponse>({
    queryKey: ["category-definitions-list", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/category-definitions?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) return { definitions: [] };
      return res.json();
    },
    enabled: open && !!clientIdCode,
    staleTime: 5 * 60 * 1000,
  });

  const categoryCount = categoryData?.definitions.length ?? 0;
  const categoryNames = (categoryData?.definitions ?? [])
    .map((d) => d.productType)
    .filter(Boolean);

  const reset = useCallback(() => {
    setClientIdCode("");
    setFile(null);
    setPreview(null);
    setParseError("");
    setParsing(false);
    setDownloading(false);
    setRecreateSkus([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleClientChange(value: string) {
    setClientIdCode(value);
    setFile(null);
    setPreview(null);
    setParseError("");
    setRecreateSkus([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const parseFile = useCallback(
    async (selected: File, client: string) => {
      setFile(selected);
      setParseError("");
      setPreview(null);
      setRecreateSkus([]);
      setParsing(true);
      try {
        const buffer = await selected.arrayBuffer();
        const parsedWorkbook = parseImportWorkbook(new Uint8Array(buffer));
        const parsed = parseProductImportRecords(parsedWorkbook.records, {
          defaultClientIdCode: client || undefined,
          requireAsin: true,
          asinHint:
            parsedWorkbook.source === "clr" ? "ASIN (column A)" : undefined,
        });
        if (parsed.valid.length === 0 && parsed.errors.length === 0) {
          setParseError(
            parsedWorkbook.source === "clr"
              ? "Category Listing Report has no listing rows with a SKU."
              : "Spreadsheet is empty or has no data rows."
          );
          return;
        }
        if (
          parsedWorkbook.source === "clr" &&
          parsed.valid.length === 0 &&
          parsed.errors.some((e) => /ASIN/i.test(e.message))
        ) {
          setParseError(
            "Amazon Category Listing Reports have no ASIN column. Insert a new column A, paste each listing's ASIN, delete rows you are not creating, and upload again."
          );
        }

        let skuDiff: ClrSkuDiff | null = null;
        if (client && parsed.valid.length > 0) {
          const res = await fetch("/api/products/import/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientIdCode: client,
              skus: parsed.valid.map((row) => row.sku),
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: "Compare failed" }));
            throw new Error(body.error || "Failed to compare SKUs with the Hub");
          }
          const body = (await res.json()) as ClrSkuDiff & { total?: number };
          skuDiff = { existing: body.existing, missing: body.missing };
        }

        setRecreateSkus(skuDiff?.existing ?? []);
        setPreview({
          fileName: selected.name,
          source: parsedWorkbook.source,
          valid: parsed.valid,
          errors: parsed.errors,
          skuDiff,
        });
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Failed to parse spreadsheet"
        );
      } finally {
        setParsing(false);
      }
    },
    []
  );

  const mutation = useMutation({
    mutationFn: async (upload: File) => {
      const form = new FormData();
      form.append("file", upload);
      form.append("clientIdCode", clientIdCode);
      form.append("overwriteSkus", JSON.stringify(recreateSkus));
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Import failed");
      }
      return body as {
        created: number;
        overwritten?: number;
        skipped: number;
        failed: number;
        seoVersion0?: number;
        errors: ImportIssue[];
        skippedRows: Array<ImportIssue & { reason?: string }>;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      const parts: string[] = [];
      if (data.created) parts.push(`Created ${data.created}`);
      if (data.overwritten) parts.push(`overwrote ${data.overwritten}`);
      if (data.seoVersion0) {
        parts.push(`SEO version 0 saved for ${data.seoVersion0}`);
      }
      if (data.skipped) parts.push(`left ${data.skipped} unchanged`);
      if (data.failed) parts.push(`${data.failed} failed`);
      const summary = parts.join(", ") || "Nothing to import";
      if (data.failed && data.created === 0 && !data.overwritten && !data.seoVersion0) {
        toast.error(summary);
      } else if (data.failed || data.overwritten) {
        toast.warning(summary);
      } else {
        toast.success(summary);
      }
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  async function handleDownloadTemplate() {
    if (!clientIdCode) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/products/import/template?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(body.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product-import-${clientIdCode.toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!clientIdCode) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void parseFile(dropped, clientIdCode);
  }

  const skuDiff = preview?.skuDiff;
  const isClr = preview?.source === "clr";
  const existingSet = useMemo(
    () => new Set((skuDiff?.existing ?? []).map((sku) => sku.toLowerCase())),
    [skuDiff]
  );
  const existingRows = (preview?.valid ?? []).filter((row) =>
    existingSet.has(row.sku.toLowerCase())
  );
  const missingRows = (preview?.valid ?? []).filter(
    (row) => !existingSet.has(row.sku.toLowerCase())
  );
  const recreateSet = useMemo(
    () => new Set(recreateSkus.map((sku) => sku.toLowerCase())),
    [recreateSkus]
  );
  const overwriteCount = existingRows.filter((row) =>
    recreateSet.has(row.sku.toLowerCase())
  ).length;
  const createCount = missingRows.length;
  const allExistingSelected =
    existingRows.length > 0 && overwriteCount === existingRows.length;
  const someExistingSelected = overwriteCount > 0 && !allExistingSelected;

  const canImport =
    !!clientIdCode &&
    !!file &&
    !!preview &&
    preview.valid.length > 0 &&
    !mutation.isPending;

  const primaryLabel = (() => {
    if (mutation.isPending) return null;
    if (createCount > 0 && overwriteCount > 0) {
      return `Create ${createCount}, overwrite ${overwriteCount}`;
    }
    if (overwriteCount > 0) {
      return `Overwrite ${overwriteCount} product${overwriteCount === 1 ? "" : "s"}`;
    }
    if (createCount > 0) {
      return `Create ${createCount} product${createCount === 1 ? "" : "s"}`;
    }
    if (isClr) return "Save SEO version 0";
    return "Import";
  })();

  function setAllExisting(selected: boolean) {
    setRecreateSkus(selected ? existingRows.map((row) => row.sku) : []);
  }

  function toggleExisting(sku: string, selected: boolean) {
    setRecreateSkus((prev) => {
      const next = new Set(prev.map((value) => value.toLowerCase()));
      const match = existingRows.find(
        (row) => row.sku.toLowerCase() === sku.toLowerCase()
      );
      const canonical = match?.sku ?? sku;
      if (selected) next.add(canonical.toLowerCase());
      else next.delete(sku.toLowerCase());
      return existingRows
        .filter((row) => next.has(row.sku.toLowerCase()))
        .map((row) => row.sku);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Excel</DialogTitle>
          <DialogDescription>
            Download the Category Listing Report from Amazon, insert a new
            column A with ASINs, then upload. New SKUs are created. SKUs already
            in the Hub can be recreated if you leave them checked. Listing title,
            bullets, description, and generic keywords are saved as SEO version 0.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={clientIdCode} onValueChange={handleClientChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clientIdCode && loadingCategories && (
              <p className="text-xs text-muted-foreground">Loading categories...</p>
            )}
            {clientIdCode && !loadingCategories && categoryCount === 0 && (
              <p className="text-xs text-red-500">
                No Category Listing Report found for this client. Upload a CLR
                during onboarding to generate a category template.
              </p>
            )}
            {clientIdCode && !loadingCategories && categoryCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {categoryCount} categor{categoryCount === 1 ? "y" : "ies"}:{" "}
                {categoryNames.slice(0, 6).join(", ")}
                {categoryNames.length > 6 ? ` +${categoryNames.length - 6} more` : ""}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => clientIdCode && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            disabled={!clientIdCode}
            className={`w-full rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              clientIdCode
                ? "border-border cursor-pointer hover:border-brand hover:bg-brand/8"
                : "border-border/60 cursor-not-allowed opacity-60"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void parseFile(selected, clientIdCode);
                e.target.value = "";
              }}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-8 animate-spin text-muted-foreground/70" />
                <span className="text-sm text-muted-foreground">
                  Reading spreadsheet...
                </span>
              </div>
            ) : preview ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="size-8 text-emerald-500" />
                <span className="text-sm font-medium">{preview.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {isClr
                    ? `Category Listing Report · ${preview.valid.length} SKU${preview.valid.length === 1 ? "" : "s"}`
                    : `${preview.valid.length} row${preview.valid.length === 1 ? "" : "s"}`}
                  {preview.errors.length > 0
                    ? ` · ${preview.errors.length} row error${preview.errors.length === 1 ? "" : "s"}`
                    : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  Click or drop to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="size-8 text-muted-foreground/70" />
                <span className="text-sm font-medium text-muted-foreground">
                  {clientIdCode
                    ? "Drag and drop or click to browse"
                    : "Select a client first"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Hub template or Amazon CLR (.xlsx, .xlsm) · ASINs in column A
                  · max 5MB · 500 rows
                </span>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadTemplate()}
            disabled={!clientIdCode || categoryCount === 0 || downloading}
            className="text-xs text-brand hover:underline inline-flex items-center gap-1 disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            {downloading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3" />
            )}
            Download template
          </button>

          {parseError && (
            <p className="text-xs text-red-500">{parseError}</p>
          )}

          {preview && existingRows.length > 0 && (
            <div className="rounded-md border border-red-300/40 bg-red-50 dark:bg-red-500/10 p-2.5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Overwrite warning
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                {existingRows.length} product{existingRows.length === 1 ? "" : "s"} already
                in the Hub. Recreating overwrites catalog fields and listing copy,
                and can change Amazon Sync alerts. Uncheck any product you want
                to leave unchanged. Variation groups stay in place.
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Already in the Hub ({existingRows.length})
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
                    onClick={() => setAllExisting(true)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
                    onClick={() => setAllExisting(false)}
                  >
                    Select none
                  </button>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden bg-background max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-8">
                        <Checkbox
                          checked={
                            allExistingSelected
                              ? true
                              : someExistingSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(value) =>
                            setAllExisting(value === true)
                          }
                          aria-label="Recreate all existing products"
                        />
                      </th>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">ASIN</th>
                      <th className="px-2 py-1.5 text-left">Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingRows.map((row) => {
                      const selected = recreateSet.has(row.sku.toLowerCase());
                      return (
                        <tr key={`${row.sheet}-${row.rowNumber}`} className="border-t">
                          <td className="px-2 py-1.5">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(value) =>
                                toggleExisting(row.sku, value === true)
                              }
                              aria-label={`Recreate ${row.sku}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">{row.sku}</td>
                          <td className="px-2 py-1.5 font-mono">{row.asin}</td>
                          <td className="px-2 py-1.5">{listingTitle(row) || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview && missingRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                New products to create ({missingRows.length})
              </p>
              <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">ASIN</th>
                      <th className="px-2 py-1.5 text-left">Marketplace</th>
                      <th className="px-2 py-1.5 text-left">Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingRows.map((row) => (
                      <tr key={`${row.sheet}-${row.rowNumber}`} className="border-t">
                        <td className="px-2 py-1.5">{row.sku}</td>
                        <td className="px-2 py-1.5 font-mono">{row.asin}</td>
                        <td className="px-2 py-1.5">{row.marketplace}</td>
                        <td className="px-2 py-1.5">{listingTitle(row) || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview && preview.errors.length > 0 && (
            <div className="rounded-md border border-red-300/40 bg-red-50 dark:bg-red-500/10 p-2.5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Row errors
              </p>
              {preview.errors.map((err) => (
                <p key={`${err.sheet}-${err.row}-${err.message}`} className="text-xs text-red-600 dark:text-red-400">
                  {err.sheet && err.sheet !== "Products" ? `${err.sheet} ` : ""}
                  {err.row > 0 ? `row ${err.row}: ` : ""}
                  {err.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canImport}
            onClick={() => file && mutation.mutate(file)}
            className="bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              primaryLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
