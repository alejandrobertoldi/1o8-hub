"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Makes a piece of preview text commentable in place: hover outline + 💬 button,
 * open-comment count badge, and the thread opening right under the text.
 * Esc or a click outside closes it.
 */
export function CommentAnchor({ label, count, active, onOpen, onClose, thread, className = "", children }: {
  label: string;
  count: number;
  active: boolean;
  onOpen: () => void;
  onClose: () => void;
  thread?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [active, onClose]);

  return (
    <div ref={ref} data-comment-anchor={label} className={`group/anchor relative ${className}`}>
      <div
        onClick={onOpen}
        className={`-mx-1.5 cursor-pointer rounded-md px-1.5 transition-shadow ${active ? "ring-2 ring-[#ff9900]" : "hover:ring-1 hover:ring-[#ff9900]/60"}`}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Comment on ${label}`}
        title={`Comment on ${label}`}
        className={`absolute -right-1 -top-2.5 inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold shadow transition-opacity ${
          count > 0 ? "bg-[#ff9900] text-black opacity-100" : `bg-white text-neutral-700 ring-1 ring-neutral-300 ${active ? "opacity-100" : "opacity-0 group-hover/anchor:opacity-100"}`
        }`}
      >
        <span aria-hidden="true">💬</span>{count > 0 && <span>{count}</span>}
      </button>
      {active && thread && (
        <div className="relative z-10 mt-2 rounded-xl border border-border bg-card p-3 text-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold">{label}</p>
            <button type="button" onClick={onClose} aria-label="Close comments" className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          {thread}
        </div>
      )}
    </div>
  );
}
