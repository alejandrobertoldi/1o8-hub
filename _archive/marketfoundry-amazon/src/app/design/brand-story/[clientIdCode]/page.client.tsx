/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  ArrowLeft,
  Upload,
  ImageIcon,
  Trash2,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  StatusDot,
  getStatusMeta,
  DESIGN_STATUS_ORDER_FULL,
  STATUS_VERSION_TRIGGER_CLASS,
  STATUS_MENU_ITEM_CLASS,
} from "@/lib/design-status";

import { toast } from "sonner";
import {
  BrandStoryEditor,
  type BrandStoryEditorInitial,
} from "./_components/brand-story-editor";
import { GenerateAllAltTextsBtn } from "./_components/generate-all-alt-texts-btn";

// ── Wire types (match /api/design-status/brand-story-versions GET) ───

type AssetDto = { id: string; driveFileId: string; filename: string };

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

type ModuleDto = {
  id: string;
  position: number;
  type: "asin-showcase" | "focus-image" | "logo-description" | "qa";
  headline: string | null;
  body: string | null;
  imageAlt: string | null;
  brandStoreId: string | null;
  focusAsset: AssetDto | null;
  logoAsset: AssetDto | null;
  asinItems: AsinItemDto[];
  qaItems: QaItemDto[];
};

type VersionDto = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  desktopBgAlt: string;
  mobileBgAlt: string;
  driveFolderUrl: string | null;
  screenview: AssetDto | null;
  bgDesktop: AssetDto | null;
  bgMobile: AssetDto | null;
  masterFiles: { count: number; latestAt: string | null };
  modules: ModuleDto[];
};

type GetResponse = {
  clientName: string;
  versions: VersionDto[];
};

type VersionStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "approved"
  | "live"
  | "discontinued";

// Status palette + sizing live in @/lib/design-status (canonical source).

// ── Data fetching ─────────────────────────────────────────────────────

async function fetchVersions(clientIdCode: string): Promise<GetResponse> {
  const res = await fetch(
    `/api/design-status/brand-story-versions?clientIdCode=${encodeURIComponent(clientIdCode)}`
  );
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

function imageProxyUrl(driveFileId: string) {
  return `/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(driveFileId)}`;
}

function buildInitial(v: VersionDto): BrandStoryEditorInitial {
  return {
    desktopBgAlt: v.desktopBgAlt,
    mobileBgAlt: v.mobileBgAlt,
    bgDesktop: v.bgDesktop,
    bgMobile: v.bgMobile,
    modules: v.modules,
  };
}

// ── Status pill (used in each version card header) ────────────────────

function StatusSelect({
  versionId,
  clientIdCode,
  value,
}: {
  versionId: string;
  clientIdCode: string;
  value: VersionStatus;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (next: VersionStatus) => {
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Status update failed");
      return d;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    },
  });

  return (
    <Select
      value={value}
      onValueChange={(v) => mut.mutate(v as VersionStatus)}
      disabled={mut.isPending}
    >
      <SelectTrigger
        className={cn(
          STATUS_VERSION_TRIGGER_CLASS,
          "w-[140px] border justify-start gap-1",
          getStatusMeta(value).chipClass
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DESIGN_STATUS_ORDER_FULL.map((s) => (
          <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
            <span className="flex items-center gap-2">
              <StatusDot status={s} />
              {getStatusMeta(s).label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Screenview slot ───────────────────────────────────────────────────
// Same Replace UX as the module ImageSlots (hover overlay + drag-drop +
// spinner), but version-anchored: NO Remove. Replacing uploads the new image
// into the existing version Drive folder and deletes the old file in Drive
// (handled server-side) — the version + master folders are never touched.

const SCREENVIEW_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function ScreenviewSlot({
  versionId,
  clientIdCode,
  asset,
}: {
  versionId: string;
  clientIdCode: string;
  asset: AssetDto | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const qc = useQueryClient();

  async function upload(file: File) {
    if (uploading) return;
    if (!SCREENVIEW_MIME.includes(file.type.toLowerCase())) {
      toast.error("Only PNG, JPEG, or WebP images are allowed.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kind", "screenview");
      fd.append("file", file);
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}/assets`,
        { method: "POST", body: fd }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] });
      toast.success("Screenview replaced");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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

  return (
    <div
      className={cn(
        "relative group w-full bg-stone-100 dark:bg-zinc-950",
        isDragging && "ring-2 ring-inset ring-brand"
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
      {asset ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageProxyUrl(asset.driveFileId)}
            alt={asset.filename}
            className="w-full h-auto object-contain block"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-6 animate-spin text-white" />
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
              aria-label="Replace screenview"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/70 px-3 py-1.5 rounded">
                Replace
              </span>
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="aspect-video w-full flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-stone-200/60 dark:hover:bg-zinc-900/60 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImageIcon className={cn("size-5", isDragging ? "text-brand" : "text-muted-foreground/50")} />
          )}
          <span>{uploading ? "Uploading…" : "Screenview missing — click or drop an image to upload"}</span>
        </button>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function BrandStoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode =
    typeof params.clientIdCode === "string" ? params.clientIdCode : "";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["brand-story-versions", clientIdCode],
    queryFn: () => fetchVersions(clientIdCode),
    enabled: !!clientIdCode,
  });

  const createMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("clientIdCode", clientIdCode);
      fd.append("file", file);
      const res = await fetch("/api/design-status/upload-brand-story", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["brand-story-versions", clientIdCode],
      });
      toast.success("New brand story version created");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const deleteVersionMut = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(
        `/api/design-status/brand-story-versions/${versionId}`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["brand-story-versions", clientIdCode],
      });
      toast.success("Version removed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const versions = [...(data?.versions ?? [])].sort(
    (a, b) => b.versionNumber - a.versionNumber
  );
  const clientName = data?.clientName ?? clientIdCode;
  const isBusy = createMut.isPending || deleteVersionMut.isPending;

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full min-w-0">
          {/* LEFT: back + title + client */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <button type="button"
              onClick={() => router.push("/design/brand-story")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Back to Brand Story"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
            <div className="flex items-baseline gap-3 shrink-0 min-w-0">
              <h1
                className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
                aria-label="Brand Story"
              >
                <span className="font-bold text-sidebar-foreground">Brand</span>
                <span className="font-normal text-brand">Story</span>
              </h1>
              <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
                <span className="text-brand font-bold truncate">{clientName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {clientIdCode}
                </span>
              </div>
            </div>
          </div>
        </div>
      </PageMetaSlot>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) createMut.mutate(file);
          e.target.value = "";
        }}
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-[18px]" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-[18px] border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
          <ImageIcon className="size-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Failed to load brand story versions. Please try again.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {versions.map((v) => {
            const slug = `${clientIdCode}_Brandstory_V${String(v.versionNumber).padStart(2, "0")}`;
            return (
              <div
                key={v.id}
                className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-card"
              >
                <div className="sticky top-[-24px] lg:top-[-32px] z-10 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-[5px] p-[5px] bg-stone-50 dark:bg-zinc-800 border-b border-stone-200 dark:border-zinc-800 rounded-t-[23px]">
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-mono font-bold leading-none text-brand">
                      V{String(v.versionNumber).padStart(2, "0")}
                    </span>
                    <span className="text-xs font-mono font-bold text-brand-orange truncate">
                      {slug}
                    </span>
                    <StatusSelect
                      versionId={v.id}
                      clientIdCode={clientIdCode}
                      value={v.status}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-3 flex-wrap">
                    <GenerateAllAltTextsBtn v={v} clientIdCode={clientIdCode} />
                    {v.driveFolderUrl && (
                      <a
                        href={v.driveFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand whitespace-nowrap"
                      >
                        <img src="/drive.png" alt="" className="size-3.5 object-contain" />
                        Link to Drive folder
                      </a>
                    )}
                    <Button
                      size="sm"
                      className="h-9 shrink-0 rounded-full border-0 bg-brand-red px-3 text-[13px] font-medium text-white hover:bg-brand-red/90"
                      disabled={isBusy}
                      onClick={() => {
                        if (
                          confirm(
                            `Remove "${slug}"? This deletes the version, its modules, and the entire Drive subfolder.`
                          )
                        ) {
                          deleteVersionMut.mutate(v.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                      Remove version
                    </Button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {/* Screenview subcard — hover the image to Replace (version-anchored, no Remove) */}
                  <div className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 p-[5px] bg-stone-50 dark:bg-zinc-800/40">
                      <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium uppercase tracking-wider leading-none text-brand">
                        Screenview
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        Hover image to replace
                      </span>
                    </div>
                    <ScreenviewSlot
                      versionId={v.id}
                      clientIdCode={clientIdCode}
                      asset={v.screenview}
                    />
                  </div>

                  <BrandStoryEditor
                    versionId={v.id}
                    clientIdCode={clientIdCode}
                    initial={buildInitial(v)}
                  />
                </div>
              </div>
            );
          })}

          {/* Always-present empty upload card */}
          <div className="rounded-[18px] border border-dashed border-stone-300 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/30 flex flex-col items-center justify-center py-16 gap-4">
            <ImageIcon className="size-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {versions.length === 0
                ? "No versions yet — upload the screenview image to start"
                : "Add another version — upload the screenview image first"}
            </p>
            <Button
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
            >
              {createMut.isPending ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <Upload className="size-3 mr-1" />
              )}
              Upload Screenview image
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
