/* eslint-disable react-doctor/no-long-transition-duration */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { ColumnMapping } from "@/lib/import-mapper";
import type { ImportSourceState } from "./step-source";

interface ImportResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  duration: string;
}

interface StepExecuteProps {
  sourceState: ImportSourceState;
  mappings: ColumnMapping[];
  conflictMode: "skip" | "overwrite" | "merge";
  clientFilter: string;
  onBack: () => void;
  onReset: () => void;
}

export function StepExecute({
  sourceState,
  mappings,
  conflictMode,
  clientFilter,
  onBack,
  onReset,
}: StepExecuteProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Build confirmed mappings (only mapped columns)
  const confirmedMappings = mappings
    .filter((m) => m.bqName)
    .map((m) => ({
      sourceHeader: m.sourceHeader,
      bqName: m.bqName!,
    }));

  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      if (sourceState.type === "csv") {
        const formData = new FormData();
        formData.append("file", sourceState.file!);
        formData.append(
          "config",
          JSON.stringify({
            source: "csv",
            mappings: confirmedMappings,
            conflictMode,
            clientFilter: clientFilter || undefined,
          })
        );
        const res = await fetch("/api/import/execute", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Import failed");
        }
        return res.json();
      } else {
        const res = await fetch("/api/import/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "bigquery",
            mappings: confirmedMappings,
            conflictMode,
            clientFilter: clientFilter || undefined,
            bqDataset: sourceState.bqDataset,
            bqTable: sourceState.bqTable,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Import failed");
        }
        return res.json();
      }
    },
    onSuccess: (data) => {
      toast.success(
        `Import complete: ${data.inserted} inserted, ${data.updated} updated`
      );
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: Error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  // Auto-start import on mount
  useEffect(() => {
    importMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = importMutation.data;
  const isLoading = importMutation.isPending;
  const isError = importMutation.isError;

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="rounded-lg border p-8 text-center space-y-4">
          <Loader2 className="size-12 animate-spin mx-auto text-brand" />
          <h2 className="text-lg font-semibold">Importing Products…</h2>
          <p className="text-sm text-muted-foreground">
            Processing {sourceState.totalRows.toLocaleString()} rows. This may
            take a minute.
          </p>
          {/* Indeterminate progress bar */}
          <div className="w-full max-w-md mx-auto h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                backgroundColor: "var(--brand)",
                width: "60%",
                animation: "indeterminate 1.5s ease-in-out infinite",
              }}
            />
          </div>
          <style>{`
            @keyframes indeterminate {
              0% { transform: translateX(-100%); width: 40%; }
              50% { transform: translateX(50%); width: 60%; }
              100% { transform: translateX(200%); width: 40%; }
            }
          `}</style>
        </div>
      )}

      {result && (
        <div className="rounded-lg border p-8 space-y-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="size-8 text-emerald-500" />
            <h2 className="text-lg font-semibold">Import Complete</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Inserted" value={result.inserted} color="text-emerald-600" />
            <StatCard label="Updated" value={result.updated} color="text-blue-600" />
            <StatCard label="Skipped" value={result.skipped} color="text-muted-foreground" />
            <StatCard label="Failed" value={result.failed} color={result.failed > 0 ? "text-red-600" : "text-muted-foreground"} />
          </div>

          <p className="text-sm text-muted-foreground">
            Duration: {result.duration}
          </p>

          {result.errors.length > 0 && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <h4 className="text-sm font-medium text-red-400 mb-1">Errors</h4>
              <ul className="text-xs text-red-400 space-y-0.5">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => router.push("/products")}
              className="bg-brand-solid text-white hover:bg-brand-solid-hover"
            >
              View Products
              <ArrowRight className="size-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={onReset}>
              <RotateCcw className="size-4 mr-1" />
              Import More
            </Button>
          </div>
        </div>
      )}

      {isError && !result && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center space-y-4">
          <XCircle className="size-12 mx-auto text-red-500" />
          <h2 className="text-lg font-semibold text-red-400">Import Failed</h2>
          <p className="text-sm text-red-400">
            {importMutation.error?.message || "An unknown error occurred"}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={onBack}>
              Back to Options
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              className="bg-brand-solid text-white hover:bg-brand-solid-hover"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Back button only shown during loading */}
      {isLoading && (
        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack} disabled>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
