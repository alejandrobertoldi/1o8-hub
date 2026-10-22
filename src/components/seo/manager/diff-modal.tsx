/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useMemo } from "react";
import { diffWords } from "diff";
import type { SeoVersion } from "@/lib/seo-types";

interface DiffModalProps {
  v1: SeoVersion; // older
  v2: SeoVersion; // newer
  onClose: () => void;
}

function DiffField({ label, oldVal, newVal }: { label: string; oldVal: string; newVal: string }) {
  const parts = useMemo(() => diffWords(oldVal, newVal), [oldVal, newVal]);
  const hasChanges = parts.some((p) => p.added || p.removed);

  if (!hasChanges) return null;

  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold text-muted-foreground mb-1">{label}</p>
      <div className="text-xs text-foreground leading-relaxed">
        {parts.map((part, i) => {
          if (part.added) {
            return (
              <span key={i} className="bg-emerald-100/50 underline decoration-emerald-500 dark:bg-emerald-500/10">
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span key={i} className="bg-red-100/50 line-through decoration-red-500 text-red-600/70 dark:bg-red-500/10 dark:text-red-400/70">
                {part.value}
              </span>
            );
          }
          return <span key={i}>{part.value}</span>;
        })}
      </div>
    </div>
  );
}

export function DiffModal({ v1, v2, onClose }: DiffModalProps) {
  const fieldNames = Object.keys(v2.fields);
  const changedFields = fieldNames.filter(
    (f) => (v1.fields[f] || "") !== (v2.fields[f] || "")
  );
  const unchangedCount = fieldNames.length - changedFields.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="diff-title"
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="diff-title" className="text-sm font-bold text-foreground">
            v{v1.seoVersionNumber} &#8594; v{v2.seoVersionNumber}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {changedFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No differences found between these versions.</p>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground mb-4">
              {changedFields.length} field{changedFields.length !== 1 ? "s" : ""} changed
              {unchangedCount > 0 && ` · ${unchangedCount} unchanged`}
            </p>
            {changedFields.map((f) => (
              <DiffField
                key={f}
                label={f}
                oldVal={v1.fields[f] || ""}
                newVal={v2.fields[f] || ""}
              />
            ))}
          </>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
