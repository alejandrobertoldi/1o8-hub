"use client";

import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";

interface BulkEditBarProps {
  selectedCount: number;
  onClear: () => void;
  onEditField: () => void;
}

export function BulkEditBar({
  selectedCount,
  onClear,
  onEditField,
}: BulkEditBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand bg-secondary animate-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-sm font-medium text-white">
          {selectedCount} product{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="border-white/30 text-white hover:bg-card/10 hover:text-white"
          >
            <X className="h-4 w-4 mr-1" />
            Clear Selection
          </Button>
          <Button
            size="sm"
            onClick={onEditField}
            className="bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit Field
          </Button>
        </div>
      </div>
    </div>
  );
}
