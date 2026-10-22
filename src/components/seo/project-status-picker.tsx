"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useOutsideClick } from "@/hooks/use-outside-click";
import type { ProjectStatus } from "@/lib/seo-pipeline-types";
import {
  MANUAL_PROJECT_STATUSES,
  projectStatusClass,
  projectStatusLabel,
} from "@/lib/seo/project-status";
import { GoLivePopover, type GoLiveAnchor } from "./go-live-popover";

interface ProjectStatusPickerProps {
  projectId: string;
  status: string;
  disabled?: boolean;
  onUpdated?: (status: ProjectStatus) => void;
}

export function ProjectStatusPicker({
  projectId,
  status,
  disabled = false,
  onUpdated,
}: ProjectStatusPickerProps) {
  const [open, setOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<GoLiveAnchor | null>(null);
  const ref = useOutsideClick<HTMLDivElement>(
    () => { setOpen(false); setGoLiveOpen(false); },
    open || goLiveOpen,
    portalRef,
  );

  // I1 fix: the go-live popover is portaled to document.body (it must not be a
  // DOM descendant of the project card's <a>, or clicking its date input can
  // fall through to the anchor's native navigation). The status menu is portaled
  // too: the card's entrance animation (a transform) makes it a stacking context,
  // so an in-card menu was painted UNDER the next card and hid "go live…" (prod
  // 2026-09-30). Both share portalRef; only one is open at a time. Recompute the
  // anchor on open, and close on scroll/resize since a fixed-position portal does
  // not move with the pill.
  useEffect(() => {
    if (!open && !goLiveOpen) return;
    function place() {
      const rect = pillRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    place();
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && portalRef.current?.contains(e.target)) return;
      setOpen(false);
      setGoLiveOpen(false);
    };
    const onResize = () => { setOpen(false); setGoLiveOpen(false); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, goLiveOpen]);

  async function selectStatus(next: ProjectStatus) {
    if (next === status || saving) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      onUpdated?.(next);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={pillRef}
        type="button"
        disabled={disabled || saving}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            setOpen((v) => !v);
            setGoLiveOpen(false);
          }
        }}
        className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold transition-opacity ${projectStatusClass(status)} ${
          disabled ? "cursor-default" : "cursor-pointer hover:opacity-80"
        }`}
        title={disabled ? projectStatusLabel(status) : "Change status"}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {projectStatusLabel(status)}
      </button>
      {open && anchor && createPortal(
        <div
          ref={portalRef}
          role="listbox"
          style={{ position: "fixed", top: anchor.top, right: anchor.right }}
          className="z-50 w-36 rounded-lg border border-stone-200 bg-white shadow-xl py-1 dark:border-zinc-700 dark:bg-zinc-900"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {MANUAL_PROJECT_STATUSES.map((s) => (
            <button
              type="button"
              key={s}
              role="option"
              aria-selected={s === status}
              disabled={saving}
              onClick={() => selectStatus(s)}
              className={`w-full px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-zinc-800 ${
                s === status ? "bg-amber-50 dark:bg-amber-500/10" : ""
              }`}
            >
              <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold ${projectStatusClass(s)}`}>
                {projectStatusLabel(s)}
              </span>
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => { setOpen(false); setGoLiveOpen(true); }}
            className="w-full px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-zinc-800"
          >
            <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold ${projectStatusClass("live")}`}>go live…</span>
          </button>
        </div>,
        document.body,
      )}
      {goLiveOpen && anchor && (
        <GoLivePopover
          projectId={projectId}
          anchor={anchor}
          portalRef={portalRef}
          onUpdated={(s) => onUpdated?.(s)}
        />
      )}
    </div>
  );
}
