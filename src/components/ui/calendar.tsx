"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { enUS } from "date-fns/locale"

import { cn } from "@/lib/utils"

// react-day-picker v9 renders <nav> as a SIBLING before the month grid, not
// inside the caption. The root is therefore the positioning context for the
// arrows, and the nav sits above the caption (z-10) so the caption can never
// swallow a click. Neutral tokens only: this component is shared by Hub and
// Portal, so it must not carry either side's accent (DESIGN.md dual-accent).
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = enUS,
  weekStartsOn = 1,
  ...props
}: React.ComponentProps<typeof DayPicker> & { locale?: typeof enUS }) {
  const navButton = cn(
    "inline-flex size-8 items-center justify-center rounded-lg border border-border/60 bg-transparent text-muted-foreground",
    "cursor-pointer select-none transition-[background-color,color,transform] duration-150",
    "hover:bg-accent hover:text-foreground active:scale-95",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-30"
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      weekStartsOn={weekStartsOn}
      className={cn("relative p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        nav: "absolute inset-x-3 top-3 z-10 flex h-8 items-center justify-between pointer-events-none [&>button]:pointer-events-auto",
        button_previous: navButton,
        button_next: navButton,
        month_caption: "flex h-8 items-center justify-center px-10",
        caption_label: "text-sm font-semibold tracking-tight text-foreground",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70",
        week: "flex w-full mt-1",
        day: "relative size-9 p-0 text-center text-sm",
        day_button: cn(
          "inline-flex size-9 items-center justify-center rounded-lg text-sm font-normal tabular-nums text-foreground",
          "cursor-pointer transition-colors duration-150 hover:bg-accent",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold [&>button]:shadow-sm [&>button]:hover:bg-primary",
        today:
          "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-foreground/25",
        outside: "[&>button]:text-muted-foreground/40",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-30",
        range_start: "[&>button]:bg-primary [&>button]:text-primary-foreground",
        range_end: "[&>button]:bg-primary [&>button]:text-primary-foreground",
        range_middle:
          "bg-accent first:rounded-l-lg last:rounded-r-lg [&>button]:bg-transparent [&>button]:text-accent-foreground [&>button]:rounded-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
