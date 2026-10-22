"use client";

import { use, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ImageIcon, PackageOpen, X, Minus, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, hiResAmazonImg } from "@/lib/utils";
import {
  DESIGN_STATUS_ORDER_FULL,
  DESIGN_STATUS_META,
} from "@/lib/design-status";
import Image from "next/image";
import Link from "next/link";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { coalesceThemeAttrs, displaySummarizedTitle } from "@/lib/computed-fields";

// Canonical palette lives in @/lib/design-status — this page is the visual
// reference all other Design status chips match. Build the option list from
// the shared source so colors can never drift between here and there.
const SLOT_STATUS_OPTIONS = DESIGN_STATUS_ORDER_FULL.map((value) => ({
  value,
  ...DESIGN_STATUS_META[value],
}));

const STATUS_CHIPS = [
  { value: "Active", label: "Active" },
  { value: "Closed", label: "Closed" },
  { value: "Discontinued", label: "Discontinued" },
  { value: "Inactive", label: "Inactive" },
  { value: "Incomplete", label: "Incomplete" },
  { value: "Out of Stock", label: "Out of Stock" },
];

const STATUS_COLORS: Record<string, { on: string; off: string }> = {
  Active: { on: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Closed: { on: "bg-red-500/15 text-red-400 border-red-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Discontinued: { on: "bg-orange-500/15 text-orange-400 border-orange-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Inactive: { on: "bg-muted text-foreground/80 border-border", off: "bg-muted text-muted-foreground border-transparent" },
  Incomplete: { on: "bg-yellow-500/15 text-yellow-400 border-brand/30", off: "bg-muted text-muted-foreground border-transparent" },
  "Out of Stock": { on: "bg-purple-100 text-purple-700 border-purple-300", off: "bg-muted text-muted-foreground border-transparent" },
};

/** Product-catalog status badge tokens (same as product-table-columns StatusBadge). */
const PRODUCT_STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
  suppressed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

type ProductRow = {
  id: string;
  asin: string | null;
  sku: string | null;
  status: string | null;
  parentageLevel: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  variationId: string | null;
  variationGroup: string | null;
  variationName: string | null;
  variationThemeName?: string | null;
  variations?: {
    Flavor?: string;
    Size?: string;
    Color?: string;
    Style?: string;
  } | null;
  mainImageUrl: string | null;
};

/** PDP Summarized Title: VariationName | Color | Size… — never Amazon marketing itemName. */
function listingSummarizedTitle(
  product: ProductRow,
  siblings: ProductRow[] = []
): string | null {
  const attrs = coalesceThemeAttrs(product, siblings);
  return displaySummarizedTitle({
    variationThemeName: product.variationThemeName,
    variationName: product.variationName,
    ...attrs,
    summarizedTitle: product.summarizedTitle,
    itemName: product.itemName,
  });
}

type ProductsResponse = {
  data: ProductRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

async function fetchProducts(clientIdCode: string, variationId?: string): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  params.set("client", clientIdCode);
  params.set("pageSize", "200");
  if (variationId) params.set("variationId", variationId);
  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchClientInfo(clientIdCode: string) {
  const res = await fetch(`/api/clients/${clientIdCode}`);
  if (!res.ok) return { clientName: clientIdCode };
  const data = await res.json();
  return { clientName: data.client?.clientName ?? clientIdCode };
}

type ListingImage = {
  id: string;
  driveFileId: string;
  displayName: string;
  folderId: string;
  driveFolderId: string | null;
  versionNumber: number;
  status: string;
  productId: string;
  slot: string;
};

type VersionHistory = {
  id: string;
  driveFileId: string;
  displayName: string;
  versionNumber: number;
  status: string;
  createdAt: string;
  createdBy: string | null;
};

async function fetchVersionHistory(productId: string, slot: string): Promise<VersionHistory[]> {
  const res = await fetch(
    `/api/design/listing-images/versions?productId=${encodeURIComponent(productId)}&slot=${encodeURIComponent(slot)}`
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchListingImages(clientIdCode: string): Promise<ListingImage[]> {
  const res = await fetch(`/api/design/listing-images?clientIdCode=${encodeURIComponent(clientIdCode)}`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Turn a failed Response into a readable message.
 *
 * Never assume the body is JSON. A payload rejected at Vercel's edge comes back
 * as plaintext ("Request Entity Too Large"), and res.json() would throw a parse
 * error that replaces the real cause with "Unexpected token 'R'".
 */
async function readError(res: Response, fallback: string): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    if (raw.trim()) return raw.trim().slice(0, 200);
  }
  return `${fallback} (${res.status})`;
}

/**
 * Upload a slot image by PUTting the bytes straight to Google Drive.
 *
 * Vercel caps serverless request *and* response bodies at ~4.5 MB
 * (`FUNCTION_PAYLOAD_TOO_LARGE`). Listing PNGs regularly exceed that, so the
 * file must never pass through a Hub function. The server only mints a Drive
 * resumable session; the browser PUTs to Google; the server then records the
 * rows. Metadata is all that crosses Vercel, so there is no size ceiling.
 *
 * Same three-step pattern as the brand-logo uploader. Used for every slot
 * upload — not only files over 4.5 MB — because FormData wrapping of a
 * near-limit file still trips the edge cap.
 */
async function uploadViaDrive(
  file: File,
  product: ProductRow,
  columnName: string,
  clientIdCode: string
): Promise<{ driveFileId: string; displayName: string; versionNumber: number }> {
  const mimeType = file.type || "application/octet-stream";

  const sessionRes = await fetch("/api/design/listing-images/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientIdCode,
      productId: product.id,
      columnName,
      mimeType,
      fileSize: file.size,
    }),
  });
  if (!sessionRes.ok) {
    throw new Error(await readError(sessionRes, "Could not start the upload"));
  }
  const session = (await sessionRes.json()) as {
    sessionUri: string;
    displayName: string;
    versionNumber: number;
    folderId: string;
  };

  const putRes = await fetch(session.sessionUri, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(
      `Drive rejected ${file.name} (${putRes.status}). The upload link is valid for 24h — reload the page and try again.`
    );
  }
  const driveResult = (await putRes.json()) as { id?: string };
  if (!driveResult.id) {
    throw new Error("Drive did not return a file ID for the upload");
  }

  const recordRes = await fetch("/api/design/listing-images/upload/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveFileId: driveResult.id,
      folderId: session.folderId,
      displayName: session.displayName,
      originalName: file.name,
      mimeType,
      sizeBytes: file.size,
      clientIdCode,
      productId: product.id,
      columnName,
      versionNumber: session.versionNumber,
    }),
  });
  if (!recordRes.ok) {
    // The bytes are already in Drive at this point; only the DB rows are missing.
    throw new Error(
      await readError(
        recordRes,
        `${file.name} reached Drive but could not be recorded. Reload before retrying so the version number is recomputed`
      )
    );
  }
  return recordRes.json();
}

export default function ListingImagesClientPage({ params }: { params: Promise<{ clientIdCode: string }> }) {
  const resolvedParams = use(params);
  const { clientIdCode } = resolvedParams;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [uploadingSlots, setUploadingSlots] = useState<Set<string>>(new Set());
  const [expandedImage, setExpandedImage] = useState<ListingImage | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dropConflict, setDropConflict] = useState<{
    file: File;
    product: ProductRow;
    columnName: string;
    existingImage: ListingImage;
  } | null>(null);

  // All Drive-backed versions for the expanded slot — lightbox can switch between them.
  const { data: expandedHistory = [] } = useQuery<VersionHistory[]>({
    queryKey: ["listing-image-history", expandedImage?.productId, expandedImage?.slot],
    queryFn: () => fetchVersionHistory(expandedImage!.productId, expandedImage!.slot),
    enabled: !!expandedImage,
    staleTime: 30_000,
  });

  const selectExpandedVersion = (v: VersionHistory) => {
    if (!expandedImage) return;
    setExpandedImage({
      ...expandedImage,
      id: v.id,
      driveFileId: v.driveFileId,
      displayName: v.displayName,
      versionNumber: v.versionNumber,
      status: v.status,
    });
  };

  const { data: clientInfo } = useQuery({
    queryKey: ["client", clientIdCode],
    queryFn: () => fetchClientInfo(clientIdCode),
  });

  const { data: existingImages = [] } = useQuery<ListingImage[]>({
    queryKey: ["listing-images", clientIdCode],
    queryFn: () => fetchListingImages(clientIdCode),
  });

  const openExpanded = (img: ListingImage) => {
    setShowDeleteConfirm(false);
    setExpandedImage(img);
  };

  const openExpandedVersion = (productId: string, slot: string, v: VersionHistory) => {
    const latest = existingImages.find((i) => i.productId === productId && i.slot === slot);
    openExpanded({
      id: v.id,
      driveFileId: v.driveFileId,
      displayName: v.displayName,
      folderId: latest?.folderId ?? "",
      driveFolderId: latest?.driveFolderId ?? null,
      versionNumber: v.versionNumber,
      status: v.status,
      productId,
      slot,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/api/design/listing-images/${fileId}?fileId=${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing-images", clientIdCode] });
      queryClient.invalidateQueries({ queryKey: ["listing-products", clientIdCode] });
      queryClient.invalidateQueries({ queryKey: ["listing-image-history"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const slotStatusMutation = useMutation({
    mutationFn: async ({ productId, slot, status, versionNumber }: { productId: string; slot: string; status: string; versionNumber?: number }) => {
      const res = await fetch("/api/design/listing-images/slot-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, productId, slot, status, versionNumber }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async ({ productId, slot, status, versionNumber }) => {
      await queryClient.cancelQueries({ queryKey: ["listing-images", clientIdCode] });
      const prevImages = queryClient.getQueryData<ListingImage[]>(["listing-images", clientIdCode]);
      if (prevImages) {
        const slots: readonly string[] = slot === "_all" ? IMAGE_SLOTS : [slot];
        // listing-images holds only the LATEST version per slot. Update it unless a
        // specific older version was targeted from the Popover.
        queryClient.setQueryData<ListingImage[]>(
          ["listing-images", clientIdCode],
          prevImages.map((img) =>
            img.productId === productId &&
            slots.includes(img.slot) &&
            (versionNumber === undefined || versionNumber === img.versionNumber)
              ? { ...img, status }
              : img
          )
        );
      }
      const histKey = ["listing-image-history", productId, slot];
      const prevHist = queryClient.getQueryData<VersionHistory[]>(histKey);
      if (prevHist) {
        queryClient.setQueryData<VersionHistory[]>(
          histKey,
          prevHist.map((v) => {
            if (versionNumber === undefined || v.versionNumber === versionNumber) {
              return { ...v, status };
            }
            // Promoting one version to Live discontinues the others (matches backend).
            if (status === "live" && v.status === "live") {
              return { ...v, status: "discontinued" };
            }
            return v;
          })
        );
      }
      return { prevImages, prevHist, productId, slot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevImages) queryClient.setQueryData(["listing-images", clientIdCode], ctx.prevImages);
      if (ctx?.prevHist) queryClient.setQueryData(["listing-image-history", ctx.productId, ctx.slot], ctx.prevHist);
      toast.error("Failed to update status");
    },
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["listing-images", clientIdCode] });
      queryClient.invalidateQueries({ queryKey: ["listing-image-history", vars.productId, vars.slot] });
    },
  });

  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["listing-products", clientIdCode],
    queryFn: () => fetchProducts(clientIdCode),
  });

  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());

  const filteredData = useMemo(() => {
    if (!data?.data) return [];
    if (activeStatuses.size === 0) return data.data;
    return data.data.filter((p) => p.status && activeStatuses.has(p.status));
  }, [data, activeStatuses]);

  const listingGroups = useMemo(() => {
    if (!filteredData) return [];
    type Bucket = {
      key: string;
      kind: "hub" | "standalone";
      label: string;
      products: ProductRow[];
    };
    const groups = new Map<string, Bucket>();
    // Hub variation groups first. Signal: variations join produced a name
    // (master.variationRef matched a variations row).
    for (const row of filteredData) {
      if (!row.variationName) continue;
      const key = `hub:${row.variationName}`;
      if (!groups.has(key)) groups.set(key, { key, kind: "hub", label: row.variationName, products: [] });
      groups.get(key)!.products.push(row);
    }
    const ordered: Bucket[] = Array.from(groups.values()).map((bucket) => {
      const parent = bucket.products.find((p) => (p.parentageLevel || "").toLowerCase() === "parent");
      const children = bucket.products.filter((p) => (p.parentageLevel || "").toLowerCase() === "child");
      return {
        ...bucket,
        products: parent ? [parent, ...children] : bucket.products,
      };
    });
    const standalone = filteredData.filter((row) => !row.variationName);
    if (standalone.length > 0) {
      ordered.push({
        key: "standalone",
        kind: "standalone",
        label: "Standalone",
        products: standalone,
      });
    }
    return ordered;
  }, [filteredData]);

  const uploadMutation = useMutation({
    mutationFn: async ({
      product,
      columnName,
      file,
    }: {
      product: ProductRow;
      columnName: string;
      file: File;
    }) => {
      // Never POST the file through Vercel — even a 4 MB PNG plus FormData
      // wrapping trips FUNCTION_PAYLOAD_TOO_LARGE at the edge. Covers the
      // slot input, drag-and-drop, and the "New Version" button.
      return uploadViaDrive(file, product, columnName, clientIdCode);
    },
    onMutate: ({ product, columnName }) => {
      const slotKey = `${product.id}-${columnName}`;
      setUploadingSlots((prev) => new Set([...prev, slotKey]));
    },
    onSuccess: async (result, { product, columnName }) => {
      queryClient.invalidateQueries({ queryKey: ["listing-products", clientIdCode] });
      queryClient.invalidateQueries({ queryKey: ["listing-images", clientIdCode] });
      await queryClient.invalidateQueries({
        queryKey: ["listing-image-history", product.id, columnName],
      });
      // Keep the lightbox open after re-upload so old vs new versions can be compared.
      if (expandedImage?.productId === product.id && expandedImage.slot === columnName) {
        const history = await fetchVersionHistory(product.id, columnName);
        const newest =
          history.find((v) => v.versionNumber === result?.versionNumber) ?? history[0];
        if (newest) {
          openExpandedVersion(product.id, columnName, newest);
        }
      }
    },
    onSettled: (_data, _err, { product, columnName }) => {
      const slotKey = `${product.id}-${columnName}`;
      setUploadingSlots((prev) => {
        const n = new Set(prev);
        n.delete(slotKey);
        return n;
      });
    },
  });

  const uploadFile = (file: File, product: ProductRow, columnName: string) => {
    uploadMutation.mutate(
      { product, columnName, file },
      {
        onError: (err: Error) => toast.error(err.message),
        onSuccess: () => toast.success(`${columnName} uploaded for ${product.asin}`),
      }
    );
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    product: ProductRow,
    columnName: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file, product, columnName);
    e.target.value = "";
  };

  const handleFileDrop = (file: File, product: ProductRow, columnName: string) => {
    const existing = getImageForSlot(existingImages, product, columnName);
    if (existing) {
      setDropConflict({ file, product, columnName, existingImage: existing });
      return;
    }
    uploadFile(file, product, columnName);
  };

  const resolveDropAsNewVersion = () => {
    if (!dropConflict) return;
    const { file, product, columnName } = dropConflict;
    setDropConflict(null);
    uploadFile(file, product, columnName);
  };

  const resolveDropAsReplace = async () => {
    if (!dropConflict) return;
    const { file, product, columnName, existingImage } = dropConflict;
    const versionLabel = `V${existingImage.versionNumber.toString().padStart(2, "0")}`;
    setDropConflict(null);
    try {
      await deleteMutation.mutateAsync(existingImage.id);
      toast.info(`Replacing ${versionLabel}…`);
      uploadFile(file, product, columnName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    }
  };

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/design/listing-images")}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label="Back to Listing Images"
            title="Back to Listing Images"
          >
            <ChevronLeft className="size-4" />
          </button>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Listing Images"
          >
            <span className="font-bold text-sidebar-foreground">Listing</span>
            <span className="font-normal text-brand">Images</span>
          </h1>
          <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
            <span className="text-brand font-bold truncate">
              {clientInfo?.clientName || clientIdCode}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {clientIdCode}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
          <span className="text-[10px] text-muted-foreground mr-1">Status:</span>
          {STATUS_CHIPS.map((opt) => {
            const isActive = activeStatuses.has(opt.value);
            const colors = STATUS_COLORS[opt.value] || STATUS_COLORS.Active;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  setActiveStatuses((prev) => {
                    const next = new Set(prev);
                    if (isActive) next.delete(opt.value);
                    else next.add(opt.value);
                    return next;
                  });
                }}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer select-none ${isActive ? colors.on : colors.off}`}
              >
                {opt.label}
              </button>
            );
          })}
          {activeStatuses.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveStatuses(new Set())}
              className="text-[10px] text-muted-foreground hover:text-foreground ml-1 underline"
            >
              Clear
            </button>
          )}
        </div>
      </PageMetaSlot>

      {(isLoading || listingGroups.length > 0) && (
        <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 glass-panel">
          <table className="w-full text-xs table-fixed">
            <ListingImagesColgroup />
            <ListingImagesThead />
          </table>
        </div>
      )}

      <div className="space-y-6 mt-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ))
        ) : listingGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="rounded-full bg-muted/40 p-6">
              <ImageIcon className="size-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No products match the current filters</p>
          </div>
        ) : (
          listingGroups.map((group) => (
            <VariationCard
              key={group.key}
              group={group}
              clientIdCode={clientIdCode}
              uploadMutation={uploadMutation}
              uploadingSlots={uploadingSlots}
              existingImages={existingImages}
              onSlotStatusChange={(productId, slot, status, versionNumber) =>
                slotStatusMutation.mutate({ productId, slot, status, versionNumber })
              }
              onFileChange={handleFileChange}
              onFileDrop={handleFileDrop}
              onDelete={(fileId) => deleteMutation.mutate(fileId)}
              onPreview={openExpanded}
              onOpenVersion={openExpandedVersion}
            />
          ))
        )}

      {expandedImage && (
        <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <div role="presentation" className="relative max-w-lg w-full mx-4 mt-32" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img
                src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(expandedImage.driveFileId)}`}
                alt={expandedImage.displayName}
                className="w-full h-auto rounded-lg shadow-2xl"
              />
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
              {/* Red — Close */}
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                aria-label="Close"
                className="h-6 px-3 rounded-full bg-[#FF5F57] border border-[#E0443E] flex items-center justify-center gap-1 text-[#7a0000] text-[10px] font-bold hover:brightness-90 transition-all"
              >
                <X className="size-2.5" />
                Close
              </button>
              {expandedImage && (
                <span className="inline-flex items-center rounded-full bg-black/60 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white font-mono">
                  {`V${expandedImage.versionNumber.toString().padStart(2, "0")}`}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-black/60 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white font-mono">
                {expandedImage.slot}
              </span>
              {/* Yellow — Delete */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                aria-label="Delete image"
                className="h-6 px-3 rounded-full bg-[#FEBC2E] border border-[#D9A118] flex items-center justify-center gap-1 text-[#7a4800] text-[10px] font-bold hover:brightness-90 transition-all"
              >
                <Minus className="size-2.5" />
                Delete
              </button>
              {/* Green — Replace (stays open so you can compare versions after upload) */}
              <button
                type="button"
                aria-label="Replace image"
                onClick={async (e) => {
                  e.stopPropagation();
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = async (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const columnName = expandedImage.slot;
                    const product = filteredData.find((p) => p.id === expandedImage.productId);
                    if (!product) return;
                    toast.info("Uploading new version…");
                    uploadMutation.mutate(
                      { product, columnName, file },
                      {
                        onError: (err: Error) => toast.error(err.message),
                        onSuccess: (result) => {
                          const v = result?.versionNumber;
                          toast.success(
                            v != null
                              ? `V${String(v).padStart(2, "0")} uploaded — switch versions below`
                              : "New version uploaded — switch versions below"
                          );
                        },
                      }
                    );
                  };
                  input.click();
                }}
                className="h-6 px-3 rounded-full bg-[#28C840] border border-[#1DAD2E] flex items-center justify-center gap-1 text-[#004d0d] text-[10px] font-bold hover:brightness-90 transition-all"
              >
                <RefreshCw className="size-2.5" />
                New Version
              </button>
              </div>
              {showDeleteConfirm && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30 rounded-lg">
                  <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-2xl max-w-sm w-full mx-4">
                    <p className="text-sm font-medium text-foreground mb-4 text-center">
                      Are you sure you want to delete this image?
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-4 py-2 rounded-md border border-stone-300 text-xs font-bold text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          deleteMutation.mutate(expandedImage.id);
                          setExpandedImage(null);
                        }}
                        className="px-4 py-2 rounded-md bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {expandedHistory.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {expandedHistory.length > 1 && (
                  <p className="text-[10px] font-medium text-white/70 text-center">
                    Click a version to compare
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
                  {expandedHistory.map((v) => {
                    const active = v.versionNumber === expandedImage.versionNumber;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectExpandedVersion(v)}
                        className={cn(
                          "relative shrink-0 size-16 rounded-md overflow-hidden border-2 transition-colors",
                          active
                            ? "border-brand"
                            : "border-white/20 hover:border-white/50"
                        )}
                        aria-label={`View V${v.versionNumber.toString().padStart(2, "0")}`}
                        aria-pressed={active}
                      >
                        <img
                          src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(v.driveFileId)}&thumb=1`}
                          alt={`V${v.versionNumber.toString().padStart(2, "0")}`}
                          className="size-full object-cover"
                        />
                        <span className="absolute bottom-0.5 left-0.5 inline-flex items-center rounded bg-black/70 px-1 py-px text-[9px] font-bold text-white font-mono leading-none">
                          {`V${v.versionNumber.toString().padStart(2, "0")}`}
                        </span>
                        {v.status === "live" && (
                          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-emerald-400" title="Live" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={!!dropConflict}
        onOpenChange={(open) => {
          if (!open) setDropConflict(null);
        }}
      >
        <AlertDialogContent className="z-[110]">
          <AlertDialogHeader>
            <AlertDialogTitle>Image already uploaded</AlertDialogTitle>
            <AlertDialogDescription>
              {dropConflict
                ? `${dropConflict.columnName} already has ${`V${dropConflict.existingImage.versionNumber.toString().padStart(2, "0")}`} (${dropConflict.existingImage.displayName}). Choose how to handle the new file.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <button
              type="button"
              autoFocus
              className={cn(
                "inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-bold transition-colors",
                "bg-brand-solid text-white hover:bg-brand-solid-hover"
              )}
              onClick={resolveDropAsNewVersion}
            >
              Create new version
              <span className="ml-1.5 font-normal opacity-80">
                — upload as next V##
              </span>
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-bold transition-colors hover:bg-muted"
              )}
              onClick={() => void resolveDropAsReplace()}
            >
              Replace
              <span className="ml-1.5 font-normal text-muted-foreground">
                — delete old, keep same filename
              </span>
            </button>
            <AlertDialogCancel className="mt-0 w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

type VariationCardProps = {
  group: { key: string; kind: "hub" | "standalone"; label: string; products: ProductRow[] };
  clientIdCode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadMutation: any;
  uploadingSlots: Set<string>;
  existingImages: ListingImage[];
  onSlotStatusChange: (productId: string, slot: string, status: string, versionNumber?: number) => void;
  onFileChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    product: ProductRow,
    columnName: string
  ) => void;
  onFileDrop: (file: File, product: ProductRow, columnName: string) => void;
  onDelete: (fileId: string) => void;
  onPreview: (img: ListingImage) => void;
  onOpenVersion: (productId: string, slot: string, v: VersionHistory) => void;
};

function SplitTitle({ title }: { title: string | null | undefined }) {
  if (!title) return <span className="text-muted-foreground/50">—</span>;
  const parts = title.split(" | ");
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {parts.map((part, i) => (
        <span
          key={i}
          className={cn(
            "block break-words leading-snug",
            i === 0 ? "font-semibold text-foreground text-xs" : "text-[11px] text-muted-foreground"
          )}
        >
          {part}
        </span>
      ))}
    </div>
  );
}

function SlotStatusSelect({
  value,
  onChange,
  disabled,
  compact,
  fitContent,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
  fitContent?: boolean;
}) {
  const opt = SLOT_STATUS_OPTIONS.find((o) => o.value === value) ?? SLOT_STATUS_OPTIONS[0];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "border font-bold px-1.5 py-0 justify-start gap-1",
          // fitContent: size to the label so it never truncates (used in the narrow Images Status column)
          fitContent ? "w-fit whitespace-nowrap [&>span]:line-clamp-none" : "w-full",
          compact ? "data-[size=default]:h-5 text-[10px]" : "data-[size=default]:h-5 text-[9px] mt-1",
          opt.chipClass,
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SLOT_STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[11px]">
            <div className="flex items-center gap-2">
              <span className={cn("inline-block size-2 rounded-full shrink-0", o.dotClass)} />
              {o.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ImageStatusDots({
  product,
  existingImages,
  uploadingSlots,
  onBulkStatusChange,
}: {
  product: ProductRow;
  existingImages: ListingImage[];
  uploadingSlots: Set<string>;
  onBulkStatusChange: (status: string) => void;
}) {
  const count = IMAGE_SLOTS.filter((slot) =>
    existingImages.some((img) => img.productId === product.id && img.slot === slot)
  ).length;
  const total = IMAGE_SLOTS.length;

  // Bulk value: if every FILLED slot shares one status, show it; else "not_started".
  const filledStatuses = IMAGE_SLOTS
    .map((slot) => existingImages.find((img) => img.productId === product.id && img.slot === slot)?.status)
    .filter((s): s is string => s !== undefined);
  const allSame = filledStatuses.length > 0 && filledStatuses.every((s) => s === filledStatuses[0]);
  const bulkValue = allSame ? filledStatuses[0] : "not_started";
  const hasAny = filledStatuses.length > 0;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="grid grid-cols-5 gap-[3px]">
        {IMAGE_SLOTS.map((slot) => {
          const hasImage = existingImages.some(
            (img) => img.productId === product.id && img.slot === slot
          );
          const isUploading = uploadingSlots.has(`${product.id}-${slot}`);
          return (
            <div
              key={slot}
              title={slot}
              className={cn(
                "size-2 rounded-sm transition-colors",
                isUploading
                  ? "bg-amber-400 animate-pulse"
                  : hasImage
                  ? "bg-emerald-500"
                  : "bg-stone-200 dark:bg-zinc-700"
              )}
            />
          );
        })}
      </div>
      <span className={cn(
        "text-[10px] font-mono font-bold tabular-nums",
        count === total ? "text-emerald-500" : count === 0 ? "text-muted-foreground/50" : "text-amber-500"
      )}>
        {count}/{total}
      </span>
      <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }} className="w-full" onClick={(e) => e.stopPropagation()}>
        <SlotStatusSelect value={bulkValue} onChange={onBulkStatusChange} disabled={!hasAny} fitContent />
      </div>
    </div>
  );
}

function getImageForSlot(existingImages: ListingImage[], product: ProductRow, slot: string): ListingImage | undefined {
  return existingImages.find((img) => img.productId === product.id && img.slot === slot);
}

function DriveFolderLink({
  driveFolderId,
  label,
  className,
}: {
  driveFolderId: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={`https://drive.google.com/drive/folders/${driveFolderId}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className="inline-flex items-center shrink-0 opacity-70 hover:opacity-100 transition-opacity"
    >
      <img src="/drive.png" alt="" className={cn("object-contain", className ?? "size-4")} />
    </a>
  );
}

function ListingImagesColgroup() {
  return (
    <colgroup>
      <col className="w-[150px]" />
      <col className="w-[80px]" />
      <col className="w-[200px]" />
      <col className="w-[88px]" />
      {IMAGE_SLOTS.map((slot) => (
        <col key={slot} />
      ))}
    </colgroup>
  );
}

function ListingImagesThead({ visuallyHidden = false }: { visuallyHidden?: boolean }) {
  return (
    <thead className={visuallyHidden ? "sr-only" : undefined}>
      <tr className="border-b border-stone-100 dark:border-zinc-800 text-left">
        <th className="px-3 py-2.5 font-bold text-brand whitespace-nowrap">
          <div className="flex flex-col items-start gap-0.5">
            <span>ASIN</span>
            <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">SKU</span>
          </div>
        </th>
        <th className="px-3 py-2.5 font-bold text-brand whitespace-nowrap">
          <div className="flex flex-col items-start gap-0.5">
            <span>Status</span>
            <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">Parentage</span>
          </div>
        </th>
        <th className="px-3 py-2.5 font-bold text-brand whitespace-nowrap">Summarized Title</th>
        <th className="px-3 py-2.5 font-bold text-brand whitespace-nowrap">Images Status</th>
        {IMAGE_SLOTS.map((slot) => (
          <th
            key={slot}
            className="px-3 py-2.5 font-bold text-brand whitespace-nowrap text-center"
          >
            {slot}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function VariationCard({ group, uploadMutation, uploadingSlots, existingImages, onSlotStatusChange, onFileChange, onFileDrop, onDelete, onPreview, onOpenVersion }: VariationCardProps) {
  const variationId = group.products.find((p) => p.variationId)?.variationId ?? null;
  const variationFolderId =
    existingImages.find((img) => img.driveFolderId && group.products.some((p) => p.id === img.productId))?.driveFolderId ?? null;
  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card overflow-hidden">
      <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-800/50 border-b border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-brand">
            {group.kind === "hub" ? "Variation" : "Standalone"}
          </span>
          {group.kind === "hub" && (
            <span className="text-xs font-semibold text-foreground truncate max-w-[280px]">
              {group.label}
            </span>
          )}
          {group.kind === "hub" && variationId && (
            <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {variationId}
            </code>
          )}
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground">
            {group.products.length} product{group.products.length !== 1 ? "s" : ""}
          </span>
          {group.kind === "hub" && variationFolderId && (
            <DriveFolderLink driveFolderId={variationFolderId} label="Open variation folder in Google Drive" />
          )}
        </div>
      </div>

      <div>
        <table className="w-full text-xs table-fixed">
          <ListingImagesColgroup />
          <ListingImagesThead visuallyHidden />
          <tbody>
            {group.products.map((product) => {
              const isParent = (product.parentageLevel || "").toLowerCase() === "parent";
              const productFolderId =
                existingImages.find((img) => img.driveFolderId && img.productId === product.id)?.driveFolderId ?? null;
              const summarizedTitle = listingSummarizedTitle(product, group.products);
              return (
                <tr
                  key={product.id}
                  className={cn(
                    "border-b border-stone-50 dark:border-zinc-800/50 transition-colors",
                    isParent && "bg-blue-500/[0.04] dark:bg-blue-400/[0.04]"
                  )}
                >
                  <td className="px-3 py-2 align-top min-w-0">
                    <div className="flex items-start gap-2 min-w-0 w-[150px]">
                      <div className="size-8 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
                        {product.mainImageUrl ? (
                          <Image
                            src={hiResAmazonImg(product.mainImageUrl, 100)}
                            alt=""
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            <PackageOpen className="size-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="flex items-center gap-1 min-w-0">
                          <Link
                            href={`/products/${product.id}?from=listing-images`}
                            className="font-mono font-bold text-xs text-brand hover:underline whitespace-nowrap"
                          >
                            {product.asin || "—"}
                          </Link>
                          <AmazonPdpLink asin={product.asin} />
                          {productFolderId && (
                            <DriveFolderLink driveFolderId={productFolderId} label="Open product folder in Google Drive" className="size-3.5" />
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground line-clamp-2 break-words block">
                          {product.sku || "—"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top min-w-0">
                    <div className="flex flex-col items-start gap-1 min-w-0">
                      {product.status ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap",
                            PRODUCT_STATUS_STYLES[product.status.toLowerCase()] ??
                              "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {product.status}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {product.parentageLevel ? (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap",
                          (product.parentageLevel || "").toLowerCase() === "parent"
                            ? "bg-blue-500/10 text-blue-400"
                            : (product.parentageLevel || "").toLowerCase() === "child"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {product.parentageLevel}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top" title={summarizedTitle || undefined}>
                    <SplitTitle title={summarizedTitle} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {/* Parent rows are header-only: no image counter, no bulk status — they never hold images. */}
                    {!isParent && (
                      <ImageStatusDots
                        product={product}
                        existingImages={existingImages}
                        uploadingSlots={uploadingSlots}
                        onBulkStatusChange={(status) =>
                          onSlotStatusChange(product.id, "_all", status)
                        }
                      />
                    )}
                  </td>
                  {IMAGE_SLOTS.map((slot) => {
                      const img = getImageForSlot(existingImages, product, slot);
                      return (
                        <td key={slot} className="px-1.5 py-2 align-top text-center">
                          <UploadCell
                            product={product}
                            columnName={slot}
                            isUploading={uploadingSlots.has(`${product.id}-${slot}`)}
                            isParent={isParent}
                            existingImage={img}
                            onSlotStatusChange={(status, versionNumber) =>
                              onSlotStatusChange(product.id, slot, status, versionNumber)
                            }
                            onFileChange={onFileChange}
                            onFileDrop={onFileDrop}
                            onDelete={onDelete}
                            onPreview={onPreview}
                            onOpenVersion={onOpenVersion}
                          />
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type UploadCellProps = {
  product: ProductRow;
  columnName: string;
  isUploading: boolean;
  isParent: boolean;
  existingImage: ListingImage | undefined;
  onSlotStatusChange: (status: string, versionNumber?: number) => void;
  onFileChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    product: ProductRow,
    columnName: string
  ) => void;
  onFileDrop: (file: File, product: ProductRow, columnName: string) => void;
  onDelete: (fileId: string) => void;
  onPreview: (img: ListingImage) => void;
  onOpenVersion: (productId: string, slot: string, v: VersionHistory) => void;
};

function VersionBadge({
  product,
  columnName,
  existingImage,
  onStatusChange,
  onOpenVersion,
}: {
  product: ProductRow;
  columnName: string;
  existingImage: ListingImage;
  onStatusChange: (status: string, versionNumber?: number) => void;
  onOpenVersion: (productId: string, slot: string, v: VersionHistory) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: history = [], isLoading } = useQuery<VersionHistory[]>({
    queryKey: ["listing-image-history", product.id, columnName],
    queryFn: () => fetchVersionHistory(product.id, columnName),
    enabled: open,
    staleTime: 30_000,
  });

  const label = `V${existingImage.versionNumber.toString().padStart(2, "0")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded bg-black/65 hover:bg-black/80 px-1 py-px text-[9px] font-bold text-white font-mono leading-none transition-colors"
          aria-label={`${label} — click to view version history`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" side="top" align="start">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {columnName} — Version History
        </p>
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground py-2 text-center">Loading…</div>
        ) : history.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2 text-center">No history found</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded p-1.5 bg-muted/40 hover:bg-muted/70 transition-colors"
              >
                <button
                  type="button"
                  className="shrink-0"
                  onClick={() => {
                    onOpenVersion(product.id, columnName, v);
                    setOpen(false);
                  }}
                  aria-label={`Expand V${v.versionNumber.toString().padStart(2, "0")}`}
                >
                  <img
                    src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(v.driveFileId)}&thumb=1`}
                    alt={v.displayName}
                    className="size-14 rounded object-cover border border-border"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-left"
                    onClick={() => {
                      onOpenVersion(product.id, columnName, v);
                      setOpen(false);
                    }}
                  >
                    <span className="text-[10px] font-bold font-mono text-brand">
                      {`V${v.versionNumber.toString().padStart(2, "0")}`}
                    </span>
                    {v.status === "live" && (
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-500 rounded px-1 font-bold">
                        Live
                      </span>
                    )}
                  </button>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {new Date(v.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                  <div onClick={(e) => e.stopPropagation()} className="mt-1 flex flex-col gap-1">
                    <SlotStatusSelect
                      value={v.status}
                      compact
                      onChange={(status) => onStatusChange(status, v.versionNumber)}
                    />
                    {v.status !== "live" && (
                      <button
                        type="button"
                        onClick={() => onStatusChange("live", v.versionNumber)}
                        className="w-full rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 transition-colors"
                      >
                        Set as Live
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UploadCell({ product, columnName, isUploading, isParent, existingImage, onSlotStatusChange, onFileChange, onFileDrop, onDelete, onPreview, onOpenVersion }: UploadCellProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Parent rows are header-only: no dropzone, no status, no slot placeholder at all.
  if (isParent) {
    return null;
  }
  const thumbUrl = existingImage
    ? `/api/design/listing-images/image?driveFileId=${encodeURIComponent(existingImage.driveFileId)}&thumb=1`
    : null;
  // Status-colored frame: every filled thumbnail borders in its status color
  // (approved=teal vs live=emerald are intentionally distinct here).
  const frameClass =
    SLOT_STATUS_OPTIONS.find((o) => o.value === existingImage?.status)?.frameClass ??
    "border-stone-200 dark:border-zinc-700";

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileDrop(file, product, columnName);
  };

  return (
    <div className="flex flex-col items-center gap-0 w-full">
      {thumbUrl ? (
        <div
          className={cn(
            "relative group w-full aspect-square rounded border-2 overflow-hidden bg-stone-100 dark:bg-zinc-900/40",
            isDragging ? "border-brand ring-2 ring-brand/30" : frameClass
          )}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            // Ignore leave events that are still inside this cell (child nodes).
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setIsDragging(false);
          }}
        >
          <button
            type="button"
            className="block size-full"
            onClick={() => existingImage && onPreview(existingImage)}
          >
            <img
              src={thumbUrl}
              alt=""
              className="size-full object-cover pointer-events-none"
            />
          </button>
          {existingImage && (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
              className="absolute bottom-1 left-1 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <VersionBadge
                product={product}
                columnName={columnName}
                existingImage={existingImage}
                onStatusChange={onSlotStatusChange}
                onOpenVersion={onOpenVersion}
              />
            </div>
          )}
          {isUploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none">
              <Loader2 className="size-4 animate-spin text-white" />
            </div>
          ) : null}
          {isDragging ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand/20 pointer-events-none">
              <span className="text-[10px] font-bold text-brand-solid bg-white/90 dark:bg-zinc-900/90 px-2 py-1 rounded">
                Drop to replace or version
              </span>
            </div>
          ) : (
            // Visual-only overlay — pointer-events-none so file drops hit the cell
            // handlers above (the Expand button previously swallowed dragover).
            <div
              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              aria-hidden
            >
              <span className="text-white text-[10px] font-bold">Expand</span>
            </div>
          )}
        </div>
      ) : (
        <label
          className={cn(
            "cursor-pointer block w-full aspect-square rounded-md border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-1",
            isUploading
              ? "border-amber-300 bg-amber-50 dark:bg-amber-900/10"
              : isDragging
              ? "border-brand bg-brand/5"
              : "border-stone-200 hover:border-stone-400 bg-stone-50/50 hover:bg-stone-100/60 dark:border-zinc-700 dark:hover:border-zinc-500 dark:bg-zinc-800/30"
          )}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin text-amber-500" />
          ) : (
            <span className={cn("text-sm font-bold tracking-wide transition-colors", isDragging ? "text-brand" : "text-stone-400 dark:text-zinc-500")}>
              {columnName}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFileChange(e, product, columnName)}
            disabled={isUploading}
          />
        </label>
      )}
      <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }} className="w-full" onClick={(e) => e.stopPropagation()}>
        <SlotStatusSelect
          value={existingImage?.status ?? "not_started"}
          disabled={!existingImage}
          fitContent
          onChange={(status) => onSlotStatusChange(status, existingImage?.versionNumber)}
        />
      </div>
    </div>
  );
}
