"use client";

import { MessageSquare } from "lucide-react";

type Props = {
  totalOpen: number;
  fieldCount: number;
};

export function CommentSummary({ totalOpen, fieldCount }: Props) {
  if (totalOpen <= 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card text-white px-4 py-2.5 text-sm">
      <MessageSquare
        className="h-4 w-4 shrink-0"
        style={{ color: "var(--brand)" }}
        fill="var(--brand)"
      />
      <span>
        <strong>{totalOpen}</strong> open comment
        {totalOpen !== 1 ? "s" : ""} on{" "}
        <strong>{fieldCount}</strong> field
        {fieldCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
