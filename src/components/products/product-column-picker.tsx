"use client";

import { useState, useMemo } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useColumnAttributes, type EnrichedAttribute } from "@/hooks/use-column-attributes";
import {
  REQUIREMENT_COLORS,
  REQUIREMENT_SHORT_LABELS,
  type RequirementLevel,
} from "@/lib/constants";

type Props = {
  clientCode?: string;
  selectedAttrs: EnrichedAttribute[];
  onSelectedChange: (attrs: EnrichedAttribute[]) => void;
};

export function ProductColumnPicker({
  clientCode,
  selectedAttrs,
  onSelectedChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const { groups, isLoading } = useColumnAttributes(clientCode);

  const selectedKeys = useMemo(
    () => new Set(selectedAttrs.map((a) => a.generalLabel)),
    [selectedAttrs]
  );

  // Flat list for lookup by generalLabel
  const allAttrs = useMemo(() => {
    const map = new Map<string, EnrichedAttribute>();
    for (const group of groups) {
      for (const sub of group.subgroups) {
        for (const attr of sub.attributes) {
          map.set(attr.generalLabel, attr);
        }
      }
    }
    return map;
  }, [groups]);

  const toggle = (attr: EnrichedAttribute) => {
    if (selectedKeys.has(attr.generalLabel)) {
      onSelectedChange(
        selectedAttrs.filter((a) => a.generalLabel !== attr.generalLabel)
      );
    } else {
      onSelectedChange([...selectedAttrs, attr]);
    }
  };

  const count = selectedAttrs.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          Columns
          {count > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-[20px] px-1 text-xs bg-brand-solid text-white"
            >
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search attributes..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              {isLoading ? "Loading attributes..." : "No attributes found."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.name} heading={group.name}>
                {group.subgroups.flatMap((sub) =>
                  sub.attributes.map((attr) => {
                    const isSelected = selectedKeys.has(attr.generalLabel);
                    const req = (attr.isEssential ? "Required" : "") as RequirementLevel;
                    const shortLabel = REQUIREMENT_SHORT_LABELS[req];
                    const colorClass = REQUIREMENT_COLORS[req];
                    return (
                      <CommandItem
                        key={attr.generalLabel}
                        value={attr.generalLabel}
                        onSelect={() => toggle(attr)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isSelected
                              ? "bg-brand-solid border-brand-solid text-white"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                              <path
                                d="M1.5 5L4 7.5L8.5 2.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 truncate text-xs">
                          {attr.generalLabel}
                        </span>
                        {shortLabel && colorClass && (
                          <span
                            className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4 ${colorClass}`}
                          >
                            {shortLabel}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {count > 0 && (
          <div className="border-t p-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {count} column{count !== 1 ? "s" : ""} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onSelectedChange([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
