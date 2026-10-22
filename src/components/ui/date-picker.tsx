"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
};

export function parseLocalDate(val: string): Date | undefined {
  if (!val) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
  if (!m) return undefined;
  const y = Number(m[1]);
  if (y < 1900 || y > 2100) return undefined;
  const d = new Date(y, Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return isNaN(d.getTime()) ? undefined : d;
}

export function localDateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateShort(d: Date | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "—",
  className,
  align = "start",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const selected = parseLocalDate(value);
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const invalid = !!value && !selected;
  const displayLabel = selected ? formatDateShort(selected) : invalid ? value : placeholder;

  const commit = (next: string) => {
    setOpen(false);
    onChange(next);
  };

  if (disabled) {
    return (
      <span className={cn("text-muted-foreground", className)}>{displayLabel}</span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Re-anchor on the stored date each time it opens; otherwise the
        // month browsed to last time sticks and the selection looks lost.
        if (next) setMonth(selected ?? new Date());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1.5 h-6 w-[130px] px-2 text-xs bg-background border border-border/40 hover:border-brand/50 rounded outline-none focus:border-brand transition-colors cursor-pointer",
            selected ? "text-foreground" : invalid ? "text-red-500" : "text-muted-foreground/40",
            className,
          )}
          title={invalid ? `Invalid stored value: ${value}` : undefined}
        >
          <CalendarDays className="size-3 shrink-0 opacity-60" />
          <span className="truncate tabular-nums">{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 z-[60]"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => { if (date) commit(localDateToISO(date)); }}
          month={month}
          onMonthChange={setMonth}
        />
        <div className="border-t border-border/60 px-3 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => commit(localDateToISO(new Date()))}
            className="text-xs font-medium text-foreground/80 hover:text-foreground hover:bg-accent transition-colors px-2 py-1 rounded-md cursor-pointer"
          >
            Today
          </button>
          {(selected || invalid) && (
            <button
              type="button"
              onClick={() => commit("")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 hover:bg-accent transition-colors px-2 py-1 rounded-md cursor-pointer"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
