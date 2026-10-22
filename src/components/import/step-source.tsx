/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileSpreadsheet,
  Database,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { ColumnMapping } from "@/lib/import-mapper";

export interface ImportSourceState {
  type: "csv" | "bigquery";
  file?: File;
  fileName?: string;
  totalRows: number;
  headers: string[];
  preview: Record<string, string>[];
  mappings: ColumnMapping[];
  bqDataset?: string;
  bqTable?: string;
}

interface StepSourceProps {
  sourceState: ImportSourceState | null;
  onComplete: (state: ImportSourceState) => void;
}

export function StepSource({ sourceState, onComplete }: StepSourceProps) {
  const [sourceType, setSourceType] = useState<"csv" | "bigquery" | null>(
    sourceState?.type ?? null
  );
  const [file, setFile] = useState<File | null>(sourceState?.file ?? null);
  const [bqDataset, setBqDataset] = useState(sourceState?.bqDataset ?? "1o8 Hub");
  const [bqTable, setBqTable] = useState(sourceState?.bqTable ?? "Master");
  const [parseResult, setParseResult] = useState<ImportSourceState | null>(sourceState);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const csvParseMutation = useMutation({
    mutationFn: async (csvFile: File) => {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await fetch("/api/import/parse", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Parse failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const state: ImportSourceState = {
        type: "csv",
        file: file!,
        fileName: data.fileName,
        totalRows: data.totalRows,
        headers: data.headers,
        preview: data.preview,
        mappings: data.mappings,
      };
      setParseResult(state);
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message);
      setParseResult(null);
    },
  });

  const bqPreviewMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      params.set("dataset", bqDataset);
      params.set("table", bqTable);
      params.set("limit", "5");
      const res = await fetch(`/api/import/bigquery-preview?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "BigQuery preview failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const state: ImportSourceState = {
        type: "bigquery",
        totalRows: data.totalRows,
        headers: data.headers,
        preview: data.preview,
        mappings: data.mappings,
        bqDataset,
        bqTable,
      };
      setParseResult(state);
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message);
      setParseResult(null);
    },
  });

  const handleFileChange = useCallback(
    (selectedFile: File | null) => {
      if (!selectedFile) return;
      setFile(selectedFile);
      setParseResult(null);
      setError("");
      csvParseMutation.mutate(selectedFile);
    },
    [csvParseMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile?.name.endsWith(".csv")) {
        handleFileChange(droppedFile);
      } else {
        setError("Please drop a .csv file");
      }
    },
    [handleFileChange]
  );

  const isLoading = csvParseMutation.isPending || bqPreviewMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select Import Source</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose where to import product data from.
        </p>
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CSV Card */}
        <button
          type="button"
          onClick={() => {
            setSourceType("csv");
            setParseResult(null);
            setError("");
          }}
          className={`rounded-lg border-2 p-6 text-left transition-colors cursor-pointer ${
            sourceType === "csv"
              ? "border-brand bg-brand/10"
              : "border-border hover:border-border"
          }`}
        >
          <FileSpreadsheet className="size-8 mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">CSV Upload</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a CSV file from your computer
          </p>
        </button>

        {/* BigQuery Card */}
        <button
          type="button"
          onClick={() => {
            setSourceType("bigquery");
            setParseResult(null);
            setError("");
          }}
          className={`rounded-lg border-2 p-6 text-left transition-colors cursor-pointer ${
            sourceType === "bigquery"
              ? "border-brand bg-brand/10"
              : "border-border hover:border-border"
          }`}
        >
          <Database className="size-8 mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">BigQuery</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Import directly from BigQuery
          </p>
        </button>
      </div>

      {/* CSV Upload Zone */}
      {sourceType === "csv" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-brand hover:bg-brand/8"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {csvParseMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 animate-spin text-muted-foreground/70" />
              <span className="text-sm text-muted-foreground">
                Parsing CSV…
              </span>
            </div>
          ) : parseResult?.type === "csv" ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="size-8 text-emerald-500" />
              <span className="text-sm font-medium">
                {parseResult.fileName}
              </span>
              <span className="text-xs text-muted-foreground">
                {parseResult.totalRows.toLocaleString()} rows &middot;{" "}
                {parseResult.headers.length} columns
              </span>
              <span className="text-xs text-muted-foreground">
                Click or drop to replace
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="size-8 text-muted-foreground/70" />
              <span className="text-sm font-medium text-muted-foreground">
                Drag & drop or click to browse
              </span>
              <span className="text-xs text-muted-foreground">
                .csv files only, max 10MB
              </span>
            </div>
          )}
        </div>
      )}

      {/* BigQuery Config */}
      {sourceType === "bigquery" && (
        <div className="space-y-4 max-w-md">
          <div className="space-y-2">
            <label className="text-sm font-medium">Dataset</label>
            <Input
              value={bqDataset}
              onChange={(e) => setBqDataset(e.target.value)}
              placeholder="1o8 Hub"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Table</label>
            <Input
              value={bqTable}
              onChange={(e) => setBqTable(e.target.value)}
              placeholder="Master"
            />
          </div>
          <Button
            onClick={() => bqPreviewMutation.mutate()}
            disabled={bqPreviewMutation.isPending || !bqDataset || !bqTable}
          >
            {bqPreviewMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Loading Preview…
              </>
            ) : (
              "Preview"
            )}
          </Button>

          {parseResult?.type === "bigquery" && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle className="size-4" />
              {parseResult.totalRows.toLocaleString()} rows &middot;{" "}
              {parseResult.headers.length} columns
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <XCircle className="size-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Preview Table */}
      {parseResult && parseResult.preview.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">
            Preview (first {parseResult.preview.length} rows)
          </h3>
          <div className="border rounded-lg overflow-x-auto max-h-64">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  {parseResult.headers.slice(0, 10).map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  {parseResult.headers.length > 10 && (
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      +{parseResult.headers.length - 10} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {parseResult.preview.map((row, i) => (
                  <tr key={i} className="border-b">
                    {parseResult.headers.slice(0, 10).map((h) => (
                      <td key={h} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
                        {row[h] || ""}
                      </td>
                    ))}
                    {parseResult.headers.length > 10 && (
                      <td className="px-2 py-1 text-muted-foreground">...</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => parseResult && onComplete(parseResult)}
          disabled={!parseResult || isLoading}
          className="bg-brand-solid text-white hover:bg-brand-solid-hover"
        >
          Next: Column Mapping
        </Button>
      </div>
    </div>
  );
}
