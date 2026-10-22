"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

interface CategoryUploadProps {
  clientIdCode: string;
  onSuccess?: () => void;
}

export function CategoryUpload({ clientIdCode, onSuccess }: CategoryUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientIdCode", clientIdCode);

      const res = await fetch("/api/category-definitions", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      const types = data.productTypes ?? [data.productType];
      toast.success(
        `Uploaded ${types.join(", ")}: ${data.summary.total} attributes parsed, ${data.matchCount} matched to Hub`
      );
      queryClient.invalidateQueries({ queryKey: ["category-definition"] });
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(`Upload failed: ${err.message}`);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".xlsm") && !file.name.endsWith(".xlsx")) {
        toast.error("Please upload an .xlsm or .xlsx file");
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so same file can be re-uploaded
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        dragOver
          ? "border-brand bg-brand/5"
          : "border-border hover:border-muted-foreground/30"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {uploadMutation.isPending ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">
            Parsing category report...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop a Category Listing Report (.xlsm) here, or{" "}
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => fileInputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsm,.xlsx"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}
    </div>
  );
}

/** Compact upload button for header re-upload */
export function CategoryUploadButton({
  clientIdCode,
  onSuccess,
}: CategoryUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientIdCode", clientIdCode);

      const res = await fetch("/api/category-definitions", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      const types = data.productTypes ?? [data.productType];
      toast.success(
        `Re-uploaded ${types.join(", ")}: ${data.summary.total} attributes, ${data.matchCount} matched`
      );
      queryClient.invalidateQueries({ queryKey: ["category-definition"] });
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(`Upload failed: ${err.message}`);
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={uploadMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <Upload className="h-3 w-3 mr-1" />
        )}
        Re-upload
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsm,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
