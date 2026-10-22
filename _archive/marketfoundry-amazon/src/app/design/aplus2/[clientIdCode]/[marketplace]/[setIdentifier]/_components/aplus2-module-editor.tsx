"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  APLUS2_MODULE_SPECS, getAplus2ModuleLayout,
  type Aplus2ModuleType, type Aplus2LayoutItem, type Aplus2ModuleSpec,
  type Aplus2TextFieldSpec,
} from "@/lib/aplus2/module-specs";
import { useDebouncedPatch } from "./use-debounced-patch";
import { Aplus2ImageSlot, Aplus2GenerateAltTextBtn } from "./aplus2-image-slot";
import { Aplus2RepeatableItems } from "./aplus2-repeatable-items";
import { Aplus2VideoSlot } from "./aplus2-video-slot";
import { Aplus2QaPopulate } from "./aplus2-qa-populate";
import { Aplus2TextField } from "./aplus2-text-field";
import { cn } from "@/lib/utils";
import {
  getStatusMeta,
  STATUS_MENU_ITEM_CLASS,
  STATUS_VERSION_TRIGGER_CLASS,
  type DesignStatusValue,
} from "@/lib/design-status";

type ItemDto = { id: string; position: number; data: Record<string, unknown> };
type AssetDto = { id: string; kind: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };
export type ModuleDto = {
  id: string; position: number; moduleType: string; status: string;
  headlineText: string | null; subheadlineText: string | null; bodyText: string | null; overlayText: string | null;
  altText: string | null; mobileAltText: string | null; imageDescription: string | null; aiImagePrompt: string | null; cosmoRelationType: string | null;
  videoDriveFileId: string | null; videoTitle: string | null; videoDescription: string | null;
  textPosition: string | null; fontColor: string | null; figmaUrl: string | null; markupUrl: string | null;
  items: ItemDto[]; assets: AssetDto[];
};

const MODULE_STATUSES = ["draft", "in_review", "approved", "uploaded", "live"] as const;

const MODULE_STATUS_TO_DESIGN: Record<(typeof MODULE_STATUSES)[number], DesignStatusValue> = {
  draft: "not_started",
  in_review: "in_review",
  approved: "approved",
  uploaded: "in_progress",
  live: "live",
};

const STATUS_LABEL = {
  draft:     "Draft",
  in_review: "In Review",
  approved:  "Approved",
  uploaded:  "Uploaded",
  live:      "Live",
} as const;

type PatchValues = {
  headlineText: string;
  subheadlineText: string;
  bodyText: string;
  overlayText: string;
  altText: string;
  mobileAltText: string;
  videoTitle: string;
  videoDescription: string;
  textPosition: string;
  fontColor: string;
};

export function Aplus2ModuleEditor({
  module, versionId,
}: {
  module: ModuleDto;
  versionId: string;
}) {
  const spec = APLUS2_MODULE_SPECS[module.moduleType as Aplus2ModuleType];
  const qc = useQueryClient();

  const { values, setField } = useDebouncedPatch<PatchValues>({
    endpoint: `/api/aplus2/modules/${module.id}`,
    initial: {
      headlineText: module.headlineText ?? "",
      subheadlineText: module.subheadlineText ?? "",
      bodyText: module.bodyText ?? "",
      overlayText: module.overlayText ?? "",
      altText: module.altText ?? "",
      mobileAltText: module.mobileAltText ?? "",
      videoTitle: module.videoTitle ?? "",
      videoDescription: module.videoDescription ?? "",
      textPosition: module.textPosition ?? "",
      fontColor: module.fontColor ?? "",
    },
  });

  const statusMut = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`/api/aplus2/modules/${module.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${module.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (!spec) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
        Unknown module type: {module.moduleType}
      </div>
    );
  }

  const layout = getAplus2ModuleLayout(spec);
  const nonAltTextFields = spec.textFields.filter((f) => f.key !== "altText");
  // One alt text per image, mirrored to desktop + mobile (Amazon A+ alt is per-image).
  const setAltBoth = (v: string) => { setField("altText", v); setField("mobileAltText", v); };
  const hasTwoCol = spec.imageSlots.length > 0 && (nonAltTextFields.length > 0 || spec.layoutControls?.length);
  const firstSlotKey = spec.imageSlots[0]?.key;
  const firstDesktopAsset = firstSlotKey
    ? module.assets.find(
        (a) => a.slotKey === firstSlotKey && a.variant === "desktop" && !a.moduleItemId
      ) ?? null
    : null;
  const showAltGenerate = spec.imageSlots.length > 0;
  const statusMeta = getStatusMeta(
    MODULE_STATUS_TO_DESIGN[module.status as keyof typeof MODULE_STATUS_TO_DESIGN] ?? "not_started"
  );

  return (
    <div className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 p-[5px] bg-stone-50 dark:bg-zinc-800/40">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-mono font-bold leading-none text-brand">
            M{String(module.position).padStart(2, "0")}
          </span>
          <span className="inline-flex h-9 min-w-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand">
            <span className="truncate">{spec.label}</span>
          </span>
        </div>
        {showAltGenerate && (
          <Aplus2GenerateAltTextBtn
            className="min-w-0 flex-1"
            draftKey={`${versionId}:${module.id}:module`}
            asset={firstDesktopAsset}
            altText={values.altText}
            onCommit={setAltBoth}
          />
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Select value={module.status} onValueChange={(s) => statusMut.mutate(s)}>
            <SelectTrigger
              aria-label="Module status"
              className={cn(
                STATUS_VERSION_TRIGGER_CLASS,
                "w-fit border justify-start gap-1",
                statusMeta.chipClass,
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULE_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full shrink-0 ${getStatusMeta(MODULE_STATUS_TO_DESIGN[s]).dotClass}`} />
                    {STATUS_LABEL[s]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 w-9 rounded-full border-0 bg-brand-red p-0 text-white hover:bg-brand-red/90"
            onClick={() => { if (confirm("Delete module?")) deleteMut.mutate(); }}
            aria-label="Remove module"
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {module.moduleType === "qa" && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-stone-200 dark:border-zinc-800 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">Populate from SEO Manager</span>
            <Aplus2QaPopulate moduleId={module.id} />
          </div>
        )}
        {hasTwoCol ? (
          <div className="grid grid-cols-2 gap-6">
            {/* Left: image slots (alt text rendered inline below images) */}
            <div className="space-y-4">
              {spec.imageSlots.map((s, idx) => (
                <Aplus2ImageSlot
                  key={s.key}
                  spec={s}
                  assets={module.assets}
                  versionId={versionId}
                  moduleId={module.id}
                  hideLabel
                  hideGenerate
                  {...(idx === 0 ? { altText: values.altText, onAltTextChange: setAltBoth } : {})}
                />
              ))}
            </div>
            {/* Right: text fields (excluding altText) + layout controls */}
            <div className="space-y-4">
              {nonAltTextFields.map((f) => (
                <ModuleTextField
                  key={f.key}
                  field={f}
                  value={(values[f.key as keyof PatchValues] as string) ?? ""}
                  onCommit={(v) => setField(f.key as keyof PatchValues, v)}
                />
              ))}
              {spec.layoutControls?.map((c) => (
                <div key={c.key}>
                  <Label className="text-xs">{c.key === "text_position" ? "Text position" : "Font color"}</Label>
                  <Select
                    value={(values[c.key === "text_position" ? "textPosition" : "fontColor"]) || ""}
                    onValueChange={(v) => setField(c.key === "text_position" ? "textPosition" : "fontColor", v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {c.options.map((opt) => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        ) : (
          layout.map((item, i) => renderLayoutItem(item, i, spec, values, setField, module, versionId))
        )}

        {/* Full-width below the two-column section: repeatable items and video slot */}
        {hasTwoCol && spec.repeatableGroup && (
          <Aplus2RepeatableItems spec={spec} items={module.items} assets={module.assets} versionId={versionId} moduleId={module.id} />
        )}
        {hasTwoCol && spec.video && (
          <Aplus2VideoSlot
            spec={spec.video}
            versionId={versionId}
            moduleId={module.id}
            asset={module.assets.find((a) => a.kind === "video" && !a.moduleItemId) ?? null}
            videoTitle={values.videoTitle}
            videoDescription={values.videoDescription}
            onMetaChange={(field, value) => setField(field, value)}
          />
        )}
      </div>
    </div>
  );
}

function ModuleTextField({
  field,
  value,
  onCommit,
}: {
  field: Aplus2TextFieldSpec;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <Aplus2TextField
      label={field.label}
      initialValue={value}
      onCommit={onCommit}
      maxLength={field.maxLength}
      multiline={field.multiline}
      rows={field.rows}
      placeholder={field.hint}
    />
  );
}

type SpecType = Aplus2ModuleSpec;

function renderLayoutItem(
  item: Aplus2LayoutItem,
  i: number,
  spec: SpecType,
  values: PatchValues,
  setField: (key: keyof PatchValues, value: string) => void,
  module: ModuleDto,
  versionId: string,
): React.ReactNode {
  if (item.type === "textField") {
    const f = spec.textFields.find((t) => t.key === item.fieldKey);
    if (!f) return null;
    return (
      <ModuleTextField
        key={`tf-${i}`}
        field={f}
        value={values[f.key] ?? ""}
        onCommit={(v) => setField(f.key, v)}
      />
    );
  }
  if (item.type === "imageSlot") {
    const s = spec.imageSlots.find((x) => x.key === item.slotKey);
    if (!s) return null;
    const isFirstImage = s.key === spec.imageSlots[0]?.key;
    return (
      <Aplus2ImageSlot
        key={`is-${i}`}
        spec={s}
        assets={module.assets}
        versionId={versionId}
        moduleId={module.id}
        hideGenerate
        {...(isFirstImage ? {
          altText: values.altText,
          onAltTextChange: (v: string) => { setField("altText", v); setField("mobileAltText", v); },
        } : {})}
      />
    );
  }
  if (item.type === "videoSlot" && spec.video) {
    const videoAsset = module.assets.find((a) => a.kind === "video" && !a.moduleItemId);
    return (
      <Aplus2VideoSlot
        key={`v-${i}`}
        spec={spec.video}
        versionId={versionId}
        moduleId={module.id}
        asset={videoAsset ?? null}
        videoTitle={values.videoTitle}
        videoDescription={values.videoDescription}
        onMetaChange={(field, value) => setField(field, value)}
      />
    );
  }
  if (item.type === "repeatableGroup" && spec.repeatableGroup) {
    return <Aplus2RepeatableItems key={`rg-${i}`} spec={spec} items={module.items} assets={module.assets} versionId={versionId} moduleId={module.id} />;
  }
  return null;
}
