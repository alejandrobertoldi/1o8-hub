"use client";
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/js-combine-iterations */

import { useState, useCallback, useMemo, Suspense } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AplusPreviewPanel } from "@/components/aplus/aplus-preview-panel";
import { AplusCommentThread } from "@/components/aplus/aplus-comment-thread";
import type { AplusModuleWithImages, CommentPin, PendingPin } from "@/components/aplus/module-card-types";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";

// ── Types ──────────────────────────────────────────────────────────────

interface AplusApiResponse {
  product: {
    id: string;
    name: string;
    asin: string;
    clientIdCode: string;
    marketplace?: string | null;
  };
  modules: AplusModuleWithImages[];
}

// ── Content ─────────────────────────────────────────────────────────────

function PortalAplusReviewContent() {
  const { productId } = useParams<{ productId: string }>();
  const { data: session } = useSession();
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);

  const isClient = session?.user?.role === "client";
  const clientParam = usePortalClientParam();
  const queryClient = useQueryClient();

  const [actionInFlight, setActionInFlight] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleApprove = useCallback(async () => {
    setActionInFlight("approve");
    setActionMessage(null);
    try {
      const res = await fetch(`/api/aplus/${productId}/bulk-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setActionMessage({ type: "success", text: "All modules approved" });
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to approve" });
    } finally {
      setActionInFlight(null);
    }
  }, [productId, queryClient]);

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) return;
    setActionInFlight("reject");
    setActionMessage(null);
    try {
      // Set status back to draft
      const statusRes = await fetch(`/api/aplus/${productId}/bulk-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!statusRes.ok) throw new Error((await statusRes.json()).error ?? "Failed");

      // Post rejection reason as comment
      await fetch(`/api/aplus/${productId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Changes requested: ${rejectReason}`,
          audience: "client",
        }),
      });

      setActionMessage({ type: "success", text: "Changes requested — team has been notified" });
      setShowRejectInput(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      queryClient.invalidateQueries({ queryKey: ["aplus-comments", productId] });
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setActionInFlight(null);
    }
  }, [productId, rejectReason, queryClient]);

  // Fetch product + modules (same query key as workspace for dedup)
  const { data, isLoading, isError } = useQuery<AplusApiResponse>({
    queryKey: ["aplus-modules", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}`);
      if (!res.ok) throw new Error("Failed to load A+ modules");
      return res.json();
    },
    refetchOnWindowFocus: true,
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
  const commentPins: CommentPin[] = useMemo(() => {
    return (commentsData?.comments ?? [])
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
  }, [commentsData]);

  const handlePreviewPin = useCallback((moduleId: string, moduleNumber: number, pinX: number, pinY: number) => {
    setPendingPin({ moduleId, moduleNumber, pinX, pinY });
  }, []);

  const handlePinClear = useCallback(() => {
    setPendingPin(null);
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <Loader2 style={{ width: 24, height: 24, color: "#888c8c", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px", color: "#d13212", fontSize: 14 }}>
        Failed to load A+ content. Please refresh.
      </div>
    );
  }

  const { product, modules } = data;
  const approvedCount = modules.filter((m) => m.status === "approved").length;
  const totalCount = modules.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", overflow: "hidden" }}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
        <Link
          href={`/portal/aplus${clientParam}`}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-[family-name:var(--font-outfit)] tracking-tight leading-snug truncate">
            {product.name}
          </h1>
          <p className="text-xs text-muted-foreground font-mono">{product.asin}</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-xs px-2.5 py-0.5 shrink-0",
            approvedCount === totalCount && totalCount > 0
              ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
              : "border-amber-500/30 text-amber-600 bg-amber-500/10"
          )}
        >
          {approvedCount}/{totalCount} approved
        </Badge>

        {/* Client approve/reject actions */}
        {isClient && totalCount > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
              disabled={actionInFlight !== null}
              onClick={handleApprove}
            >
              {actionInFlight === "approve" ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="size-3 mr-1" />
              )}
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
              disabled={actionInFlight !== null}
              onClick={() => setShowRejectInput(!showRejectInput)}
            >
              <MessageSquareWarning className="size-3 mr-1" />
              Request Changes
            </Button>
          </div>
        )}
      </div>

      {/* Reject reason input bar */}
      {showRejectInput && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-amber-500/5 shrink-0">
          <input
            type="text"
            placeholder="What changes are needed?"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReject()}
            className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            autoFocus
          />
          <Button
            size="sm"
            variant="default"
            className="text-xs"
            disabled={!rejectReason.trim() || actionInFlight !== null}
            onClick={handleReject}
          >
            {actionInFlight === "reject" ? <Loader2 className="size-3 animate-spin" /> : "Submit"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Action feedback */}
      {actionMessage && (
        <div className={cn(
          "px-4 py-1.5 text-xs shrink-0 border-b border-border",
          actionMessage.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
        )}>
          {actionMessage.text}
        </div>
      )}

      {/* 2-panel layout: Preview (left ~65%) | Comments (right ~35%) */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Preview panel */}
        <div style={{
          flex: "0 0 65%",
          overflowY: "auto",
          backgroundColor: "#f7f8fa",
          borderRight: "1px solid var(--border, #333)",
        }}>
          <AplusPreviewPanel
            modules={modules}
            product={product}
            commentPins={commentPins}
            pendingPin={pendingPin}
            onPin={handlePreviewPin}
          />
        </div>

        {/* Comment thread */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <AplusCommentThread
            productId={productId}
            pendingPin={pendingPin}
            onPinClear={handlePinClear}
          />
        </div>
      </div>
    </div>
  );
}

// ── Default export with Suspense for useSearchParams ─────────────────

export default function PortalAplusReviewPage() {
  return (
    <>
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="A+ Review"
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-portal-accent">Review</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Review and approve A+ content modules.</p>
        </div>
      </PageMetaSlot>
      <Suspense>
        <PortalAplusReviewContent />
      </Suspense>
    </>
  );
}
