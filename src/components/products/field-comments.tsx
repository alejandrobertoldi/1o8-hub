"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, Check, RotateCcw, Trash2 } from "lucide-react";
import type { FieldComment } from "@/lib/db/schema";

type Props = {
  productId: string;
  bqName: string;
  fieldLabel: string;
  commentCount?: { total: number; open: number };
};

type Filter = "all" | "open" | "resolved";

export function FieldComments({
  productId,
  bqName,
  fieldLabel,
  commentCount,
}: Props) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [newComment, setNewComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isViewer = session?.user?.role === "viewer";
  const isAdmin = hasAdminPowers(session?.user?.role);

  const hasComments = commentCount && commentCount.total > 0;
  const openCount = commentCount?.open ?? 0;

  const { data, isLoading } = useQuery({
    queryKey: ["field-comments", productId, bqName],
    queryFn: async () => {
      const res = await fetch(
        `/api/products/${productId}/comments?field=${encodeURIComponent(bqName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json() as Promise<{
        comments: FieldComment[];
        counts: { total: number; open: number; resolved: number };
      }>;
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await fetch(`/api/products/${productId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bqName, comment }),
      });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({
        queryKey: ["field-comments", productId, bqName],
      });
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      commentId,
      action,
    }: {
      commentId: number;
      action: "resolve" | "reopen" | "delete";
    }) => {
      const res = await fetch(`/api/products/${productId}/comments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, action }),
      });
      if (!res.ok) throw new Error("Failed to update comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["field-comments", productId, bqName],
      });
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
    },
  });

  const filteredComments = (data?.comments ?? []).filter((c) => {
    if (filter === "open") return !c.resolved;
    if (filter === "resolved") return c.resolved;
    return true;
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addMutation.mutate(newComment.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          title={
            hasComments
              ? `${openCount} open comment${openCount !== 1 ? "s" : ""}`
              : "Add comment"
          }
        >
          <MessageSquare
            className="h-3.5 w-3.5"
            style={{ color: hasComments ? "var(--brand)" : "#9ca3af" }}
            fill={hasComments ? "var(--brand)" : "none"}
          />
          {hasComments && openCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-brand-solid text-[9px] font-bold text-white px-0.5 leading-none">
              {openCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-96 max-h-96 flex flex-col p-0 bg-card border-border text-white"
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-border">
          <h4 className="text-xs font-medium text-muted-foreground/80 truncate">
            Comments: {fieldLabel}
          </h4>
          {/* Filter tabs */}
          <div className="flex gap-1 mt-2">
            {(["all", "open", "resolved"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`text-[11px] px-2 py-0.5 rounded-full capitalize transition-colors ${
                  filter === tab
                    ? "bg-brand-solid text-white font-medium"
                    : "text-muted-foreground/70 hover:text-foreground/80"
                }`}
              >
                {tab}
                {tab === "open" && data?.counts
                  ? ` (${data.counts.open})`
                  : tab === "resolved" && data?.counts
                    ? ` (${data.counts.resolved})`
                    : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : filteredComments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No {filter !== "all" ? filter : ""} comments yet
            </p>
          ) : (
            filteredComments.map((c) => (
              <div
                key={c.id}
                className={`text-xs rounded-md p-2 ${
                  c.resolved
                    ? "bg-card/50 opacity-60"
                    : "bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-muted-foreground/80 truncate">
                    {c.authorName || c.author}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(c.createdAt).toLocaleDateString("en-US")}
                  </span>
                </div>
                <p className="mt-1 text-foreground/80 whitespace-pre-wrap break-words">
                  {c.comment}
                </p>
                {c.resolved && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Resolved by {c.resolvedBy}
                  </p>
                )}
                {/* Actions */}
                {!isViewer && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {c.resolved ? (
                      <button
                        type="button"
                        onClick={() =>
                          actionMutation.mutate({
                            commentId: c.id,
                            action: "reopen",
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70 hover:text-white transition-colors"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          actionMutation.mutate({
                            commentId: c.id,
                            action: "resolve",
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70 hover:text-emerald-400 transition-colors"
                      >
                        <Check className="h-2.5 w-2.5" />
                        Resolve
                      </button>
                    )}
                    {(c.author === session?.user?.email || isAdmin) && (
                      <button
                        type="button"
                        onClick={() =>
                          actionMutation.mutate({
                            commentId: c.id,
                            action: "delete",
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70 hover:text-red-400 transition-colors ml-1"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        {!isViewer && (
          <div className="border-t border-border px-3 py-2 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className="flex-1 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!newComment.trim() || addMutation.isPending}
              className="h-7 w-7 p-0 bg-brand-solid hover:bg-brand-solid-hover text-white"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
