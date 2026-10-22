"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlipHorizontal2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SPLIT_LAYOUT,
  SPLIT_LAYOUTS,
  SPLIT_PICKER_GROUPS,
  STOREFRONT_MODULE_SPECS,
  canonicalSplitLayoutKey,
  flipSplitLayoutKey,
  isFlippedSplitLayout,
  splitTileCount,
  type SplitDevice,
  type SplitLayout,
} from "@/lib/storefront/module-specs";
import { SplitDeviceToggle, SplitLayoutFrame } from "./split-layout-tree";
import { StorefrontAssetUpload } from "./storefront-asset-upload";
import type { StorefrontModuleDTO, StorefrontTileDTO } from "./storefront-page-editor";

export function SplitSectionConfig({
  module,
  clientIdCode,
  busy,
  onLayoutChange,
}: {
  module: StorefrontModuleDTO;
  clientIdCode: string;
  busy: boolean;
  onLayoutChange: (layout: SplitLayout) => void;
}) {
  const stored = module.sectionLayout ?? DEFAULT_SPLIT_LAYOUT;
  const activeCanonical = canonicalSplitLayoutKey(stored);
  const tiles = [...(module.tiles ?? [])].sort((a, b) => a.position - b.position);

  const [flipAll, setFlipAll] = useState(isFlippedSplitLayout(stored));
  const [device, setDevice] = useState<SplitDevice>("desktop");
  const [syncedId, setSyncedId] = useState(module.id + stored);
  if (syncedId !== module.id + stored) {
    setSyncedId(module.id + stored);
    setFlipAll(isFlippedSplitLayout(stored));
  }

  function selectLayout(canonical: string) {
    const next = flipAll ? flipSplitLayoutKey(canonical) : canonical;
    const nextCount = splitTileCount(next);
    if (nextCount < tiles.length) {
      const extra = tiles.length - nextCount;
      if (
        !confirm(
          `This layout uses ${nextCount} tiles. ${extra} extra tile${extra === 1 ? "" : "s"} and ${extra === 1 ? "its image" : "their images"} will be removed.`
        )
      ) {
        return;
      }
    }
    if (next !== stored) onLayoutChange(next);
  }

  function toggleFlip() {
    const nextFlip = !flipAll;
    setFlipAll(nextFlip);
    const next = nextFlip ? flipSplitLayoutKey(activeCanonical) : activeCanonical;
    if (next !== stored) onLayoutChange(next);
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Choose split layout
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={toggleFlip}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-bold transition-colors disabled:opacity-50",
              flipAll ? "text-brand" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={flipAll}
          >
            <FlipHorizontal2 className="size-3.5" />
            Flip all horizontally
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Same layouts, arranged for each device.
          </p>
          <SplitDeviceToggle value={device} onChange={setDevice} disabled={busy} />
        </div>

        {SPLIT_PICKER_GROUPS.map((group) => (
          <div key={group.family} className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className={cn("grid gap-1.5", device === "mobile" ? "grid-cols-2" : "grid-cols-1")}>
              {group.keys.map((key) => {
                const isActive = activeCanonical === key;
                const previewKey = flipAll ? flipSplitLayoutKey(key) : key;
                const tileN = SPLIT_LAYOUTS[key].tiles;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    onClick={() => selectLayout(key)}
                    aria-pressed={isActive}
                    aria-label={`${group.label}, ${tileN} tiles`}
                    className={cn(
                      "rounded-lg border p-1.5 text-left transition-colors disabled:opacity-50",
                      isActive
                        ? "border-brand/40 bg-brand/10"
                        : "border-stone-200 dark:border-zinc-800 bg-card hover:border-stone-300 dark:hover:border-zinc-700"
                    )}
                  >
                    <SplitLayoutFrame
                      layoutKey={previewKey}
                      compact
                      device={device}
                      className="pointer-events-none"
                      gapClassName="gap-px"
                    >
                      {() => (
                        <div
                          className={cn(
                            "h-full w-full border",
                            isActive
                              ? "border-brand/30 bg-brand/20"
                              : "border-stone-300 dark:border-zinc-600 bg-stone-100 dark:bg-zinc-800"
                          )}
                        />
                      )}
                    </SplitLayoutFrame>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tiles.map((tile) => (
        <SplitTileEditor
          key={tile.id}
          tile={tile}
          moduleId={module.id}
          clientIdCode={clientIdCode}
        />
      ))}
    </>
  );
}

function SplitTileEditor({
  tile,
  moduleId,
  clientIdCode,
}: {
  tile: StorefrontTileDTO;
  moduleId: string;
  clientIdCode: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(tile.title ?? "");
  const [linkUrl, setLinkUrl] = useState(tile.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(tile.linkLabel ?? "");

  // Re-sync local state when the server value changes (adjust state during render).
  const [syncedFrom, setSyncedFrom] = useState({
    id: tile.id,
    title: tile.title,
    linkUrl: tile.linkUrl,
    linkLabel: tile.linkLabel,
  });
  if (
    syncedFrom.id !== tile.id ||
    syncedFrom.title !== tile.title ||
    syncedFrom.linkUrl !== tile.linkUrl ||
    syncedFrom.linkLabel !== tile.linkLabel
  ) {
    setSyncedFrom({ id: tile.id, title: tile.title, linkUrl: tile.linkUrl, linkLabel: tile.linkLabel });
    setTitle(tile.title ?? "");
    setLinkUrl(tile.linkUrl ?? "");
    setLinkLabel(tile.linkLabel ?? "");
  }

  const patch = useMutation({
    mutationFn: async (data: Partial<{ title: string; linkUrl: string; linkLabel: string }>) => {
      const res = await fetch(`/api/storefront/modules/${moduleId}/tiles/${tile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
  });

  function blur(field: "title" | "linkUrl" | "linkLabel", value: string, saved: string | null) {
    const trimmed = value.trim();
    if (trimmed === (saved?.trim() ?? "")) return;
    patch.mutate({ [field]: trimmed });
  }

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 dark:border-zinc-800 p-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Tile {tile.position}</p>
      <StorefrontAssetUpload
        moduleId={moduleId}
        endpointBase={`/api/storefront/modules/${moduleId}/tiles/${tile.id}/asset`}
        spec={STOREFRONT_MODULE_SPECS.image}
        slot="main"
        driveFileId={tile.driveFileId}
        assetFilename={tile.assetFilename}
        clientIdCode={clientIdCode}
      />
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Title <span className="font-normal normal-case">(optional)</span>
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => blur("title", title, tile.title)}
          placeholder="Tile title"
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Link URL <span className="font-normal normal-case">(optional)</span>
          </label>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onBlur={() => blur("linkUrl", linkUrl, tile.linkUrl)}
            placeholder="https://…"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Link label <span className="font-normal normal-case">(optional)</span>
          </label>
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            onBlur={() => blur("linkLabel", linkLabel, tile.linkLabel)}
            placeholder="Shop now"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
