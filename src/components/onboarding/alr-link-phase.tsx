/* eslint-disable react-doctor/query-mutation-missing-invalidation */
"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  clientIdCode: string;
  onConfirmed: () => void;
};

interface AlrLinkRow {
  sku: string;
  asin: string;
  status: string;
}

interface PreviewResponse {
  totalRows: number;
  statusCounts: { active: number; inactive: number; incomplete: number; other: number };
  joinReport: { matched: number; alrOnly: number; clrOnly: number };
  parsedRows: AlrLinkRow[];
}

interface StagingStateResponse {
  hasClr: boolean;
  hasAlr: boolean;
  clr: { count: number; productTypes: number; missingRequired: number };
  alr: {
    count: number;
    byStatus: { Active: number; Inactive: number; Incomplete: number; Other: number };
  };
}

export function AlrLinkPhase({ clientIdCode, onConfirmed }: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shares the staging-state cache with `ClrAttributeImport` and the parent
  // `AlrLinkAndMerge` (same query key) so the inline "already staged" banner
  // mirrors CLR's UX: users get persistent in-card confirmation after upload.
  const stagingState = useQuery<StagingStateResponse>({
    queryKey: ["staging-state", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/onboarding/staging-state?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) throw new Error("Failed to load staging state");
      return (await res.json()) as StagingStateResponse;
    },
  });
  const alreadyStaged = stagingState.data?.alr.count ?? 0;
  const byStatus = stagingState.data?.alr.byStatus;

  const previewMutation = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("clientIdCode", clientIdCode);
      const res = await fetch("/api/onboarding/alr-link?phase=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preview failed (${res.status})`);
      }
      return (await res.json()) as PreviewResponse;
    },
    onSuccess: setPreview,
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  const executeMutation = useMutation<{ staged: number }, Error, void>({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview loaded");
      const res = await fetch("/api/onboarding/alr-link?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          parsedRows: preview.parsedRows,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Execute failed (${res.status})`);
      }
      return (await res.json()) as { staged: number };
    },
    onSuccess: (data) => {
      toast.success(`Staged ${data.staged} SKU↔ASIN links.`);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onConfirmed();
    },
    onError: (err) => toast.error(`Execute failed: ${err.message}`),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(txt|tsv)$/i)) {
        toast.error("Please upload a .txt or .tsv ALR file");
        return;
      }
      setPreview(null);
      previewMutation.mutate(file);
    },
    [previewMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-3">
      {alreadyStaged > 0 && !preview && byStatus && (
        <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md p-3">
          <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <span>
            ALR already staged for this client:{" "}
            <strong>{alreadyStaged}</strong> SKU↔ASIN links (Active{" "}
            {byStatus.Active}, Inactive {byStatus.Inactive}, Incomplete{" "}
            {byStatus.Incomplete}). Drop a new file below to replace.
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-neutral-300 rounded-md p-6 text-center"
      >
        <Upload className="mx-auto mb-2 size-6 text-neutral-500" />
        <p className="text-sm text-neutral-700">
          Drop the All Listings Report (.txt) here, or{" "}
          <button
            type="button"
            className="underline text-blue-600"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.tsv,text/plain,text/tab-separated-values"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {previewMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="size-4 animate-spin" />
          Parsing ALR…
        </div>
      )}

      {preview && (
        <div className="border border-neutral-200 rounded-md p-4 space-y-3">
          <div className="text-sm space-y-1">
            <div>
              <strong>{preview.totalRows}</strong> ALR rows.{" "}
              <span className="text-neutral-600">
                Active: {preview.statusCounts.active} / Inactive:{" "}
                {preview.statusCounts.inactive} / Incomplete:{" "}
                {preview.statusCounts.incomplete} / Other:{" "}
                {preview.statusCounts.other}
              </span>
            </div>
            <div className="text-neutral-700">
              Join against staged CLR:{" "}
              <strong>{preview.joinReport.matched} matched</strong>,{" "}
              {preview.joinReport.clrOnly} CLR-only (skipped),{" "}
              {preview.joinReport.alrOnly} ALR-only (skipped).
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={executeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || preview.totalRows === 0}
            >
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Stage links
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
