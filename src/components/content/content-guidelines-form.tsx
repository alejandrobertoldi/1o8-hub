"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { ContentGuidelines } from "@/lib/variation-guidelines";

export function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addChip() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 p-2 min-h-[2.5rem]">
      {value.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-foreground border border-stone-200 dark:border-zinc-700"
        >
          {chip}
          <button
            type="button"
            onClick={() => onChange(value.filter((c) => c !== chip))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip();
          }
          if (e.key === "Backspace" && !input && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={addChip}
      />
    </div>
  );
}

export function ContentGuidelinesForm({
  value,
  onChange,
  inheritedFrom,
}: {
  value: ContentGuidelines;
  onChange: (v: ContentGuidelines) => void;
  inheritedFrom?: ContentGuidelines | null;
}) {
  return (
    <div className="space-y-3 py-3 px-4">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Messaging Angle
        </Label>
        <ChipInput
          value={value.messagingAngle ?? []}
          onChange={(chips) => onChange({ ...value, messagingAngle: chips })}
          placeholder={
            inheritedFrom?.messagingAngle?.length
              ? `Inheriting: "${inheritedFrom.messagingAngle[0]}"`
              : "e.g. Lead with sleep benefits, press Enter"
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Target Audience
        </Label>
        <ChipInput
          value={value.targetAudience ?? []}
          onChange={(chips) => onChange({ ...value, targetAudience: chips })}
          placeholder={
            inheritedFrom?.targetAudience?.length
              ? `Inheriting: "${inheritedFrom.targetAudience[0]}"`
              : "e.g. Adults 25–45 seeking better sleep, press Enter"
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Key Features
        </Label>
        <ChipInput
          value={value.keyFeatures ?? []}
          onChange={(chips) => onChange({ ...value, keyFeatures: chips })}
          placeholder="Add a feature, press Enter"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Do</Label>
          <ChipInput
            value={value.doList ?? []}
            onChange={(chips) => onChange({ ...value, doList: chips })}
            placeholder="Add a do"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Don&apos;t
          </Label>
          <ChipInput
            value={value.dontList ?? []}
            onChange={(chips) => onChange({ ...value, dontList: chips })}
            placeholder="Add a don't"
          />
        </div>
      </div>
    </div>
  );
}
