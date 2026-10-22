/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  MessageCircle,
  Download,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AplusEditor } from "./aplus-editor";
import { AplusPreviewPanel } from "./aplus-preview-panel";
import { AplusCommentThread } from "./aplus-comment-thread";
import { AplusSetConfig, type SetConfig } from "./aplus-set-config";
import { generateTrackerRows, type TrackerRow, type AplusScopeType } from "@/lib/aplus-file-naming";
import type { AplusModuleType } from "@/lib/aplus-module-specs";
import type { AplusModuleWithImages, AplusStatus, CommentPin, PendingPin } from "./module-card-types";
import { STATUS_OPTIONS } from "./module-card-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Re-export for backward compatibility (other files import PendingPin from here)
export type { PendingPin } from "./module-card-types";

interface AplusApiResponse {
  product: {
    id: string;
    name: string;
    asin: string;
    clientIdCode: string;
    marketplace?: string | null;
  };
  modules: AplusModuleWithImages[];
  setConfig?: SetConfig;
}

interface AplusWorkspaceProps {
  productId: string;
  userRole: string;
}

/** Export all tracker rows for the current A+ set as TSV (pasteable into Google Sheets) */
function exportTrackerTsv(
  modules: AplusModuleWithImages[],
  clientIdCode: string,
  version: number,
  scopeType: AplusScopeType,
  productAsin: string,
  groupNumber?: number,
) {
  const allRows: TrackerRow[] = [];
  for (const mod of modules) {
    const panelCount = mod.images.filter((img) => img.customLabel?.startsWith("panel_")).length || undefined;
    const rows = generateTrackerRows(
      clientIdCode,
      version,
      scopeType,
      mod.moduleNumber,
      mod.moduleType as AplusModuleType,
      scopeType === "ASIN" ? productAsin : undefined,
      scopeType === "GRP" ? groupNumber : undefined,
      panelCount,
    );
    allRows.push(...rows);
  }

  // TSV header
  const header = "file name\tTYPE\tTYPE ABBR\tMODTYPE\tMODNUMBER\tMODTYPE ABBR\tTEXTFIELD\tTEXFIELD ABBR\tPANEL NUMBER\tGROUP\tGROUP ABBR\tIMAGE\tIMAGE NUMBER";
  const lines = allRows.map((r) =>
    [
      r.fileName,
      r.type,
      r.typeAbbr,
      r.modType,
      r.modNumber,
      r.modTypeAbbr,
      r.textField,
      r.textFieldAbbr,
      r.panelNumber ?? "",
      r.group,
      r.groupAbbr,
      r.image,
      r.imageNumber,
    ].join("\t")
  );

  const tsv = [header, ...lines].join("\n");
  const blob = new Blob([tsv], { type: "text/tab-separated-values" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${clientIdCode}_tracker.tsv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AplusWorkspace({ productId, userRole }: AplusWorkspaceProps) {
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(true);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const readOnly = userRole === "viewer";

  // ── Bulk status mutation ─────────────────────────────────────────────────
  const bulkStatusMutation = useMutation({
    mutationFn: async (status: AplusStatus) => {
      const res = await fetch(`/api/aplus/${productId}/bulk-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to bulk update status");
      return res.json();
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success(`All modules set to ${status.replace(/_/g, " ")}`);
    },
    onError: () => {
      toast.error("Failed to update module statuses");
    },
  });

  // Fetch comments for pin overlay on preview
  const { data: commentsData } = useQuery<{ comments: Array<{
    id: string;
    moduleId: string | null;
    pinX: number | null;
    pinY: number | null;
    commentNumber: number | null;
    status: "active" | "resolved";
    audience: string;
  }> }>({
    queryKey: ["aplus-comments", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Extract pins from comments that have coordinates
  const commentPins: CommentPin[] = (commentsData?.comments ?? [])
    .filter((c) => c.pinX != null && c.pinY != null)
    .map((c) => ({
      id: c.id,
      moduleId: c.moduleId,
      pinX: c.pinX!,
      pinY: c.pinY!,
      commentNumber: c.commentNumber,
      status: c.status,
      isClient: c.audience === "client",
    }));

  const handlePreviewPin = useCallback((moduleId: string, moduleNumber: number, pinX: number, pinY: number) => {
    setPendingPin({ moduleId, moduleNumber, pinX, pinY });
    // Auto-open comments panel if closed
    setCommentsOpen(true);
  }, []);

  const handlePinClear = useCallback(() => {
    setPendingPin(null);
  }, []);

  const { data, isLoading, isError, error } = useQuery<AplusApiResponse>({
    queryKey: ["aplus-modules", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <Loader2 style={{ width: "24px", height: "24px", color: "#888c8c", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: "8px" }}>
        <p style={{ color: "#d13212", fontSize: "14px" }}>Failed to load A+ modules. Please refresh.</p>
        {error && <p style={{ color: "#888", fontSize: "12px", fontFamily: "monospace" }}>{error.message}</p>}
      </div>
    );
  }

  const modules = data.modules;
  const product = data.product;
  const approvedCount = modules.filter((m) => m.status === "approved").length;
  const filledCount = modules.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", overflow: "hidden", borderRadius: "6px", border: "1px solid var(--border, #333)" }}>

      {/* ══ Top bar: product header + set config (spans all panels) ══ */}
      <div className="bg-background border-b border-border px-4 py-3 flex-shrink-0">
        {/* Row 1: product name + status */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-0.5 min-w-0 flex-1">
            <h1 className="text-base font-[family-name:var(--font-outfit)] tracking-tight leading-snug truncate">
              {product.name}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {product.asin}
              <Link href={`/products/${product.id}`} className="ml-2 inline-flex items-center gap-0.5 text-brand hover:underline">
                View product <ExternalLink className="size-3" />
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2.5 py-0.5",
                approvedCount === filledCount && filledCount > 0
                  ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                  : "border-amber-500/30 text-amber-600 bg-amber-500/10"
              )}
            >
              {approvedCount}/{filledCount} approved
            </Badge>
            {!readOnly && modules.length > 0 && (
              <Select
                disabled={readOnly || bulkStatusMutation.isPending}
                onValueChange={(v) => bulkStatusMutation.mutate(v as AplusStatus)}
              >
                <SelectTrigger className="w-36 h-7 text-xs">
                  <SelectValue placeholder="Set all status…" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Row 2: set config + export */}
        {data.setConfig && (
          <div className="mt-2 flex items-start gap-2">
            <div className="flex-1">
              <AplusSetConfig
                productId={productId}
                productAsin={product.asin}
                productClientIdCode={product.clientIdCode ?? ""}
                config={data.setConfig}
                readOnly={readOnly}
              />
            </div>
            {modules.length > 0 && (
              <button
                type="button"
                title="Export tracker TSV"
                onClick={() => {
                  const cid = product.clientIdCode || "UNKNOWN";
                  const ver = data.setConfig?.version || 1;
                  const st = (data.setConfig?.scopeType || "ASIN") as AplusScopeType;
                  const grpNum = data.setConfig?.groupNumber ?? undefined;
                  exportTrackerTsv(modules, cid, ver, st, product.asin, grpNum);
                }}
                className="shrink-0 mt-1 p-1.5 rounded border border-border/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ══ Panel area ══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left: Comments ───────────────────────────── */}
        {commentsOpen && (
          <div style={{
            width: "280px",
            minWidth: "260px",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border, #333)",
          }}>
            <AplusCommentThread
              productId={productId}
              pendingPin={pendingPin}
              onPinClear={handlePinClear}
            />
          </div>
        )}

        {/* Comments toggle */}
        <button
          type="button"
          onClick={() => setCommentsOpen(!commentsOpen)}
          title={commentsOpen ? "Hide comments" : "Show comments"}
          style={{
            width: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--muted, #262626)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <MessageCircle style={{ width: "12px", height: "12px", color: "#F4BD1F" }} />
        </button>

        {/* ── Center: Preview ──────────────────────────────── */}
        {previewOpen && (
          <div style={{ flex: 3, minWidth: "300px", overflowY: "auto", backgroundColor: "#f7f8fa", borderRight: "1px solid var(--border, #333)" }}>
            <AplusPreviewPanel
              modules={modules}
              product={product}
              commentPins={commentPins}
              pendingPin={pendingPin}
              onPin={handlePreviewPin}
            />
          </div>
        )}

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setPreviewOpen(!previewOpen)}
          title={previewOpen ? "Hide preview" : "Show preview"}
          style={{
            width: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--muted, #262626)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {previewOpen ? (
            <PanelLeftClose style={{ width: "12px", height: "12px", color: "#F4BD1F" }} />
          ) : (
            <PanelLeftOpen style={{ width: "12px", height: "12px", color: "#F4BD1F" }} />
          )}
        </button>

        {/* ── Right: Editor ──────────────────────────────── */}
        {editorOpen && (
          <div style={{
            flex: 2,
            minWidth: "360px",
            overflowY: "auto",
            padding: "16px 20px",
            backgroundColor: "var(--background, #1a1a1a)",
            color: "var(--foreground, #fff)",
          }}>
            <AplusEditor productId={productId} userRole={userRole} />
          </div>
        )}

        {/* Editor toggle */}
        <button
          type="button"
          onClick={() => setEditorOpen(!editorOpen)}
          title={editorOpen ? "Hide editor" : "Show editor"}
          style={{
            width: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--muted, #262626)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {editorOpen ? (
            <PanelRightClose style={{ width: "12px", height: "12px", color: "#F4BD1F" }} />
          ) : (
            <PanelRightOpen style={{ width: "12px", height: "12px", color: "#F4BD1F" }} />
          )}
        </button>
      </div>
    </div>
  );
}
