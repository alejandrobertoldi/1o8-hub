"use client";

import { useRef, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  ImageIcon,
  Trash2,
  Plus,
  X,
  HelpCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SUGGESTION_MAX } from "@/lib/brand-story/alt-text-prompt";
import { CopyTextButton } from "@/components/ui/copy-text-button";

export { CopyTextButton };

// ── Shared types (mirror the GET endpoint response) ──────────────────

type AssetDto = {
  id: string;
  driveFileId: string;
  filename: string;
};

type AsinItemDto = {
  id: string;
  position: number;
  asin: string;
  imageAlt: string;
  asset: AssetDto | null;
};

type QaItemDto = {
  id: string;
  position: number;
  question: string;
  answer: string;
};

type ModuleType = "asin-showcase" | "focus-image" | "logo-description" | "qa";

type ModuleDto = {
  id: string;
  position: number;
  type: ModuleType;
  headline: string | null;
  body: string | null;
  imageAlt: string | null;
  brandStoreId: string | null;
  focusAsset: AssetDto | null;
  logoAsset: AssetDto | null;
  asinItems: AsinItemDto[];
  qaItems: QaItemDto[];
};

export type BrandStoryEditorInitial = {
  desktopBgAlt: string;
  mobileBgAlt: string;
  bgDesktop: AssetDto | null;
  bgMobile: AssetDto | null;
  modules: ModuleDto[];
};

const MAX_MODULES = 19;
const MIME_ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

const PRESET_QUESTIONS = [
  "How did we get our start?",
  "What makes our products unique?",
  "Why do we love what we do?",
  "What problem are we solving?",
] as const;

const MODULE_TYPE_LABELS: Record<ModuleType, string> = {
  "asin-showcase": "Brand ASIN & Store Showcase",
  "focus-image": "Brand Focus Image",
  "logo-description": "Brand Logo & Description",
  qa: "Brand Q&A",
};

// ── Alt text generation ───────────────────────────────────────────────

type AltTextJob = {
  driveFileId?: string;
  moduleType: string;
  headline?: string;
  body?: string;
  currentAlt?: string;
};

async function fetchAltText(
  versionId: string,
  job: AltTextJob & { suggestion?: string }
): Promise<string> {
  const res = await fetch(
    `/api/design-status/brand-story-versions/${versionId}/ai/alt-text`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId: job.driveFileId || undefined,
        moduleType: job.moduleType,
        headline: job.headline || undefined,
        body: job.body || undefined,
        currentAlt: job.currentAlt || undefined,
        suggestion: job.suggestion || undefined,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generation failed");
  return (data.altText as string) ?? "";
}

const altSuggestionDrafts = new Map<string, string>();

function suggestionDraftKey(versionId: string, slotId: string) {
  return `${versionId}:${slotId}`;
}

export function GenerateAltTextBtn({
  versionId,
  slotId,
  getJobs,
  onComplete,
  className,
}: {
  versionId: string;
  slotId: string;
  getJobs: () => AltTextJob[];
  onComplete: (results: string[]) => void;
  className?: string;
}) {
  const draftKey = suggestionDraftKey(versionId, slotId);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(
    () => altSuggestionDrafts.get(draftKey) ?? ""
  );
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;

  useEffect(() => {
    const stored = altSuggestionDrafts.get(draftKey) ?? "";
    suggestionRef.current = stored;
    setSuggestion(stored);
  }, [draftKey]);

  function updateSuggestion(value: string) {
    altSuggestionDrafts.set(draftKey, value);
    suggestionRef.current = value;
    setSuggestion(value);
  }

  async function generate() {
    const jobs = getJobs();
    if (jobs.length === 0) return;
    setLoading(true);
    try {
      const hint = suggestionRef.current.trim().slice(0, SUGGESTION_MAX);
      const results = await Promise.all(
        jobs.map((j) =>
          fetchAltText(versionId, {
            ...j,
            currentAlt: hint ? j.currentAlt : undefined,
            suggestion: hint || undefined,
          })
        )
      );
      onComplete(results);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate alt text");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex min-w-[148px] items-center gap-1.5", className ?? "flex-1")}>
      <Input
        value={suggestion}
        onChange={(e) => updateSuggestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!loading) void generate();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="Edit suggestion"
        maxLength={SUGGESTION_MAX}
        aria-label="Edit suggestion"
        className="h-9 min-w-0 flex-1 rounded-full text-[13px] px-3"
      />
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:bg-muted disabled:text-muted-foreground"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5 shrink-0" strokeWidth={1.75} />
        )}
        {loading ? "…" : "Alt text"}
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function imageProxyUrl(driveFileId: string) {
  return `/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(driveFileId)}`;
}

function validateMime(file: File): boolean {
  return MIME_ALLOWED.has(file.type.toLowerCase());
}

// ── Reusable bits ─────────────────────────────────────────────────────

function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span
      className={`text-[10px] font-mono ${over ? "text-red-500" : "text-muted-foreground"}`}
    >
      {value.length} / {max}
    </span>
  );
}

function FieldRow({
  label,
  required,
  children,
  hint,
  help,
  copyValue,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: React.ReactNode;
  help?: { title: string; body: React.ReactNode };
  copyValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs flex items-center gap-1">
          {required && <span className="text-red-500 mr-0.5">*</span>}
          {label}
          {help && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Help: ${label}`}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-xs space-y-2" side="top">
                <p className="font-bold text-sm">{help.title}</p>
                {help.body}
              </PopoverContent>
            </Popover>
          )}
        </Label>
        <div className="flex items-center gap-1.5 shrink-0">
          {copyValue !== undefined && (
            <CopyTextButton value={copyValue} label={label} />
          )}
          {hint}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Alt text wraps onto three lines instead of truncating in a single-line input. */
function AltTextArea({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <Textarea
      value={value}
      maxLength={100}
      rows={3}
      placeholder="Edit alt text"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className="text-xs md:text-xs min-h-16 h-16 max-h-16 resize-none leading-snug py-1.5 field-sizing-fixed break-words overflow-y-auto"
    />
  );
}

// ── ImageSlot ─────────────────────────────────────────────────────────
// Replaces the old preview-only ImageDropzone. Wired to POST / DELETE
// /api/design-status/brand-story-versions/[versionId]/assets endpoints.

type ImageSlotProps = {
  width: number;
  height: number;
  label?: string;
  fixedHeightClass?: string;
  versionId: string;
  clientIdCode: string;
  kind: "bg_desktop" | "bg_mobile" | "focus" | "logo" | "asin";
  moduleId?: string | null;
  asinItemId?: string | null;
  asset: AssetDto | null;
};

function ImageSlot({
  width,
  height,
  label,
  fixedHeightClass,
  versionId,
  clientIdCode,
  kind,
  moduleId,
  asinItemId,
  asset,
}: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("kind", kind);
      if (moduleId) fd.append("moduleId", moduleId);
      if (asinItemId) fd.append("asinItemId", asinItemId);
      fd.append("file", file);
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}/assets`,
        { method: "POST", body: fd }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      return d;
    },
    onSuccess: () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingPreview(null);
      invalidate();
    },
    onError: (err) => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingPreview(null);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}/assets/${assetId}`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: invalidate,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    },
  });

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validateMime(file)) {
      toast.error("Only PNG, JPEG, or WebP images are allowed.");
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(URL.createObjectURL(file));
    uploadMut.mutate(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!validateMime(file)) {
      toast.error("Only PNG, JPEG, or WebP images are allowed.");
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(URL.createObjectURL(file));
    uploadMut.mutate(file);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    if (!asset) return;
    deleteMut.mutate(asset.id);
  }

  const busy = uploadMut.isPending || deleteMut.isPending;
  const previewSrc =
    pendingPreview ?? (asset ? imageProxyUrl(asset.driveFileId) : null);

  return (
    <div
      style={{ aspectRatio: `${width} / ${height}` }}
      className={cn(
        "relative group rounded-[18px] overflow-hidden border-2",
        fixedHeightClass ? `${fixedHeightClass} w-auto max-w-full` : "w-full",
        previewSrc
          ? isDragging
            ? "border-brand"
            : "border-stone-300 dark:border-zinc-700"
          : isDragging
          ? "border-dashed border-brand bg-brand/5"
          : "border-dashed border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900/40"
      )}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleSelect}
      />
      {previewSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt=""
            className="w-full h-full object-contain bg-stone-100 dark:bg-zinc-950"
          />
          <span className="absolute top-1 left-1 text-[9px] font-mono bg-black/60 text-white px-1 py-0.5 rounded">
            {width}×{height}
          </span>
          {asset && !busy && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-1 right-1 size-5 flex items-center justify-center rounded bg-black/60 text-white hover:bg-red-500 transition-colors"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-5 animate-spin text-white" />
            </div>
          )}
          {!busy && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              <span className="text-[10px] font-bold text-white bg-black/70 px-2 py-1 rounded">
                Replace
              </span>
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 hover:bg-stone-100 dark:hover:bg-zinc-900/60 transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon className={cn("size-4 transition-colors", isDragging ? "text-brand" : "text-muted-foreground/60")} />
          )}
          <span className="text-[10px] font-mono font-bold text-foreground/70">
            {width}×{height}
          </span>
          {label && (
            <span className="text-[9px] text-muted-foreground">{label}</span>
          )}
        </button>
      )}
    </div>
  );
}

// ── Module subcomponents ──────────────────────────────────────────────

function AsinShowcaseFields({
  module,
  versionId,
  clientIdCode,
  onChange,
  onBlur,
}: {
  module: ModuleDto;
  versionId: string;
  clientIdCode: string;
  onChange: (m: ModuleDto) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {module.asinItems.map((it, i) => (
          <div
            key={it.id}
            className="grid grid-cols-[1fr_1.5fr] gap-4 rounded-[18px] border border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/20 p-3"
          >
            <ImageSlot
              width={166}
              height={182}
              label={`ASIN ${it.position} image`}
              versionId={versionId}
              clientIdCode={clientIdCode}
              kind="asin"
              asinItemId={it.id}
              asset={it.asset}
            />
            <div className="space-y-3">
              <FieldRow
                label={`ASIN ${it.position}`}
                required
                copyValue={it.asin}
              >
                <Input
                  value={it.asin}
                  placeholder={`Enter ASIN ${it.position}`}
                  maxLength={20}
                  onChange={(e) => {
                    const next = [...module.asinItems];
                    next[i] = { ...it, asin: e.target.value };
                    onChange({ ...module, asinItems: next });
                  }}
                  onBlur={onBlur}
                  className="h-8 text-xs"
                />
              </FieldRow>
              <FieldRow
                label="Image alt text"
                copyValue={it.imageAlt}
                hint={<CharCount value={it.imageAlt} max={100} />}
              >
                <AltTextArea
                  value={it.imageAlt}
                  onChange={(value) => {
                    const next = [...module.asinItems];
                    next[i] = { ...it, imageAlt: value };
                    onChange({ ...module, asinItems: next });
                  }}
                  onBlur={onBlur}
                />
              </FieldRow>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-zinc-800">
        <FieldRow
          label="Headline"
          required
          copyValue={module.headline ?? ""}
          hint={<CharCount value={module.headline ?? ""} max={30} />}
        >
          <Input
            value={module.headline ?? ""}
            maxLength={30}
            placeholder="Enter headline text"
            onChange={(e) => onChange({ ...module, headline: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-xs"
          />
        </FieldRow>
        <FieldRow
          label="Brand Store ID"
          copyValue={module.brandStoreId ?? ""}
          help={{
            title: "Backup Brand Store ID",
            body: (
              <>
                <p>Enter a backup brand store ID in case your ASIN goes out of stock.</p>
                <p>
                  Your Brand Store ID is the letters and numbers after
                  {" "}<span className="font-mono">/stores/page/</span>{" "}
                  in the URL for your Amazon Brand Store.
                </p>
                <p className="break-all">
                  Example:{" "}
                  <span className="font-mono">
                    https://www.amazon.com/stores/page/
                    <span className="font-bold">XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXXXX</span>
                  </span>
                </p>
              </>
            ),
          }}
        >
          <Input
            value={module.brandStoreId ?? ""}
            maxLength={100}
            placeholder="Optional — for 'Shop All' link"
            onChange={(e) => onChange({ ...module, brandStoreId: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-xs"
          />
        </FieldRow>
      </div>
    </div>
  );
}

function FocusImageFields({
  module,
  versionId,
  clientIdCode,
  onChange,
  onBlur,
}: {
  module: ModuleDto;
  versionId: string;
  clientIdCode: string;
  onChange: (m: ModuleDto) => void;
  onBlur: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1.5fr] gap-4">
      <ImageSlot
        width={362}
        height={453}
        label="Focus image"
        versionId={versionId}
        clientIdCode={clientIdCode}
        kind="focus"
        moduleId={module.id}
        asset={module.focusAsset}
      />
      <div className="space-y-3">
        <FieldRow
          label="Image alt text"
          required
          copyValue={module.imageAlt ?? ""}
          hint={<CharCount value={module.imageAlt ?? ""} max={100} />}
        >
          <AltTextArea
            value={module.imageAlt ?? ""}
            onChange={(value) => onChange({ ...module, imageAlt: value })}
            onBlur={onBlur}
          />
        </FieldRow>
        <FieldRow
          label="Headline"
          copyValue={module.headline ?? ""}
          hint={<CharCount value={module.headline ?? ""} max={30} />}
        >
          <Input
            value={module.headline ?? ""}
            maxLength={30}
            placeholder="Enter headline (optional)"
            onChange={(e) => onChange({ ...module, headline: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-xs"
          />
        </FieldRow>
        <FieldRow
          label="Body text"
          copyValue={module.body ?? ""}
          hint={<CharCount value={module.body ?? ""} max={135} />}
        >
          <Textarea
            value={module.body ?? ""}
            maxLength={135}
            placeholder="Enter body text (optional)"
            onChange={(e) => onChange({ ...module, body: e.target.value })}
            onBlur={onBlur}
            className="text-xs min-h-[80px]"
          />
        </FieldRow>
      </div>
    </div>
  );
}

function LogoDescriptionFields({
  module,
  versionId,
  clientIdCode,
  onChange,
  onBlur,
}: {
  module: ModuleDto;
  versionId: string;
  clientIdCode: string;
  onChange: (m: ModuleDto) => void;
  onBlur: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1.5fr] gap-4">
      <div className="space-y-2">
        <ImageSlot
          width={315}
          height={145}
          label="Logo"
          versionId={versionId}
          clientIdCode={clientIdCode}
          kind="logo"
          moduleId={module.id}
          asset={module.logoAsset}
        />
      </div>
      <div className="space-y-3">
        <FieldRow
          label="Image alt text"
          required
          copyValue={module.imageAlt ?? ""}
          hint={<CharCount value={module.imageAlt ?? ""} max={100} />}
        >
          <AltTextArea
            value={module.imageAlt ?? ""}
            onChange={(value) => onChange({ ...module, imageAlt: value })}
            onBlur={onBlur}
          />
        </FieldRow>
        <FieldRow
          label="Headline"
          required
          copyValue={module.headline ?? ""}
          hint={<CharCount value={module.headline ?? ""} max={30} />}
        >
          <Input
            value={module.headline ?? ""}
            maxLength={30}
            placeholder="Enter headline text"
            onChange={(e) => onChange({ ...module, headline: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-xs"
          />
        </FieldRow>
        <FieldRow
          label="Body text"
          required
          copyValue={module.body ?? ""}
          hint={<CharCount value={module.body ?? ""} max={450} />}
        >
          <Textarea
            value={module.body ?? ""}
            maxLength={450}
            placeholder="Enter body text"
            onChange={(e) => onChange({ ...module, body: e.target.value })}
            onBlur={onBlur}
            className="text-xs min-h-[120px]"
          />
        </FieldRow>
      </div>
    </div>
  );
}

function QAFields({
  module,
  onChange,
  onBlur,
}: {
  module: ModuleDto;
  onChange: (m: ModuleDto) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-4">
      {module.qaItems.map((item, i) => {
        const isCustom = !PRESET_QUESTIONS.includes(
          item.question as (typeof PRESET_QUESTIONS)[number]
        );
        return (
          <div
            key={item.id}
            className="space-y-2 pb-3 border-b border-stone-200 dark:border-zinc-800 last:border-0 last:pb-0"
          >
            <FieldRow
              label={`Question ${item.position}`}
              required
              copyValue={item.question}
            >
              <Select
                value={isCustom && item.question ? "Custom" : item.question || ""}
                onValueChange={(v) => {
                  const next = [...module.qaItems];
                  next[i] = {
                    ...item,
                    question: v === "Custom" ? "" : v,
                  };
                  onChange({ ...module, qaItems: next });
                  // Selecting from a Select doesn't fire blur — persist now.
                  onBlur();
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select question" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_QUESTIONS.map((q) => (
                    <SelectItem key={q} value={q} className="text-xs">
                      {q}
                    </SelectItem>
                  ))}
                  <SelectItem value="Custom" className="text-xs">
                    Custom
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            {isCustom && (
              <FieldRow label="Custom question" copyValue={item.question}>
                <Input
                  value={item.question}
                  maxLength={200}
                  placeholder="Type your question"
                  onChange={(e) => {
                    const next = [...module.qaItems];
                    next[i] = { ...item, question: e.target.value };
                    onChange({ ...module, qaItems: next });
                  }}
                  onBlur={onBlur}
                  className="h-8 text-xs"
                />
              </FieldRow>
            )}
            <FieldRow
              label="Answer"
              required
              copyValue={item.answer}
              hint={<CharCount value={item.answer} max={600} />}
            >
              <Textarea
                value={item.answer}
                maxLength={600}
                placeholder="Enter answer"
                onChange={(e) => {
                  const next = [...module.qaItems];
                  next[i] = { ...item, answer: e.target.value };
                  onChange({ ...module, qaItems: next });
                }}
                onBlur={onBlur}
                className="text-xs min-h-[80px]"
              />
            </FieldRow>
          </div>
        );
      })}
    </div>
  );
}

function ModuleCard({
  module,
  getModule,
  index,
  versionId,
  clientIdCode,
  onChange,
  onBlur,
  onRemove,
  removing,
}: {
  module: ModuleDto;
  getModule: () => ModuleDto;
  index: number;
  versionId: string;
  clientIdCode: string;
  onChange: (m: ModuleDto) => void;
  onBlur: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  function jobsFor(m: ModuleDto): AltTextJob[] {
    if (m.type === "focus-image") {
      return [{
        driveFileId: m.focusAsset?.driveFileId,
        moduleType: "focus-image",
        headline: m.headline ?? undefined,
        body: m.body ?? undefined,
        currentAlt: m.imageAlt ?? undefined,
      }];
    }
    if (m.type === "logo-description") {
      return [{
        driveFileId: m.logoAsset?.driveFileId,
        moduleType: "logo-description",
        headline: m.headline ?? undefined,
        body: m.body ?? undefined,
        currentAlt: m.imageAlt ?? undefined,
      }];
    }
    if (m.type === "asin-showcase" && m.asinItems.length > 0) {
      return m.asinItems.map((it) => ({
        driveFileId: it.asset?.driveFileId ?? undefined,
        moduleType: "asin-showcase",
        currentAlt: it.imageAlt || undefined,
      }));
    }
    return [];
  }

  const showAlt = jobsFor(module).length > 0;

  return (
    <div className="min-w-0 rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 p-[5px] bg-stone-50 dark:bg-zinc-800/40">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 min-w-0 shrink-0 text-left hover:opacity-70 transition-opacity"
        >
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-mono font-bold leading-none text-brand">
            #{index + 1}
          </span>
          <span className="inline-flex h-9 min-w-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand">
            <span className="truncate">{MODULE_TYPE_LABELS[module.type]}</span>
          </span>
        </button>
        {showAlt && (
          <GenerateAltTextBtn
            className="min-w-0 flex-1"
            versionId={versionId}
            slotId={module.id}
            getJobs={() => jobsFor(getModule())}
            onComplete={(texts) => {
              const m = getModule();
              if (m.type === "focus-image" || m.type === "logo-description") {
                onChange({ ...m, imageAlt: texts[0] ?? "" });
              } else if (m.type === "asin-showcase") {
                onChange({
                  ...m,
                  asinItems: m.asinItems.map((it, i) => ({
                    ...it,
                    imageAlt: texts[i] ?? it.imageAlt,
                  })),
                });
              }
              onBlur();
            }}
          />
        )}
        <Button
          size="sm"
          className="ml-auto h-9 w-9 shrink-0 rounded-full border-0 bg-brand-red p-0 text-white hover:bg-brand-red/90"
          onClick={onRemove}
          disabled={removing}
          aria-label="Remove module"
        >
          {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" strokeWidth={1.75} />}
        </Button>
      </div>
      {expanded && (
        <div className="p-3 border-t border-stone-200 dark:border-zinc-800">
          {module.type === "asin-showcase" && (
            <AsinShowcaseFields
              module={module}
              versionId={versionId}
              clientIdCode={clientIdCode}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}
          {module.type === "focus-image" && (
            <FocusImageFields
              module={module}
              versionId={versionId}
              clientIdCode={clientIdCode}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}
          {module.type === "logo-description" && (
            <LogoDescriptionFields
              module={module}
              versionId={versionId}
              clientIdCode={clientIdCode}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}
          {module.type === "qa" && (
            <QAFields module={module} onChange={onChange} onBlur={onBlur} />
          )}
        </div>
      )}
    </div>
  );
}

// ── PATCH payload builder ─────────────────────────────────────────────
// Converts the local editor state into the wire shape the PATCH endpoint
// expects. New modules (with no real id) are sent without an `id` so the
// server allocates one.

type PatchModule = {
  id?: string;
  type: ModuleType;
  headline: string | null;
  body: string | null;
  imageAlt: string | null;
  brandStoreId: string | null;
  asinItems?: { id: string; position: number; asin: string; imageAlt: string }[];
  qaItems?: { id: string; position: number; question: string; answer: string }[];
};

function buildPatchModules(modules: ModuleDto[]): PatchModule[] {
  return modules.map((m) => {
    const base: PatchModule = {
      id: m.id.startsWith("temp-") ? undefined : m.id,
      type: m.type,
      headline: m.headline,
      body: m.body,
      imageAlt: m.imageAlt,
      brandStoreId: m.brandStoreId,
    };
    if (m.type === "asin-showcase") {
      base.asinItems = m.asinItems.map((it) => ({
        id: it.id,
        position: it.position,
        asin: it.asin,
        imageAlt: it.imageAlt,
      }));
    } else if (m.type === "qa") {
      base.qaItems = m.qaItems.map((it) => ({
        id: it.id,
        position: it.position,
        question: it.question,
        answer: it.answer,
      }));
    }
    return base;
  });
}

// ── Main editor ───────────────────────────────────────────────────────

export function BrandStoryEditor({
  versionId,
  clientIdCode,
  initial,
}: {
  versionId: string;
  clientIdCode: string;
  initial: BrandStoryEditorInitial;
}) {
  const qc = useQueryClient();
  // Local state mirrors server data and is patched on blur. We re-seed
  // from `initial` whenever the parent query re-renders us (after upload /
  // module add / module delete refetches). For pure text-field PATCHes we
  // intentionally don't invalidate, so local state stays the source of
  // truth between blurs.
  const [desktopBgAlt, setDesktopBgAlt] = useState(initial.desktopBgAlt);
  const [mobileBgAlt, setMobileBgAlt] = useState(initial.mobileBgAlt);
  const [modules, setModules] = useState<ModuleDto[]>(initial.modules);
  const [bulkType, setBulkType] = useState<ModuleType>("focus-image");
  const [bulkCount, setBulkCount] = useState<number>(7);
  const desktopBgAltRef = useRef(initial.desktopBgAlt);
  const mobileBgAltRef = useRef(initial.mobileBgAlt);
  const modulesRef = useRef(initial.modules);

  function commitDesktopBgAlt(value: string) {
    desktopBgAltRef.current = value;
    setDesktopBgAlt(value);
  }
  function commitMobileBgAlt(value: string) {
    mobileBgAltRef.current = value;
    setMobileBgAlt(value);
  }
  function commitModules(next: ModuleDto[]) {
    modulesRef.current = next;
    setModules(next);
  }

  // Sync from server data when image / structural mutations refetch the
  // parent query. Key off assets and module ids only — not alt text.
  // Including alts remounted the generate controls after save and made
  // the edit-suggestion field look like it was discarded.
  const initialKey =
    `${initial.bgDesktop?.id ?? ""}|${initial.bgMobile?.id ?? ""}|` +
    initial.modules
      .map(
        (m) =>
          `${m.id}:${m.type}:${m.focusAsset?.id ?? ""}:${m.logoAsset?.id ?? ""}:` +
          m.asinItems.map((it) => `${it.id}:${it.asset?.id ?? ""}`).join(",")
      )
      .join(";");
  useEffect(() => {
    desktopBgAltRef.current = initial.desktopBgAlt;
    mobileBgAltRef.current = initial.mobileBgAlt;
    modulesRef.current = initial.modules;
    setDesktopBgAlt(initial.desktopBgAlt);
    setMobileBgAlt(initial.mobileBgAlt);
    setModules(initial.modules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const canAdd = modules.length < MAX_MODULES;

  const patchMut = useMutation({
    mutationFn: async (payload: {
      desktopBgAlt?: string;
      mobileBgAlt?: string;
      modules?: PatchModule[];
    }) => {
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      return d;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  function persistOnBlur() {
    patchMut.mutate({
      desktopBgAlt: desktopBgAltRef.current,
      mobileBgAlt: mobileBgAltRef.current,
      modules: buildPatchModules(modulesRef.current),
    });
  }

  const addMut = useMutation({
    mutationFn: async (vars: { type: ModuleType; count?: number }) => {
      const { type, count = 1 } = vars;
      const room = MAX_MODULES - modulesRef.current.length;
      const n = Math.max(0, Math.min(count, room));
      if (n === 0) {
        throw new Error(`Limit reached (${MAX_MODULES} modules max)`);
      }
      const newEntries: PatchModule[] = Array.from({ length: n }, () => ({
        type,
        headline: null,
        body: null,
        imageAlt: null,
        brandStoreId: null,
      }));
      const nextModules = [...buildPatchModules(modulesRef.current), ...newEntries];
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            desktopBgAlt: desktopBgAltRef.current,
            mobileBgAlt: mobileBgAltRef.current,
            modules: nextModules,
          }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Add failed");
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Add failed");
    },
  });

  const removeMut = useMutation({
    mutationFn: async (moduleId: string) => {
      const nextModules = buildPatchModules(
        modulesRef.current.filter((m) => m.id !== moduleId)
      );
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            desktopBgAlt: desktopBgAltRef.current,
            mobileBgAlt: mobileBgAltRef.current,
            modules: nextModules,
          }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Remove failed");
      return d;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    },
  });

  function updateModule(i: number, m: ModuleDto) {
    const next = [...modulesRef.current];
    next[i] = m;
    commitModules(next);
  }

  return (
    <div className="space-y-4">
      {/* Backgrounds subcard */}
      <section className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
        <div className="flex items-center gap-3 p-[5px] bg-stone-50 dark:bg-zinc-800/40">
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium uppercase tracking-wider leading-none text-brand">
            Backgrounds
          </span>
          <GenerateAltTextBtn
            versionId={versionId}
            slotId="backgrounds"
            getJobs={() => [
              {
                driveFileId: initial.bgDesktop?.driveFileId,
                moduleType: "bg_desktop",
                currentAlt: desktopBgAltRef.current,
              },
              {
                driveFileId: initial.bgMobile?.driveFileId,
                moduleType: "bg_mobile",
                currentAlt: mobileBgAltRef.current,
              },
            ]}
            onComplete={([bg = "", mb = ""]) => {
              commitDesktopBgAlt(bg);
              commitMobileBgAlt(mb);
              patchMut.mutate({
                desktopBgAlt: bg,
                mobileBgAlt: mb,
                modules: buildPatchModules(modulesRef.current),
              });
            }}
          />
        </div>
        <div className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 items-stretch">
            <ImageSlot
              width={1464}
              height={625}
              label="Desktop background"
              versionId={versionId}
              clientIdCode={clientIdCode}
              kind="bg_desktop"
              asset={initial.bgDesktop}
            />
            {/* Mobile lives inside a relative cell so its absolute child
                doesn't contribute intrinsic height to the grid row — the
                desktop dropzone alone defines the row height, and the mobile
                dropzone stretches to match via inset-y-0. */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0">
                <ImageSlot
                  width={463}
                  height={625}
                  label="Mobile background"
                  fixedHeightClass="h-full"
                  versionId={versionId}
                  clientIdCode={clientIdCode}
                  kind="bg_mobile"
                  asset={initial.bgMobile}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FieldRow
              label="Desktop alt text"
              required
              copyValue={desktopBgAlt}
              hint={<CharCount value={desktopBgAlt} max={100} />}
            >
              <AltTextArea
                value={desktopBgAlt}
                onChange={commitDesktopBgAlt}
                onBlur={persistOnBlur}
              />
            </FieldRow>
            <FieldRow
              label="Mobile alt text"
              required
              copyValue={mobileBgAlt}
              hint={<CharCount value={mobileBgAlt} max={100} />}
            >
              <AltTextArea
                value={mobileBgAlt}
                onChange={commitMobileBgAlt}
                onBlur={persistOnBlur}
              />
            </FieldRow>
          </div>
        </div>
      </section>

      {/* Modules subcard */}
      <section className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-[5px] bg-stone-50 dark:bg-zinc-800/40">
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium uppercase tracking-wider leading-none text-brand">
            Modules
          </span>
          <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-mono font-medium leading-none text-muted-foreground">
            {modules.length} / {MAX_MODULES}
          </span>
        </div>
        <div className="p-4 space-y-3">
          {modules.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-stone-300 dark:border-zinc-700 py-8 text-center text-xs text-muted-foreground">
              No modules yet — add up to {MAX_MODULES} from the selector below.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {modules.map((m, i) => (
                <div
                  key={m.id}
                  className={m.type === "asin-showcase" ? "col-span-2 min-w-0" : "min-w-0"}
                >
                  <ModuleCard
                    module={m}
                    getModule={() => modulesRef.current[i] ?? m}
                    index={i}
                    versionId={versionId}
                    clientIdCode={clientIdCode}
                    onChange={(next) => updateModule(i, next)}
                    onBlur={persistOnBlur}
                    onRemove={() => removeMut.mutate(m.id)}
                    removing={removeMut.isPending && removeMut.variables === m.id}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
              Add module:
            </span>
            {(Object.keys(MODULE_TYPE_LABELS) as ModuleType[]).map((t) => {
              const isPendingThis =
                addMut.isPending &&
                addMut.variables?.type === t &&
                (addMut.variables?.count ?? 1) === 1;
              return (
                <Button
                  key={t}
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full text-xs"
                  disabled={!canAdd || addMut.isPending}
                  onClick={() => addMut.mutate({ type: t })}
                >
                  {isPendingThis ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="size-3 mr-1" />
                  )}
                  {MODULE_TYPE_LABELS[t]}
                </Button>
              );
            })}
            <span className="mx-1 h-5 w-px bg-stone-300 dark:bg-zinc-700" aria-hidden />
            {(() => {
              const room = Math.max(0, MAX_MODULES - modules.length);
              const effective = Math.min(Math.max(1, bulkCount || 1), room);
              const isPendingBulk =
                addMut.isPending && (addMut.variables?.count ?? 1) > 1;
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Bulk:
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={room || 1}
                    value={bulkCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setBulkCount(Number.isFinite(n) ? n : 1);
                    }}
                    disabled={!canAdd || addMut.isPending}
                    className="h-8 w-14 text-xs px-2"
                  />
                  <Select
                    value={bulkType}
                    onValueChange={(v) => setBulkType(v as ModuleType)}
                    disabled={!canAdd || addMut.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODULE_TYPE_LABELS) as ModuleType[]).map(
                        (t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {MODULE_TYPE_LABELS[t]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full text-xs"
                    disabled={!canAdd || addMut.isPending || room < 1}
                    onClick={() =>
                      addMut.mutate({ type: bulkType, count: effective })
                    }
                    title={
                      effective < bulkCount
                        ? `Only ${room} slot${room === 1 ? "" : "s"} left — will add ${effective}`
                        : `Add ${effective} ${MODULE_TYPE_LABELS[bulkType]}`
                    }
                  >
                    {isPendingBulk ? (
                      <Loader2 className="size-3 mr-1 animate-spin" />
                    ) : (
                      <Plus className="size-3 mr-1" />
                    )}
                    Add {effective}
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>
      </section>
    </div>
  );
}
