"use client";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Aplus2VideoSpec } from "@/lib/aplus2/module-specs";
import { Aplus2TextField } from "./aplus2-text-field";

type AssetDto = { id: string; kind: string; slotKey: string; driveFileId: string; filename: string; moduleId: string | null };

export function Aplus2VideoSlot({
  spec, versionId, moduleId, asset,
  videoTitle, videoDescription, onMetaChange,
}: {
  spec: Aplus2VideoSpec;
  versionId: string;
  moduleId: string;
  asset: AssetDto | null;
  videoTitle: string;
  videoDescription: string;
  onMetaChange: (field: "videoTitle" | "videoDescription", value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      // Step 1: initiate a Drive resumable session so the file goes to the
      // same Drive folder as image assets for this version.
      // (The simple POST /assets route buffers through Next.js and times out
      // for large MP4 files; the session route creates a direct-to-Drive URI.)
      const sessionRes = await fetch(`/api/aplus2/versions/${versionId}/video-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, mimeType: file.type, size: file.size }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error ?? "Failed to start upload session");
      const { uploadUri, filename, folderRowId } = sessionData as {
        uploadUri: string; filename: string; folderRowId: string;
      };

      // Step 2: PUT the file bytes directly to Drive via the resumable URI.
      // (Direct browser→Drive avoids the Next.js 10MB body limit. The session
      // URI already encodes the correct parent folder for this version.)
      const putRes = await fetch(uploadUri, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`Drive upload failed (${putRes.status}): ${text.slice(0, 200)}`);
      }
      const putData = await putRes.json() as { id?: string };
      if (!putData.id) throw new Error("Drive did not return a file ID");

      // Step 3: record the drive_files + aplus2_assets rows.
      const finalRes = await fetch(`/api/aplus2/versions/${versionId}/video-finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFileId: putData.id,
          moduleId,
          filename,
          folderRowId,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          replaceAssetId: asset?.id ?? null,
        }),
      });
      const finalData = await finalRes.json();
      if (!finalRes.ok) throw new Error(finalData.error ?? "Upload failed");
      return finalData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      const r = await fetch(`/api/aplus2/assets/${asset.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Video</div>
      <div className="flex items-center gap-3 rounded-md border border-stone-200 dark:border-zinc-800 p-3">
        <Film className="size-6 text-muted-foreground" />
        {asset ? (
          <span className="text-xs font-mono truncate">{asset.filename}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No video uploaded</span>
        )}
        <input ref={inputRef} type="file" className="hidden" accept="video/mp4" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => inputRef.current?.click()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Upload className="size-3 mr-1" />}
          {asset ? "Replace" : "Upload"}
        </Button>
        {asset && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
            {deleteMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Trash2 className="size-3 mr-1" />}
            Remove
          </Button>
        )}
      </div>
      <Aplus2TextField
        label="Video title"
        initialValue={videoTitle}
        onCommit={(value) => onMetaChange("videoTitle", value)}
        maxLength={spec.titleMaxLen}
      />
      <Aplus2TextField
        label="Video description"
        initialValue={videoDescription}
        onCommit={(value) => onMetaChange("videoDescription", value)}
        maxLength={spec.descriptionMaxLen}
        multiline
        rows={3}
      />
    </div>
  );
}
