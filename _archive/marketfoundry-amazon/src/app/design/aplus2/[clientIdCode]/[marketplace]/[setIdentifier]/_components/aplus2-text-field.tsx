"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CopyTextButton } from "@/components/ui/copy-text-button";

export function Aplus2TextField({
  label,
  initialValue,
  onCommit,
  maxLength,
  multiline,
  rows,
  placeholder,
}: {
  label: string;
  initialValue: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const over = maxLength != null && value.length > maxLength;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1.5 shrink-0">
          <CopyTextButton value={value} label={label} />
          {maxLength != null && (
            <span className={`text-[10px] font-mono ${over ? "text-red-500" : "text-muted-foreground"}`}>
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      </div>
      {multiline ? (
        <Textarea
          rows={rows ?? 2}
          maxLength={maxLength}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <Input
          maxLength={maxLength}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
