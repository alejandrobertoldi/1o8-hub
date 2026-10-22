/* eslint-disable react-doctor/no-outline-none */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Send,
  Check,
  RotateCcw,
  Trash2,
  Loader2,
  Search,
  MapPin,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { PendingPin } from "./module-card-types";

type Comment = {
  id: string;
  productId: string;
  moduleId: string | null;
  parentCommentId: string | null;
  authorEmail: string;
  authorName: string | null;
  body: string;
  audience: "internal" | "client";
  clientIdCode: string | null;
  status: "active" | "resolved";
  pinX: number | null;
  pinY: number | null;
  commentNumber: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

interface AplusCommentThreadProps {
  productId: string;
  /** Currently selected module ID for filtering / new comment context */
  activeModuleId?: string | null;
  /** Callback when a comment pin is clicked (to scroll preview) */
  onPinClick?: (moduleId: string | null, pinX: number, pinY: number) => void;
  /** Pending pin from preview click */
  pendingPin?: PendingPin | null;
  /** Clear pending pin */
  onPinClear?: () => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US");
}

// Avatar colors by email hash
const AVATAR_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#6366F1", "#14B8A6", "#F97316", "#06B6D4",
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function AplusCommentThread({
  productId,
  activeModuleId,
  onPinClick,
  pendingPin,
  onPinClear,
}: AplusCommentThreadProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [newComment, setNewComment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0); // cursor position of the "@"
  const [mentionIdx, setMentionIdx] = useState(0); // keyboard-selected index

  type TeamMember = { id: string; name: string | null; email: string; image: string | null };
  const { data: teamData } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const teamMembers = teamData ?? [];

  const mentionMatches = mentionQuery !== null
    ? teamMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return (m.name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
      }).slice(0, 6)
    : [];

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNewComment(val);

    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursor);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx >= 0) {
      const afterAt = beforeCursor.slice(atIdx + 1);
      // Only trigger if no space after @ (still typing the mention)
      if (!afterAt.includes(" ") && afterAt.length <= 30) {
        setMentionQuery(afterAt);
        setMentionStart(atIdx);
        setMentionIdx(0);
        return;
      }
    }
    setMentionQuery(null);
  }

  function insertMention(member: TeamMember) {
    const displayName = member.name || member.email.split("@")[0];
    const before = newComment.slice(0, mentionStart);
    const after = newComment.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    setNewComment(`${before}@${displayName} ${after}`);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  const { data, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: ["aplus-comments", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    refetchInterval: 15000, // Poll every 15s for real-time-ish updates
  });

  const allComments = data?.comments ?? [];

  // Separate top-level and replies
  const topLevel = allComments.filter((c) => !c.parentCommentId);
  const replies = allComments.filter((c) => c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const r of replies) {
    const key = r.parentCommentId!;
    const existing = repliesByParent.get(key) ?? [];
    existing.push(r);
    repliesByParent.set(key, existing);
  }

  // Filter by tab and search
  const filtered = topLevel.filter((c) => {
    if (c.status !== tab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.body.toLowerCase().includes(q) ||
        c.authorName?.toLowerCase().includes(q) ||
        c.authorEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sort: newest first for active, oldest first for resolved
  const sorted = filtered.toSorted((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return tab === "active" ? db - da : da - db;
  });

  const activeCount = topLevel.filter((c) => c.status === "active").length;
  const resolvedCount = topLevel.filter((c) => c.status === "resolved").length;

  // Auto-focus input when a pin is placed
  useEffect(() => {
    if (pendingPin && inputRef.current) {
      inputRef.current.focus();
    }
  }, [pendingPin]);

  // Create comment mutation
  const createMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/aplus/${productId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          moduleId: pendingPin?.moduleId ?? activeModuleId ?? null,
          pinX: pendingPin?.pinX ?? null,
          pinY: pendingPin?.pinY ?? null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("[comments] POST failed:", res.status, errData);
        throw new Error(errData.error || `Failed to create comment (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-comments", productId] });
      setNewComment("");
      onPinClear?.();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to post comment"),
  });

  // Resolve/reopen mutation
  const statusMutation = useMutation({
    mutationFn: async ({ commentId, status }: { commentId: string; status: "active" | "resolved" }) => {
      const res = await fetch(`/api/aplus/${productId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-comments", productId] });
    },
    onError: () => toast.error("Failed to update comment"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/aplus/${productId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-comments", productId] });
    },
    onError: () => toast.error("Failed to delete comment"),
  });

  function handleSubmit() {
    if (!newComment.trim()) return;
    createMutation.mutate(newComment);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Mention dropdown keyboard navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionMatches[mentionIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: "13px",
    fontWeight: isActive ? 700 : 500,
    color: isActive ? "#0F1111" : "#888c8c",
    borderBottom: isActive ? "2px solid #008296" : "2px solid transparent",
    padding: "8px 12px",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomStyle: "solid",
    borderBottomWidth: "2px",
    borderBottomColor: isActive ? "#008296" : "transparent",
  });

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#ffffff",
      color: "#0F1111",
      borderLeft: "1px solid #e7e7e7",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #e7e7e7",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <MessageCircle style={{ width: "16px", height: "16px", color: "#008296" }} />
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>Comments</span>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #e7e7e7",
        padding: "0 8px",
      }}>
        <button type="button" onClick={() => setTab("active")} style={tabStyle(tab === "active")}>
          {activeCount} Active
        </button>
        <button type="button" onClick={() => setTab("resolved")} style={tabStyle(tab === "resolved")}>
          {resolvedCount} Resolved
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f2f4" }}>
        <div style={{ position: "relative" }}>
          <Search style={{
            position: "absolute",
            left: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "13px",
            height: "13px",
            color: "#888c8c",
          }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search comments…"
            style={{
              width: "100%",
              padding: "5px 8px 5px 28px",
              fontSize: "12px",
              border: "1px solid #e7e7e7",
              borderRadius: "3px",
              outline: "none",
              color: "#0F1111",
              backgroundColor: "#fafafa",
            }}
          />
        </div>
      </div>

      {/* Comment list */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 0",
      }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
            <Loader2 style={{ width: "20px", height: "20px", color: "#888c8c", animation: "spin 1s linear infinite" }} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "#888c8c", fontSize: "13px" }}>
            {tab === "active" ? "No active comments" : "No resolved comments"}
          </div>
        ) : (
          sorted.map((comment) => {
            const threadReplies = repliesByParent.get(comment.id) ?? [];
            return (
              <CommentCard
                key={comment.id}
                comment={comment}
                replies={threadReplies}
                onResolve={() => statusMutation.mutate({ commentId: comment.id, status: "resolved" })}
                onReopen={() => statusMutation.mutate({ commentId: comment.id, status: "active" })}
                onDelete={() => deleteMutation.mutate(comment.id)}
                onPinClick={onPinClick}
                productId={productId}
              />
            );
          })
        )}
      </div>

      {/* Pending pin indicator */}
      {pendingPin && (
        <div style={{
          borderTop: "1px solid #e7e7e7",
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "#f0f9fa",
          fontSize: "12px",
          color: "#008296",
        }}>
          <MapPin style={{ width: "12px", height: "12px", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Pin on MOD{String(pendingPin.moduleNumber).padStart(2, "0")} ({Math.round(pendingPin.pinX)}%, {Math.round(pendingPin.pinY)}%)
          </span>
          <button
            type="button"
            onClick={onPinClear}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: "#888c8c",
              display: "flex",
            }}
          >
            <X style={{ width: "12px", height: "12px" }} />
          </button>
        </div>
      )}

      {/* New comment input */}
      <div style={{
        borderTop: pendingPin ? "none" : "1px solid #e7e7e7",
        padding: "12px",
        display: "flex",
        alignItems: "flex-end",
        gap: "8px",
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          {/* @mention dropdown */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              right: 0,
              marginBottom: "4px",
              backgroundColor: "#ffffff",
              border: "1px solid #e7e7e7",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              maxHeight: "180px",
              overflowY: "auto",
              zIndex: 20,
            }}>
              {mentionMatches.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => insertMention(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: "13px",
                    color: "#0F1111",
                    backgroundColor: i === mentionIdx ? "#f0f2f4" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    backgroundColor: avatarColor(m.email),
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {getInitials(m.name, m.email)}
                  </span>
                  <span style={{ fontWeight: 600 }}>{m.name || m.email.split("@")[0]}</span>
                  <span style={{ color: "#888c8c", fontSize: "12px" }}>{m.email}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={handleCommentChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setMentionQuery(null), 200)}
            placeholder="Type @ to mention a team member"
            rows={1}
            style={{
              width: "100%",
              fontSize: "13px",
              padding: "8px 10px",
              border: "1px solid #e7e7e7",
              borderRadius: "3px",
              outline: "none",
              resize: "none",
              color: "#0F1111",
              minHeight: "36px",
              maxHeight: "80px",
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!newComment.trim() || createMutation.isPending}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: newComment.trim() ? "#008296" : "#e7e7e7",
            border: "none",
            cursor: newComment.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {createMutation.isPending ? (
            <Loader2 style={{ width: "14px", height: "14px", color: "#ffffff", animation: "spin 1s linear infinite" }} />
          ) : (
            <Send style={{ width: "14px", height: "14px", color: "#ffffff" }} />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Single comment card ──────────────────────────────────────────────

function CommentCard({
  comment,
  replies,
  onResolve,
  onReopen,
  onDelete,
  onPinClick,
  productId,
}: {
  comment: Comment;
  replies: Comment[];
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onPinClick?: (moduleId: string | null, pinX: number, pinY: number) => void;
  productId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const color = comment.audience === "client" ? "#7C3AED" : avatarColor(comment.authorEmail);

  const replyMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/aplus/${productId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          parentCommentId: comment.id,
          moduleId: comment.moduleId,
          audience: comment.audience,
          clientIdCode: comment.clientIdCode,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to reply");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-comments", productId] });
      setReplyText("");
      setReplyOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid #f0f2f4",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        {/* Number badge */}
        {comment.commentNumber && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            backgroundColor: color,
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {comment.commentNumber}
          </span>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Author + time */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111" }}>
              {comment.authorName || comment.authorEmail.split("@")[0]}
            </span>
            {comment.audience === "client" && (
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#ffffff",
                backgroundColor: "#6366F1",
                padding: "1px 6px",
                borderRadius: "9999px",
                lineHeight: "16px",
              }}>
                Client
              </span>
            )}
            <span style={{ fontSize: "11px", color: "#888c8c" }}>
              {timeAgo(comment.createdAt)}
            </span>
          </div>

          {/* Pin indicator */}
          {comment.pinX != null && comment.pinY != null && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "10px",
                color: "#008296",
                marginBottom: "4px",
                cursor: onPinClick ? "pointer" : "default",
              }}
              onClick={() => {
                if (onPinClick && comment.pinX != null && comment.pinY != null) {
                  onPinClick(comment.moduleId, comment.pinX, comment.pinY);
                }
              }}
            >
              <MapPin style={{ width: "10px", height: "10px" }} />
              Pinned
            </div>
          )}

          {/* Body */}
          <p style={{
            fontSize: "13px",
            color: "#0F1111",
            lineHeight: 1.5,
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {comment.body}
          </p>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            {comment.status === "active" ? (
              <button
                type="button"
                onClick={onResolve}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "#10B981",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Check style={{ width: "12px", height: "12px" }} />
                Resolve
              </button>
            ) : (
              <button
                type="button"
                onClick={onReopen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "#F59E0B",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <RotateCcw style={{ width: "12px", height: "12px" }} />
                Reopen
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: "#888c8c",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Trash2 style={{ width: "11px", height: "11px" }} />
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyOpen(!replyOpen);
                setTimeout(() => replyRef.current?.focus(), 50);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: "#008296",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                marginLeft: "4px",
              }}
            >
              <MessageCircle style={{ width: "11px", height: "11px" }} />
              Reply
            </button>
          </div>

          {/* Replies */}
          {replies.length > 0 && (
            <div style={{ marginTop: "10px", paddingLeft: "12px", borderLeft: "2px solid #e7e7e7" }}>
              {replies.map((reply) => (
                <div key={reply.id} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F1111" }}>
                      {reply.authorName || reply.authorEmail.split("@")[0]}
                    </span>
                    {reply.audience === "client" && (
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        color: "#ffffff",
                        backgroundColor: "#6366F1",
                        padding: "0px 5px",
                        borderRadius: "9999px",
                        lineHeight: "14px",
                      }}>
                        Client
                      </span>
                    )}
                    <span style={{ fontSize: "10px", color: "#888c8c" }}>
                      {timeAgo(reply.createdAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#565959", margin: 0, lineHeight: 1.4 }}>
                    {reply.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          {replyOpen && (
            <div style={{ marginTop: "8px", display: "flex", gap: "6px", alignItems: "flex-end" }}>
              <textarea
                ref={replyRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (replyText.trim()) replyMutation.mutate(replyText);
                  }
                  if (e.key === "Escape") setReplyOpen(false);
                }}
                placeholder="Write a reply…"
                rows={1}
                style={{
                  flex: 1,
                  fontSize: "12px",
                  padding: "6px 8px",
                  border: "1px solid #e7e7e7",
                  borderRadius: "3px",
                  outline: "none",
                  resize: "none",
                  color: "#0F1111",
                  minHeight: "32px",
                  maxHeight: "60px",
                }}
              />
              <button
                type="button"
                onClick={() => { if (replyText.trim()) replyMutation.mutate(replyText); }}
                disabled={!replyText.trim() || replyMutation.isPending}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: replyText.trim() ? "#008296" : "#e7e7e7",
                  border: "none",
                  cursor: replyText.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {replyMutation.isPending ? (
                  <Loader2 style={{ width: "12px", height: "12px", color: "#ffffff", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Send style={{ width: "12px", height: "12px", color: "#ffffff" }} />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
