/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, ImageIcon, Video as VideoIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STOREFRONT_GUTTER_GAP_CLASS } from "@/lib/storefront/layout";
import {
  STOREFRONT_MODULE_SPECS,
  isSingleRowSplit,
  type SplitDevice,
} from "@/lib/storefront/module-specs";
import { SplitLayoutFrame } from "./split-layout-tree";
import { readImageDimensions, uploadStorefrontAsset } from "./storefront-asset-upload";
import type { StorefrontModuleDTO, StorefrontTileDTO } from "./storefront-page-editor";

function assetProxyUrl(driveFileId: string, kind: "image" | "video" = "image") {
  const q = new URLSearchParams({ driveFileId });
  if (kind === "video") q.set("kind", "video");
  return `/api/storefront/image?${q}`;
}

export interface StorefrontModulePreviewProps {
  module: StorefrontModuleDTO;
  index: number;
  count: number;
  clientIdCode: string;
  selected: boolean;
  device?: SplitDevice;
  onSelect: () => void;
}

/**
 * One widget in the store-page canvas. The parent supplies Amazon's white
 * frame (padding + gap). Images use object-contain so assets are never cropped.
 * Selection is an inset brand ring; reorder chrome appears on hover.
 */
export function StorefrontModulePreview({
  module,
  index,
  count,
  clientIdCode,
  selected,
  device = "desktop",
  onSelect,
}: StorefrontModulePreviewProps) {
  const spec = STOREFRONT_MODULE_SPECS[module.moduleType];
  const qc = useQueryClient();

  const moveMut = useMutation({
    mutationFn: async (position: number) => {
      const res = await fetch(`/api/storefront/modules/${module.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to reorder");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reorder"),
  });

  const isFirst = index === 0;
  const isLast = index === count - 1;

  // Video modules prefer the poster image; fall back to the video element.
  const showPoster = module.moduleType === "video" && !!module.posterDriveFileId;
  const showVideo = module.moduleType === "video" && !module.posterDriveFileId && !!module.driveFileId;
  const showImage =
    (module.moduleType === "header" || module.moduleType === "image" || module.moduleType === "cover_image") &&
    !!module.driveFileId;

  const hasAsset = showPoster || showVideo || showImage;

  return (
    <div
      id={`storefront-module-${module.id}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={cn(
        "group relative block w-full overflow-hidden bg-white text-left dark:bg-zinc-900 cursor-pointer",
        selected
          ? "z-[1] ring-2 ring-inset ring-brand"
          : "hover:z-[1] hover:ring-2 hover:ring-inset hover:ring-brand/50"
      )}
    >
      {/* Position + type badge (hover / selected only) */}
      <div
        className={cn(
          "absolute top-2 left-2 z-10 flex items-center gap-1.5 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-solid text-white font-bold shadow-sm">
          {index + 1}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white shadow-sm">
          {spec.label}
        </span>
      </div>

      {/* Reorder controls (top-right, hover/selected) */}
      <div
        className={cn(
          "absolute top-2 right-2 z-10 flex items-center gap-1 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="icon"
          variant="secondary"
          className="size-7 shadow-sm"
          disabled={isFirst || moveMut.isPending}
          onClick={() => moveMut.mutate(index)}
          aria-label="Move up"
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="size-7 shadow-sm"
          disabled={isLast || moveMut.isPending}
          onClick={() => moveMut.mutate(index + 2)}
          aria-label="Move down"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* Asset preview */}
      {module.moduleType === "split_section" ? (
        (() => {
          const tiles = module.tiles ?? [];
          const byPos = new Map(tiles.map((t) => [t.position, t]));
          const intrinsic =
            isSingleRowSplit(module.sectionLayout, device) &&
            tiles.length > 0 &&
            tiles.every((t) => !!t.driveFileId);
          return (
            <SplitLayoutFrame
              layoutKey={module.sectionLayout}
              device={device}
              intrinsic={intrinsic}
              className="bg-white"
              gapClassName={STOREFRONT_GUTTER_GAP_CLASS}
            >
              {(tileIndex) => {
                const tile = byPos.get(tileIndex);
                return (
                  <SplitTileCell
                    tile={tile}
                    tileIndex={tileIndex}
                    moduleId={module.id}
                    clientIdCode={clientIdCode}
                    intrinsic={intrinsic}
                    onSelect={onSelect}
                  />
                );
              }}
            </SplitLayoutFrame>
          );
        })()
      ) : (
        <ModuleAssetDrop
          moduleId={module.id}
          clientIdCode={clientIdCode}
          specKind={spec.kind}
          label={spec.label}
          hasAsset={hasAsset}
          showVideo={showVideo}
          previewFileId={
            showPoster ? module.posterDriveFileId : module.driveFileId
          }
          filename={module.assetFilename}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function ModuleAssetDrop({
  moduleId,
  clientIdCode,
  specKind,
  label,
  hasAsset,
  showVideo,
  previewFileId,
  filename,
  onSelect,
}: {
  moduleId: string;
  clientIdCode: string;
  specKind: "image" | "video";
  label: string;
  hasAsset: boolean;
  showVideo: boolean;
  previewFileId: string | null;
  filename: string | null;
  onSelect: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const Icon = specKind === "video" ? VideoIcon : ImageIcon;
  const accept = specKind === "video" ? "video/*" : "image/png,image/jpeg,image/webp";

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      let width: number | undefined;
      let height: number | undefined;
      if (specKind === "image") {
        const dims = await readImageDimensions(file);
        width = dims.width || undefined;
        height = dims.height || undefined;
      }
      const data = await uploadStorefrontAsset({
        assetEndpoint: `/api/storefront/modules/${moduleId}/asset`,
        file,
        slot: "main",
        width,
        height,
      });
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Asset uploaded");
      if (data.warnings.length) {
        toast.warning(data.warnings[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function takeFile(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  function armDrag(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center justify-center overflow-hidden",
        hasAsset ? "bg-white dark:bg-zinc-900" : "gap-2 bg-stone-50 text-muted-foreground dark:bg-zinc-950",
        dragging && "ring-2 ring-inset ring-brand bg-brand/10"
      )}
      style={hasAsset ? undefined : { aspectRatio: specKind === "video" ? "16 / 9" : "5 / 1" }}
      onDragEnter={armDrag}
      onDragOver={armDrag}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={takeFile}
      onClick={(e) => {
        if (!hasAsset) {
          e.stopPropagation();
          onSelect();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {hasAsset ? (
        showVideo ? (
          <video
            src={assetProxyUrl(previewFileId!, "video")}
            className="pointer-events-none block h-auto w-full bg-black"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={assetProxyUrl(previewFileId!)}
            alt={filename ?? `${label} preview`}
            className="pointer-events-none block h-auto w-full object-contain"
          />
        )
      ) : (
        <>
          <Icon className="pointer-events-none size-7 text-muted-foreground/40" />
          <span className="pointer-events-none text-xs font-medium">{label}</span>
          <span className="pointer-events-none text-[11px] text-muted-foreground/70">
            {uploading ? "Uploading…" : dragging ? "Drop to upload" : specKind === "video" ? "Drop a video or click to add" : "Drop an image or click to add"}
          </span>
        </>
      )}
      {uploading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="size-6 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

function SplitTileCell({
  tile,
  tileIndex,
  moduleId,
  clientIdCode,
  intrinsic,
  onSelect,
}: {
  tile: StorefrontTileDTO | undefined;
  tileIndex: number;
  moduleId: string;
  clientIdCode: string;
  intrinsic: boolean;
  onSelect: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (uploading) return;
    if (!tile) {
      toast.error("This tile is missing. Re-select the layout to recreate it.");
      return;
    }
    setUploading(true);
    try {
      const { width, height } = await readImageDimensions(file);
      const data = await uploadStorefrontAsset({
        assetEndpoint: `/api/storefront/modules/${moduleId}/tiles/${tile.id}/asset`,
        file,
        width: width || undefined,
        height: height || undefined,
      });
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Tile uploaded");
      if (data.warnings.length) {
        toast.warning(data.warnings[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function takeFile(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden bg-white",
        intrinsic ? "flex-col" : "h-full",
        dragging && "ring-2 ring-inset ring-brand bg-brand/10"
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (tile) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (tile) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={takeFile}
      onClick={(e) => {
        if (!tile?.driveFileId) {
          e.stopPropagation();
          onSelect();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {tile?.driveFileId ? (
        <img
          src={assetProxyUrl(tile.driveFileId)}
          alt={tile.title ?? `Tile ${tileIndex}`}
          className={
            intrinsic
              ? "pointer-events-none block h-auto w-full"
              : "pointer-events-none h-full w-full object-cover"
          }
        />
      ) : (
        <span className="pointer-events-none text-[11px] font-medium text-muted-foreground/70">
          {uploading ? "Uploading…" : "+ Add image"}
        </span>
      )}
      {uploading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="size-6 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
