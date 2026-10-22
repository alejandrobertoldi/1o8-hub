"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  SECTION_LAYOUTS,
  STOREFRONT_MODULE_SPECS,
  type SectionLayout,
  type SplitLayout,
} from "@/lib/storefront/module-specs";
import { StorefrontAssetUpload } from "./storefront-asset-upload";
import { SplitSectionConfig } from "./storefront-split-config";
import type { StorefrontModuleDTO } from "./storefront-page-editor";

export interface StorefrontModuleConfigProps {
  module: StorefrontModuleDTO;
  clientIdCode: string;
  /** Called after a successful delete so the parent can clear selection. */
  onDeleted?: () => void;
}

type ModulePatch = Partial<{
  title: string;
  linkUrl: string;
  linkLabel: string;
  position: number;
  containsAiPeople: boolean;
  sectionLayout: SectionLayout | SplitLayout;
}>;

async function patchModule(moduleId: string, data: ModulePatch) {
  const res = await fetch(`/api/storefront/modules/${moduleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Failed to save");
  return d;
}

/**
 * Right-pane config panel for the currently selected storefront module.
 * Holds the asset upload(s), per-type fields (AI checkbox / Fill·Fit·Text /
 * Title / Link) and the delete button. Reorder lives in the center preview.
 */
export function StorefrontModuleConfig({
  module,
  clientIdCode,
  onDeleted,
}: StorefrontModuleConfigProps) {
  const spec = STOREFRONT_MODULE_SPECS[module.moduleType];
  const qc = useQueryClient();

  const [title, setTitle] = useState(module.title ?? "");
  const [linkUrl, setLinkUrl] = useState(module.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(module.linkLabel ?? "");

  // Re-sync local field state when the server value changes (e.g. after query
  // invalidation), adjusting state during render per React guidance — avoids the
  // setState-in-effect cascade. https://react.dev/learn/you-might-not-need-an-effect
  const [syncedFrom, setSyncedFrom] = useState({
    id: module.id,
    title: module.title,
    linkUrl: module.linkUrl,
    linkLabel: module.linkLabel,
  });
  if (
    syncedFrom.id !== module.id ||
    syncedFrom.title !== module.title ||
    syncedFrom.linkUrl !== module.linkUrl ||
    syncedFrom.linkLabel !== module.linkLabel
  ) {
    setSyncedFrom({
      id: module.id,
      title: module.title,
      linkUrl: module.linkUrl,
      linkLabel: module.linkLabel,
    });
    setTitle(module.title ?? "");
    setLinkUrl(module.linkUrl ?? "");
    setLinkLabel(module.linkLabel ?? "");
  }

  const fieldMut = useMutation({
    mutationFn: (data: ModulePatch) => patchModule(module.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/storefront/modules/${module.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storefront", clientIdCode] });
      toast.success("Module removed");
      onDeleted?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  function blurField(
    field: "title" | "linkUrl" | "linkLabel",
    value: string,
    saved: string | null
  ) {
    const trimmed = value.trim();
    if (trimmed === (saved?.trim() ?? "")) return;
    fieldMut.mutate({ [field]: trimmed });
  }

  const busy = fieldMut.isPending || deleteMut.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-zinc-800 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Editing
          </p>
          <p className="text-sm font-bold text-brand truncate">{spec.label}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-red-600 hover:text-red-700 shrink-0"
          disabled={busy}
          onClick={() => {
            if (confirm(`Remove this ${spec.label} module? This deletes its asset from Drive.`)) {
              deleteMut.mutate();
            }
          }}
          aria-label="Delete module"
        >
          {deleteMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </div>

      {/* Body — per-type fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {module.moduleType === "header" && (
          <>
            <StorefrontAssetUpload
              moduleId={module.id}
              spec={STOREFRONT_MODULE_SPECS.header}
              slot="main"
              driveFileId={module.driveFileId}
              assetFilename={module.assetFilename}
              clientIdCode={clientIdCode}
            />
            <AiPeopleCheckbox
              id={`contains-ai-people-${module.id}`}
              checked={module.containsAiPeople}
              disabled={busy}
              onChange={(v) => fieldMut.mutate({ containsAiPeople: v })}
            />
          </>
        )}

        {module.moduleType === "video" && (
          <>
            <StorefrontAssetUpload
              moduleId={module.id}
              spec={STOREFRONT_MODULE_SPECS.video}
              slot="main"
              driveFileId={module.driveFileId}
              assetFilename={module.assetFilename}
              clientIdCode={clientIdCode}
            />
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Cover image{" "}
                <span className="font-normal normal-case">
                  (shown when the video isn&rsquo;t playing)
                </span>
              </label>
              <StorefrontAssetUpload
                moduleId={module.id}
                spec={STOREFRONT_MODULE_SPECS.cover_image}
                slot="poster"
                driveFileId={module.posterDriveFileId}
                assetFilename={module.posterFilename}
                clientIdCode={clientIdCode}
              />
            </div>
          </>
        )}

        {module.moduleType === "image" && (
          <>
            <StorefrontAssetUpload
              moduleId={module.id}
              spec={STOREFRONT_MODULE_SPECS.image}
              slot="main"
              driveFileId={module.driveFileId}
              assetFilename={module.assetFilename}
              clientIdCode={clientIdCode}
            />

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Choose section layout
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SECTION_LAYOUTS.map((layout) => {
                  const active = (module.sectionLayout ?? "fill") === layout;
                  return (
                    <button
                      key={layout}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!active) fieldMut.mutate({ sectionLayout: layout });
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize disabled:opacity-50",
                        active
                          ? "bg-brand/10 border-brand/40 text-brand"
                          : "bg-card border-stone-200 dark:border-zinc-800 text-muted-foreground hover:text-foreground hover:border-stone-300 dark:hover:border-zinc-700"
                      )}
                      aria-pressed={active}
                    >
                      {layout}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Title <span className="font-normal normal-case">(optional)</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => blurField("title", title, module.title)}
                placeholder="Module title"
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
                  onBlur={() => blurField("linkUrl", linkUrl, module.linkUrl)}
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
                  onBlur={() => blurField("linkLabel", linkLabel, module.linkLabel)}
                  placeholder="Shop now"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <AiPeopleCheckbox
              id={`contains-ai-people-${module.id}`}
              checked={module.containsAiPeople}
              disabled={busy}
              onChange={(v) => fieldMut.mutate({ containsAiPeople: v })}
            />
          </>
        )}

        {module.moduleType === "split_section" && (
          <SplitSectionConfig
            module={module}
            clientIdCode={clientIdCode}
            busy={busy}
            onLayoutChange={(layout) => fieldMut.mutate({ sectionLayout: layout })}
          />
        )}
      </div>
    </div>
  );
}

const AI_PEOPLE_DONT_CHECK = [
  "There are no people in your creative",
  "The people in your creative are real human beings (even if they've been altered with AI-powered tools)",
  "The people in your creative aren't photorealistic",
  "Your creative is an ad for media content, like movies or video games, and the people in your creative are characters from that content",
];

export function AiPeopleCheckbox({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <label
        htmlFor={id}
        className="text-xs text-foreground leading-snug cursor-pointer select-none"
      >
        Contains AI-generated people
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="About AI-generated people disclosure"
            className="shrink-0 text-muted-foreground hover:text-brand transition-colors"
          >
            <Info className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 text-xs leading-relaxed space-y-3"
        >
          <p className="text-muted-foreground">
            Check this box if your assets or product images include AI-generated,
            photorealistic people. (This doesn&rsquo;t apply to AI-generated
            representations of real people, like models and actors.) If your creative
            includes AI-generated, photorealistic people, some places (like New York
            state) require you to disclose that in your ads. If you check this box,
            Amazon will add an icon to places displayed in this ad, indicating that the
            people in the ad may be AI-generated.
          </p>
          <div className="space-y-1">
            <p className="font-bold text-foreground">Don&rsquo;t check this box if:</p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              {AI_PEOPLE_DONT_CHECK.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
