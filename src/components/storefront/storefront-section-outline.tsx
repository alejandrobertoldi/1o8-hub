"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  STOREFRONT_MODULE_SPECS,
  splitTileCount,
} from "@/lib/storefront/module-specs";
import { SplitLayoutFrame } from "./split-layout-tree";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StorefrontModuleDTO, StorefrontTileDTO } from "./storefront-page-editor";

const MODULE_DRAG = "text/storefront-module-id";

function assetProxyUrl(driveFileId: string) {
  return `/api/storefront/image?driveFileId=${encodeURIComponent(driveFileId)}`;
}

export function sectionOutlineLabel(module: StorefrontModuleDTO): string {
  if (module.moduleType === "split_section") {
    const n = splitTileCount(module.sectionLayout);
    return `${n} Tiles`;
  }
  return STOREFRONT_MODULE_SPECS[module.moduleType].label;
}

export function StorefrontSectionOutline({
  modules,
  selectedModuleId,
  clientIdCode,
  onSelect,
  onDeleted,
}: {
  modules: StorefrontModuleDTO[];
  selectedModuleId: string | null;
  clientIdCode: string;
  onSelect: (moduleId: string) => void;
  onDeleted?: (moduleId: string) => void;
}) {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const moveMut = useMutation({
    mutationFn: async ({ moduleId, position }: { moduleId: string; position: number }) => {
      const res = await fetch(`/api/storefront/modules/${moduleId}`, {
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

  const deleteMut = useMutation({
    mutationFn: async (moduleId: string) => {
      const res = await fetch(`/api/storefront/modules/${moduleId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      return { moduleId };
    },
    onSuccess: ({ moduleId }) => {
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Module removed");
      onDeleted?.(moduleId);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  function dropOn(targetId: string, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData(MODULE_DRAG) || e.dataTransfer.getData("text/plain");
    setOverId(null);
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const targetIndex = modules.findIndex((m) => m.id === targetId);
    if (targetIndex < 0) return;
    moveMut.mutate({ moduleId: sourceId, position: targetIndex + 1 });
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {modules.map((module) => {
        const selected = module.id === selectedModuleId;
        const label = sectionOutlineLabel(module);
        return (
          <div
            key={module.id}
            onDragOver={(e) => {
              const types = Array.from(e.dataTransfer.types);
              if (types.includes("Files")) return;
              if (!types.includes(MODULE_DRAG) && !types.includes("text/plain")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(module.id);
            }}
            onDragLeave={() => {
              if (overId === module.id) setOverId(null);
            }}
            onDrop={(e) => dropOn(module.id, e)}
            className={cn(
              "rounded-md border bg-white dark:bg-zinc-900 transition-colors",
              selected
                ? "border-brand ring-1 ring-brand/30"
                : "border-stone-200 dark:border-zinc-800",
              overId === module.id && draggingId !== module.id && "border-brand bg-brand/5",
              draggingId === module.id && "opacity-50"
            )}
          >
            <div className="flex items-start gap-0.5">
              <button
                type="button"
                draggable
                aria-label={`Reorder ${label}`}
                className="mt-2 ml-1 shrink-0 cursor-grab touch-none p-1 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MODULE_DRAG, module.id);
                  e.dataTransfer.setData("text/plain", module.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingId(module.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
              >
                <GripVertical className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelect(module.id)}
                className="min-w-0 flex-1 py-2 pr-1 text-left"
              >
                <p className="text-xs font-bold text-foreground">{label}</p>
                <SectionSlots module={module} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="mt-1.5 mr-1 shrink-0 rounded p-1 text-muted-foreground/50 hover:bg-stone-100 hover:text-foreground dark:hover:bg-zinc-800"
                    aria-label={`${label} options`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-700"
                    disabled={deleteMut.isPending}
                    onSelect={() => {
                      if (
                        confirm(
                          `Remove this ${label} module? This deletes its asset from Drive.`
                        )
                      ) {
                        deleteMut.mutate(module.id);
                      }
                    }}
                  >
                    {deleteMut.isPending ? (
                      <Loader2 className="size-3.5 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5 mr-2" />
                    )}
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionSlots({ module }: { module: StorefrontModuleDTO }) {
  if (module.moduleType === "split_section") {
    const byPos = new Map((module.tiles ?? []).map((t) => [t.position, t]));
    return (
      <div className="mt-1.5">
        <SplitLayoutFrame
          layoutKey={module.sectionLayout}
          compact
          className="rounded-sm bg-stone-100 dark:bg-zinc-950"
          gapClassName="gap-px"
        >
          {(tileIndex) => (
            <SlotChip tile={byPos.get(tileIndex)} kind="image" />
          )}
        </SplitLayoutFrame>
      </div>
    );
  }

  const kind = STOREFRONT_MODULE_SPECS[module.moduleType].kind;
  const driveFileId =
    module.moduleType === "video"
      ? module.posterDriveFileId ?? module.driveFileId
      : module.driveFileId;
  return (
    <div className="mt-1.5">
      <SlotChip
        tile={{
          id: module.id,
          position: 1,
          title: module.title,
          linkUrl: null,
          linkLabel: null,
          driveFileId,
          assetMimeType: module.assetMimeType,
          assetFilename: module.assetFilename,
        }}
        kind={kind}
      />
    </div>
  );
}

function SlotChip({
  tile,
  kind,
}: {
  tile: StorefrontTileDTO | undefined;
  kind: "image" | "video";
}) {
  const filled = !!tile?.driveFileId;
  return (
    <div
      className={cn(
        "flex h-full min-h-[28px] w-full items-center justify-center overflow-hidden rounded-[2px] text-[10px] font-semibold",
        filled
          ? "bg-stone-200 dark:bg-zinc-800"
          : "bg-stone-100 text-muted-foreground dark:bg-zinc-800/80"
      )}
    >
      {filled ? (
        <img
          src={assetProxyUrl(tile!.driveFileId!)}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : (
        kind === "video" ? "Video" : "Image"
      )}
    </div>
  );
}
