/* eslint-disable jsx-a11y/label-has-associated-control */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnMapping } from "@/lib/import-mapper";
import type { ImportSourceState } from "./step-source";

type ClientEntry = { clientIdCode: string; count: number; activeCount: number };

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) return [];
  return res.json();
}

interface StepOptionsProps {
  sourceState: ImportSourceState;
  mappings: ColumnMapping[];
  conflictMode: "skip" | "overwrite" | "merge";
  onConflictModeChange: (mode: "skip" | "overwrite" | "merge") => void;
  clientFilter: string;
  onClientFilterChange: (client: string) => void;
  onBack: () => void;
  onComplete: () => void;
}

const CONFLICT_OPTIONS = [
  {
    value: "skip" as const,
    label: "Skip",
    description: "Keep existing data, ignore the import row",
  },
  {
    value: "overwrite" as const,
    label: "Overwrite",
    description: "Replace all fields with imported values",
  },
  {
    value: "merge" as const,
    label: "Merge",
    description: "Only fill in fields that are currently empty in the DB",
  },
];

export function StepOptions({
  sourceState,
  mappings,
  conflictMode,
  onConflictModeChange,
  clientFilter,
  onClientFilterChange,
  onBack,
  onComplete,
}: StepOptionsProps) {
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
    staleTime: 5 * 60 * 1000,
  });

  const mappedCount = mappings.filter((m) => m.bqName).length;
  const unmappedCount = mappings.filter((m) => !m.bqName).length;

  // Estimate filtered row count from preview data
  const filteredEstimate = useMemo(() => {
    if (!clientFilter) return null;
    // Find which source header maps to ClientIDCode
    const clientMapping = mappings.find((m) => m.bqName === "ClientIDCode");
    if (!clientMapping) return null;
    const matchingPreview = sourceState.preview.filter(
      (row) => row[clientMapping.sourceHeader] === clientFilter
    );
    // This is just an estimate from preview rows
    if (sourceState.preview.length === 0) return null;
    const ratio = matchingPreview.length / sourceState.preview.length;
    return Math.round(sourceState.totalRows * ratio);
  }, [clientFilter, mappings, sourceState]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Import Options</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how to handle conflicts and filter data.
        </p>
      </div>

      {/* Conflict Resolution */}
      <div className="space-y-3">
        <label className="text-sm font-medium">
          Conflict Resolution
        </label>
        <p className="text-xs text-muted-foreground">
          When an imported product already exists (matched by ASIN + SKU + Marketplace):
        </p>
        <div className="space-y-2">
          {CONFLICT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                conflictMode === opt.value
                  ? "border-brand bg-brand/10"
                  : "border-border hover:border-border"
              }`}
            >
              <input
                type="radio"
                name="conflictMode"
                value={opt.value}
                checked={conflictMode === opt.value}
                onChange={() => onConflictModeChange(opt.value)}
                className="mt-0.5 accent-brand"
              />
              <div>
                <span className="text-sm font-medium">{opt.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Client Filter */}
      <div className="space-y-2 max-w-sm">
        <label className="text-sm font-medium">
          Client Filter (optional)
        </label>
        <p className="text-xs text-muted-foreground">
          Only import rows matching this ClientIDCode
        </p>
        <Select
          value={clientFilter || "all"}
          onValueChange={(v) => onClientFilterChange(v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                {c.clientIdCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clientFilter && filteredEstimate !== null && (
          <p className="text-xs text-muted-foreground">
            ~{sourceState.totalRows.toLocaleString()} rows &rarr;{" "}
            ~{filteredEstimate.toLocaleString()} rows matching{" "}
            <span className="font-medium">{clientFilter}</span>
          </p>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-1.5">
        <h3 className="text-sm font-medium">Summary</h3>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            Source:{" "}
            <span className="text-foreground font-medium">
              {sourceState.type === "csv"
                ? `${sourceState.fileName} (${sourceState.totalRows.toLocaleString()} rows)`
                : `BigQuery ${sourceState.bqDataset}.${sourceState.bqTable} (${sourceState.totalRows.toLocaleString()} rows)`}
            </span>
          </p>
          <p>
            Mapped columns:{" "}
            <span className="text-foreground font-medium">
              {mappedCount} of {mappings.length}
            </span>
          </p>
          <p>
            Unmapped (will be skipped):{" "}
            <span className="text-foreground font-medium">{unmappedCount}</span>
          </p>
          <p>
            Conflict mode:{" "}
            <span className="text-foreground font-medium capitalize">
              {conflictMode}
            </span>
          </p>
          {clientFilter && (
            <p>
              Client filter:{" "}
              <span className="text-foreground font-medium">{clientFilter}</span>
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onComplete}
          className="bg-brand-solid text-white hover:bg-brand-solid-hover"
        >
          Start Import
        </Button>
      </div>
    </div>
  );
}
