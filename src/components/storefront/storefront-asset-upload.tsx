/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Video as VideoIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inferStorefrontMime } from "@/lib/storefront/asset-mime";
import type { StorefrontModuleSpec } from "@/lib/storefront/module-specs";

export type AssetSlot = "main" | "poster";

export interface StorefrontAssetUploadProps {
  moduleId: string;
  /** The spec used to validate/hint and pick the preview renderer. */
  spec: StorefrontModuleSpec;
  /** Which asset slot this control manages. */
  slot?: AssetSlot;
  /** The Drive file id for THIS slot (main → driveFileId, poster → posterDriveFileId). */
  driveFileId: string | null;
  assetFilename: string | null;
  clientIdCode: string;
  /** Override the asset endpoint base (default: the module asset route). Tiles pass their own route. */
  endpointBase?: string;
}

function dimensionHint(spec: StorefrontModuleSpec): string {
  const parts: string[] = [];
  if (spec.minWidth && spec.minHeight) {
    parts.push(`at least ${spec.minWidth} × ${spec.minHeight} px`);
  } else if (spec.minWidth) {
    parts.push(`at least ${spec.minWidth} px wide`);
  }
  if (spec.maxBytes) {
    parts.push(`max ${Math.round(spec.maxBytes / (1024 * 1024))} MB`);
  }
  const noun = spec.kind === "video" ? "Video" : "Image";
  return parts.length ? `${noun} ${parts.join(", ")}` : `${noun}`;
}

/** Read an image File's natural dimensions client-side. Resolves {0,0} on error. */
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function assetProxyUrl(driveFileId: string, kind: "image" | "video" = "image") {
  const q = new URLSearchParams({ driveFileId });
  if (kind === "video") q.set("kind", "video");
  return `/api/storefront/image?${q}`;
}

async function readUploadError(res: Response, fallback: string): Promise<string> {
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
 * Upload a storefront asset by PUTting bytes straight to Google Drive.
 *
 * Vercel caps serverless request bodies at ~4.5 MB. A 5.7 MB image posted as
 * FormData never reaches the route. Metadata-only session + record calls keep
 * the Hub payload tiny; the file goes to Drive.
 */
export async function uploadStorefrontAsset(opts: {
  assetEndpoint: string;
  file: File;
  slot?: AssetSlot;
  width?: number;
  height?: number;
}): Promise<{ driveFileId: string; warnings: string[] }> {
  const mimeType = inferStorefrontMime(opts.file);
  const payload = {
    slot: opts.slot ?? "main",
    mimeType,
    fileSize: opts.file.size,
    width: opts.width,
    height: opts.height,
    originalName: opts.file.name,
  };

  const sessionRes = await fetch(`${opts.assetEndpoint}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!sessionRes.ok) {
    throw new Error(await readUploadError(sessionRes, "Could not start the upload"));
  }
  const session = (await sessionRes.json()) as { sessionUri: string };

  const putRes = await fetch(session.sessionUri, {
    method: "PUT",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body: opts.file,
  });
  if (!putRes.ok) {
    throw new Error(
      `Drive rejected ${opts.file.name} (${putRes.status}). Reload and try again.`
    );
  }
  const driveResult = (await putRes.json()) as { id?: string };
  if (!driveResult.id) {
    throw new Error("Drive did not return a file ID for the upload");
  }

  const recordRes = await fetch(`${opts.assetEndpoint}/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, driveFileId: driveResult.id }),
  });
  if (!recordRes.ok) {
    throw new Error(
      await readUploadError(
        recordRes,
        `${opts.file.name} reached Drive but could not be recorded`
      )
    );
  }
  const recorded = (await recordRes.json()) as { driveFileId: string; warnings?: string[] };
  return { driveFileId: recorded.driveFileId, warnings: recorded.warnings ?? [] };
}

export function StorefrontAssetUpload({
  moduleId,
  spec,
  slot = "main",
  driveFileId,
  assetFilename,
  clientIdCode,
  endpointBase,
}: StorefrontAssetUploadProps) {
  const endpoint = endpointBase ?? `/api/storefront/modules/${moduleId}/asset`;
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const accept =
    spec.kind === "video" ? "video/*" : "image/png,image/jpeg,image/webp";

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setWarnings([]);
    try {
      let width: number | undefined;
      let height: number | undefined;
      if (spec.kind === "image") {
        const dims = await readImageDimensions(file);
        width = dims.width || undefined;
        height = dims.height || undefined;
      }
      const data = await uploadStorefrontAsset({
        assetEndpoint: endpoint,
        file,
        slot,
        width,
        height,
      });
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Asset uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${endpoint}?slot=${slot}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to remove asset");
      return d;
    },
    onSuccess: () => {
      setWarnings([]);
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Asset removed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to remove asset");
    },
  });

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  const Icon = spec.kind === "video" ? VideoIcon : ImageIcon;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleSelect}
      />

      <div
        className={cn(
          "relative group w-full rounded-md border bg-stone-50 dark:bg-zinc-950 overflow-hidden",
          driveFileId
            ? "border-stone-200 dark:border-zinc-800"
            : "border-2 border-dashed border-stone-300 dark:border-zinc-700",
          isDragging && "ring-2 ring-inset ring-brand border-brand"
        )}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
      >
        {driveFileId ? (
          <>
            {spec.kind === "video" ? (
              <video
                src={assetProxyUrl(driveFileId, "video")}
                controls
                className="w-full h-auto block bg-black"
              />
            ) : (
              <img
                src={assetProxyUrl(driveFileId)}
                alt={assetFilename ?? "Storefront asset"}
                className="w-full h-auto object-contain block"
              />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 animate-spin text-white" />
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-video w-full flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground hover:bg-stone-100/60 dark:hover:bg-zinc-900/60 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Icon
                className={cn(
                  "size-7",
                  isDragging ? "text-brand" : "text-muted-foreground/50"
                )}
              />
            )}
            <span className="font-medium">
              {uploading ? "Uploading…" : "Click or drop a file to upload"}
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              {dimensionHint(spec)}
            </span>
          </button>
        )}
      </div>

      {driveFileId && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-muted-foreground truncate min-w-0">
            {assetFilename ?? "asset"}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-[11px] font-bold text-brand hover:underline disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending || uploading}
              className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
            >
              {deleteMut.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3" />
              )}
              Remove
            </button>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-amber-600 dark:text-amber-500">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
