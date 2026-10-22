/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/js-combine-iterations */
"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, Check, AlertTriangle } from "lucide-react";
import { useColumnAttributes } from "@/hooks/use-column-attributes";
import type { ColumnMapping } from "@/lib/import-mapper";
import type { ImportSourceState } from "./step-source";

interface StepMappingProps {
  sourceState: ImportSourceState;
  mappings: ColumnMapping[];
  onBack: () => void;
  onComplete: (mappings: ColumnMapping[]) => void;
}

export function StepMapping({
  sourceState,
  mappings: initialMappings,
  onBack,
  onComplete,
}: StepMappingProps) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(initialMappings);
  const { groups, isLoading: attrsLoading } = useColumnAttributes();

  // Flatten groups for the picker
  const allAttributes = useMemo(() => {
    const result: { group: string; bqName: string; generalLabel: string }[] = [];
    for (const group of groups) {
      for (const subgroup of group.subgroups) {
        for (const attr of subgroup.attributes) {
          if (attr.bqLabel) {
            result.push({
              group: group.name,
              bqName: attr.bqLabel,
              generalLabel: attr.generalLabel,
            });
          }
        }
      }
    }
    return result;
  }, [groups]);

  // Grouped for the command picker
  const groupedAttributes = useMemo(() => {
    const map = new Map<string, { bqName: string; generalLabel: string }[]>();
    for (const a of allAttributes) {
      if (!map.has(a.group)) map.set(a.group, []);
      map.get(a.group)!.push(a);
    }
    return map;
  }, [allAttributes]);

  const mappedCount = mappings.filter((m) => m.bqName).length;
  const unmappedCount = mappings.filter((m) => !m.bqName).length;

  // Check for duplicate target mappings
  const duplicates = useMemo(() => {
    const bqNames = mappings.filter((m) => m.bqName).map((m) => m.bqName!);
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const name of bqNames) {
      if (seen.has(name)) dups.add(name);
      seen.add(name);
    }
    return dups;
  }, [mappings]);

  // Must have ASIN or SKU mapped
  const hasIdentifier = mappings.some(
    (m) => m.bqName === "ASIN" || m.bqName === "SKU"
  );

  const canProceed = hasIdentifier && duplicates.size === 0;

  function updateMapping(index: number, bqName: string | null, generalLabel: string | null) {
    setMappings((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        bqName,
        generalLabel,
        confidence: bqName ? "exact" : "unmapped",
      };
      return next;
    });
  }

  // Get a preview value for a given source header
  function getPreviewValue(header: string): string {
    for (const row of sourceState.preview) {
      if (row[header] && row[header].trim()) {
        const val = row[header];
        return val.length > 40 ? val.slice(0, 40) + "..." : val;
      }
    }
    return "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Column Mapping</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review and adjust how source columns map to Hub fields.
        </p>
      </div>

      {!hasIdentifier && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>At least <strong>ASIN</strong> or <strong>SKU</strong> must be mapped to proceed.</span>
        </div>
      )}

      {duplicates.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>
            Duplicate target mappings: {[...duplicates].join(", ")}. Each target column can only be mapped once.
          </span>
        </div>
      )}

      {/* Mapping Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-3 py-2 text-left font-medium w-[200px]">Source Column</th>
              <th className="px-3 py-2 text-left font-medium w-[300px]">Maps To (Hub)</th>
              <th className="px-3 py-2 text-left font-medium w-[100px]">Confidence</th>
              <th className="px-3 py-2 text-left font-medium">Preview</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => {
              const isDuplicate = m.bqName ? duplicates.has(m.bqName) : false;
              return (
                <tr key={m.sourceHeader} className={`border-b ${i % 2 === 0 ? "bg-card" : "bg-muted/30"}`}>
                  <td className="px-3 py-1.5 font-mono text-xs">{m.sourceHeader}</td>
                  <td className="px-3 py-1.5">
                    <MappingPicker
                      value={m.bqName}
                      groupedAttributes={groupedAttributes}
                      attrsLoading={attrsLoading}
                      isDuplicate={isDuplicate}
                      onChange={(bqName, generalLabel) =>
                        updateMapping(i, bqName, generalLabel)
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ConfidenceBadge confidence={m.confidence} />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                    {getPreviewValue(m.sourceHeader)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Mapped: <span className="font-medium text-foreground">{mappedCount}</span> /{" "}
        {mappings.length} columns &middot; Unmapped:{" "}
        <span className="font-medium text-foreground">{unmappedCount}</span> columns
        (will be skipped)
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() => onComplete(mappings)}
          disabled={!canProceed}
          className="bg-brand-solid text-white hover:bg-brand-solid-hover"
        >
          Next: Import Options
        </Button>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  switch (confidence) {
    case "exact":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15">
          Exact
        </Badge>
      );
    case "partial":
      return (
        <Badge className="bg-yellow-500/15 text-brand border-brand/30 hover:bg-yellow-500/15">
          Partial
        </Badge>
      );
    default:
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/15">
          Unmapped
        </Badge>
      );
  }
}

function MappingPicker({
  value,
  groupedAttributes,
  attrsLoading,
  isDuplicate,
  onChange,
}: {
  value: string | null;
  groupedAttributes: Map<string, { bqName: string; generalLabel: string }[]>;
  attrsLoading: boolean;
  isDuplicate: boolean;
  onChange: (bqName: string | null, generalLabel: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal text-xs h-8 ${
            isDuplicate ? "border-red-500/40 bg-red-500/10" : ""
          }`}
        >
          <span className="truncate">
            {value || "Skip this column"}
          </span>
          <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fields…" />
          <CommandList>
            <CommandEmpty>
              {attrsLoading ? "Loading…" : "No fields found."}
            </CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem
                value="__skip__"
                onSelect={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 size-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                <span className="text-muted-foreground italic">Skip this column</span>
              </CommandItem>
            </CommandGroup>
            {[...groupedAttributes.entries()].map(([group, attrs]) => (
              <CommandGroup key={group} heading={group}>
                {attrs.map((attr) => (
                  <CommandItem
                    key={attr.bqName}
                    value={`${attr.generalLabel} ${attr.bqName}`}
                    onSelect={() => {
                      onChange(attr.bqName, attr.generalLabel);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`mr-2 size-4 ${
                        value === attr.bqName ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="truncate text-xs">{attr.generalLabel}</span>
                    {attr.bqName !== attr.generalLabel && (
                      <span className="ml-auto text-[10px] text-muted-foreground truncate">
                        {attr.bqName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
