/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Aplus2ImageSlotSpec } from "@/lib/aplus2/module-specs";
import { SUGGESTION_MAX } from "@/lib/aplus2/alt-text-prompt";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { cn } from "@/lib/utils";

type AssetDto = { id: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };

const proxyUrl = (gid: string) => `/api/aplus2/image?driveFileId=${encodeURIComponent(gid)}`;

export function Aplus2ImageSlot({
  spec, assets, versionId, moduleId, moduleItemId,
  altText, onAltTextChange, onAltTextCommit, hideLabel, hideGenerate,
}: {
  spec: Aplus2ImageSlotSpec;
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
  moduleItemId?: string;
  /** Single alt text for this image; mirrored to both desktop & mobile by the caller. */
  altText?: string;
  onAltTextChange?: (value: string) => void;
  /** Persist (blur / generate). Defaults to onAltTextChange when omitted. */
  onAltTextCommit?: (value: string) => void;
  hideLabel?: boolean;
  /** When true, suggestion + generate live in the module header instead. */
  hideGenerate?: boolean;
}) {
  const variants: Array<"desktop" | "mobile"> = spec.mobileSize ? ["desktop", "mobile"] : ["desktop"];
  const findAsset = (variant: "desktop" | "mobile") =>
    assets.find((a) => a.slotKey === spec.key && a.variant === variant
      && (moduleItemId ? a.moduleItemId === moduleItemId : a.moduleId === moduleId && !a.moduleItemId)) ?? null;

  return (
    <div>
      {!hideLabel && <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{spec.label}</div>}
      <div className={spec.mobileSize ? "flex items-start gap-3" : ""}>
        {variants.map((variant) => (
          <Aplus2ImageVariant
            key={variant}
            size={variant === "desktop" ? spec.desktopSize : spec.mobileSize!}
            variant={variant}
            paired={Boolean(spec.mobileSize)}
            slotKey={spec.key}
            versionId={versionId}
            moduleId={moduleId}
            moduleItemId={moduleItemId}
            asset={findAsset(variant)}
          />
        ))}
      </div>
      {onAltTextChange !== undefined && (
        <Aplus2AltEditor
          draftKey={`${versionId}:${moduleId}:${moduleItemId ?? "module"}`}
          asset={findAsset("desktop")}
          altText={altText}
          onChange={onAltTextChange}
          onCommit={onAltTextCommit ?? onAltTextChange}
          hideGenerate={hideGenerate}
        />
      )}
    </div>
  );
}

const altSuggestionDrafts = new Map<string, string>();

/** Suggestion + generate control. Used in the module header (Brand Story
 * parity) and still under repeatable-item image slots. */
export function Aplus2GenerateAltTextBtn({
  draftKey, asset, altText, onCommit, className,
}: {
  draftKey: string;
  asset: AssetDto | null;
  altText?: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [generating, setGenerating] = useState(false);
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
    if (!asset) return;
    setGenerating(true);
    try {
      const hint = suggestionRef.current.trim().slice(0, SUGGESTION_MAX);
      const r = await fetch("/api/aplus2/ai/alt-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          currentAlt: hint ? altText || undefined : undefined,
          suggestion: hint || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      onCommit(d.altText);
      toast.success("Alt text generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
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
            if (!generating && asset) void generate();
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
        disabled={generating || !asset}
        onClick={() => void generate()}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:bg-muted disabled:text-muted-foreground"
      >
        {generating ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5 shrink-0" strokeWidth={1.75} />
        )}
        {generating ? "…" : "Alt text"}
      </button>
    </div>
  );
}

/** One alt-text field per image. Generation fills desktop & mobile with the same
 * value (Amazon A+ alt text is per-image, and we mirror it to both variants). */
function Aplus2AltEditor({
  draftKey, asset, altText, onChange, onCommit, hideGenerate,
}: {
  draftKey: string;
  asset: AssetDto | null;
  altText?: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  hideGenerate?: boolean;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          <span className="text-red-500 mr-0.5">*</span>
          Alt text <span className="font-normal text-muted-foreground">(desktop &amp; mobile)</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <CopyTextButton value={altText ?? ""} label="Alt text" />
          <span className="text-[10px] font-mono text-muted-foreground">
            {(altText ?? "").length} / 100
          </span>
        </div>
      </div>
      <Textarea
        aria-label="Alt text"
        value={altText ?? ""}
        maxLength={100}
        rows={3}
        placeholder="Edit alt text"
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        className="text-xs md:text-xs min-h-16 h-16 max-h-16 resize-none leading-snug py-1.5 field-sizing-fixed break-words overflow-y-auto"
      />
      {!hideGenerate && asset && (
        <Aplus2GenerateAltTextBtn
          draftKey={draftKey}
          asset={asset}
          altText={altText}
          onCommit={onCommit}
        />
      )}
    </div>
  );
}

function Aplus2ImageVariant({
  size, variant, paired, slotKey, versionId, moduleId, moduleItemId, asset,
}: {
  size: { width: number; height: number };
  variant: "desktop" | "mobile";
  paired?: boolean;
  slotKey: string;
  versionId: string;
  moduleId: string;
  moduleItemId?: string;
  asset: AssetDto | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const qc = useQueryClient();
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "image");
      fd.append("slotKey", slotKey);
      fd.append("variant", variant);
      fd.append("moduleId", moduleId);
      if (moduleItemId) fd.append("moduleItemId", moduleItemId);
      const r = await fetch(`/api/aplus2/versions/${versionId}/assets`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upload failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  function handleFile(file: File) {
    uploadMut.mutate(file);
  }
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      const r = await fetch(`/api/aplus2/assets/${asset.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div
      className={cn(paired && "min-w-0")}
      style={paired ? { flex: `${size.width / size.height} 1 0%` } : undefined}
    >
      <div className="text-[10px] uppercase text-foreground mb-1">{variant} · {size.width}×{size.height}</div>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-[18px] border bg-stone-50 dark:bg-zinc-950 transition-colors",
          dragOver
            ? "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/40 dark:ring-amber-500/40 brightness-95 dark:brightness-110"
            : "border-stone-200 dark:border-zinc-800",
        )}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
      >
        <input
          ref={inputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        {asset ? (
          <>
            <img src={proxyUrl(asset.driveFileId)} alt={asset.filename} className="absolute inset-0 size-full object-contain" />
            <div className="absolute inset-0 flex items-end justify-start gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-white/90 text-zinc-800 hover:bg-white disabled:opacity-50"
                onClick={() => inputRef.current?.click()}
                disabled={uploadMut.isPending}
              >
                {uploadMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                Replace
              </button>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-white/90 text-red-600 hover:bg-white disabled:opacity-50"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="size-3" /> Remove
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-stone-100 dark:hover:bg-zinc-900 transition-colors w-full"
            onClick={() => inputRef.current?.click()}
            disabled={uploadMut.isPending}
          >
            {uploadMut.isPending
              ? <Loader2 className="size-6 animate-spin" />
              : <><ImageIcon className="size-6" /><span className="text-[11px]">Upload</span></>
            }
          </button>
        )}
      </div>
    </div>
  );
}
