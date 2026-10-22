/* eslint-disable react-doctor/no-react19-deprecated-apis */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X, MonitorPlay, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AplusModuleImage } from "./module-card-types";
import { ProductFallbackCtx, ModuleNamingCtx, SetConfigCtx } from "./module-card-types";
import type { ImageSlotSpec } from "@/lib/aplus-module-specs";

// ─── Add Video dialog ────────────────────────────────────────────

interface AddVideoDialogProps {
  open: boolean;
  onClose: () => void;
  readOnly: boolean;
  productId: string;
  moduleId: string;
  videoThumbnailImageId?: string | null;
}

export function AddVideoDialog({ open, onClose, readOnly, productId, moduleId, videoThumbnailImageId }: AddVideoDialogProps) {
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewSizeError, setPreviewSizeError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const productFallback = useContext(ProductFallbackCtx);
  const moduleNamingCtx = useContext(ModuleNamingCtx);
  const setConfigCtx = useContext(SetConfigCtx);

  if (!open) return null;

  const clientIdCode = productFallback.clientIdCode;
  const asin = productFallback.asin;

  async function handleGenerateVideoTitle() {
    setIsGeneratingTitle(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/aplus/ai/video-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            productId,
            productName: productFallback.productName || "Unknown product",
            videoDescription: videoDescription.trim() || undefined,
          }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Video title generation timed out. Please try again."
          : "Network error. Check your connection and try again.");
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error("Failed to generate");
      const data = await res.json();
      if (data.title) {
        setVideoTitle(data.title);
        toast.success("Video title suggested");
      }
    } catch {
      toast.error("Failed to generate video title");
    } finally {
      setIsGeneratingTitle(false);
    }
  }

  async function uploadFileToDrive(file: File, slotKey: string, device: string): Promise<string> {
    const isVideoFile = file.type.startsWith("video/");
    const FOUR_MB = 4 * 1024 * 1024;

    const commonMeta = {
      clientIdCode: setConfigCtx.clientIdCode || clientIdCode || "",
      asin: asin ?? "",
      folderType: "aplus",
      entityType: "aplus_video",
      entityId: moduleId,
      imageSlot: "0",
      moduleType: moduleNamingCtx.moduleType ?? undefined,
      modulePosition: moduleNamingCtx.modulePosition ?? undefined,
      slotKey,
      device,
      marketplace: moduleNamingCtx.marketplace ?? undefined,
      platform: setConfigCtx.platform ?? undefined,
      scopeType: setConfigCtx.scopeType ?? undefined,
      scopeIdentifier: setConfigCtx.scopeIdentifier ?? undefined,
      version: setConfigCtx.version ?? undefined,
      clientIdCodeOverride: setConfigCtx.clientIdCode ?? undefined,
      groupNumber: setConfigCtx.groupNumber ?? undefined,
      isVideo: isVideoFile || undefined,
    };

    // Step 1: Initiate resumable session (gets Drive session URI)
    const sessionRes = await fetch("/api/drive/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...commonMeta, mimeType: file.type, fileName: file.name }),
    });
    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({}));
      throw new Error(err.error || "Failed to initiate upload session");
    }
    const meta = await sessionRes.json();

    // Step 2: Send raw binary to server proxy with metadata in headers (avoids CORS)
    const proxyRes = await fetch("/api/drive/upload-resumable", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "x-session-uri": meta.sessionUri,
        "x-mime-type": file.type,
        "x-folder-id": meta.folderId ?? "",
        "x-display-name": meta.displayName ?? "",
        "x-original-name": meta.originalName ?? file.name,
        "x-entity-type": meta.entityType ?? "",
        "x-entity-id": meta.entityId ?? "",
      },
      body: file,
    });
    if (!proxyRes.ok) {
      const err = await proxyRes.json().catch(() => ({}));
      throw new Error(err.error || "Upload failed");
    }
    const proxyData = await proxyRes.json();
    return proxyData.driveFileId;
  }

  async function handleAdd() {
    if (!videoFile) {
      toast.error("Please select a video file");
      return;
    }
    if (!videoTitle.trim()) {
      toast.error("Please enter a video title");
      return;
    }
    if (videoTitle.trim().length > 50) {
      toast.error("Video title must be 50 characters or less");
      return;
    }
    if (!videoDescription.trim()) {
      toast.error("Please enter a video description");
      return;
    }
    if (videoDescription.trim().length > 200) {
      toast.error("Video description must be 200 characters or less");
      return;
    }
    if (previewSizeError) {
      toast.error("Preview image exceeds 3MB limit");
      return;
    }

    setUploading(true);
    try {
      // 1. Upload video file
      setUploadProgress("Uploading video…");
      const videoDriveFileId = await uploadFileToDrive(videoFile, "VIDEO", "DV");

      // 2. Upload preview image if provided and link to video_thumbnail slot
      if (previewFile) {
        setUploadProgress("Uploading preview image…");
        const previewDriveFileId = await uploadFileToDrive(previewFile, "PREV", "DV");
        if (videoThumbnailImageId) {
          await fetch(`/api/aplus/${productId}/modules/${moduleId}/images/${videoThumbnailImageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driveFileId: previewDriveFileId }),
          });
        } else {
          // Create new image record for video_thumbnail slot (slot 0)
          await fetch(`/api/aplus/${productId}/modules/${moduleId}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageSlot: 0, customLabel: "video_thumbnail", driveFileId: previewDriveFileId }),
          });
        }
      }

      // 3. Save video metadata to module
      setUploadProgress("Saving…");
      const patchRes = await fetch(`/api/aplus/${productId}/modules/${moduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoDriveFileId,
          videoTitle: videoTitle.trim(),
          videoDescription: videoDescription.trim() || null,
        }),
      });

      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save video metadata");
      }

      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success("Video uploaded successfully");
      setVideoFile(null);
      setPreviewFile(null);
      setVideoTitle("");
      setVideoDescription("");
      onClose();
    } catch (err) {
      console.error("[video upload] Full error:", err);
      console.error("[video upload] Context:", { productId, moduleId, clientIdCode, asin, moduleType: moduleNamingCtx.moduleType, modulePosition: moduleNamingCtx.modulePosition });
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "14px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  const browseButtonStyle: React.CSSProperties = {
    padding: "4px 16px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#0F1111",
    backgroundColor: "#ffffff",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    cursor: "pointer",
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={uploading ? undefined : onClose}
      />

      {/* Dialog panel */}
      <div
        style={{
          position: "relative",
          backgroundColor: "#ffffff",
          color: "#0F1111",
          borderRadius: "8px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: "700px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          zIndex: 101,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid #e7e7e7" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111", margin: 0 }}>Add Video</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}
          >
            <X style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        {/* Select video */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Select video [960:540 min resolution]. For the best customer experience, please use the highest resolution possible.
          </label>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4"
            style={{ display: "none" }}
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="button" style={browseButtonStyle} disabled={readOnly || uploading} onClick={() => videoInputRef.current?.click()}>
              Browse…
            </button>
            <span style={{ fontSize: "13px", fontStyle: "italic", color: videoFile ? "#047857" : "#565959" }}>
              {videoFile ? videoFile.name : "Formats accepted: mp4"}
            </span>
          </div>
        </div>

        {/* Select preview image */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Select image for video preview [1464:600 min resolution]
          </label>
          <input
            ref={previewInputRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPreviewFile(f);
              setPreviewSizeError(f ? f.size > 3 * 1024 * 1024 : false);
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {previewFile ? (
              <>
                <button
                  type="button"
                  style={{ ...browseButtonStyle, color: "#d13212", borderColor: "#d13212" }}
                  disabled={readOnly || uploading}
                  onClick={() => { setPreviewFile(null); setPreviewSizeError(false); if (previewInputRef.current) previewInputRef.current.value = ""; }}
                >
                  Remove
                </button>
                <span style={{ fontSize: "13px", fontStyle: "italic", color: previewSizeError ? "#d13212" : "#047857" }}>
                  {previewFile.name}
                </span>
              </>
            ) : (
              <>
                <button type="button" style={browseButtonStyle} disabled={readOnly || uploading} onClick={() => previewInputRef.current?.click()}>
                  Browse…
                </button>
                <span style={{ fontSize: "13px", fontStyle: "italic", color: "#565959" }}>
                  Formats accepted: png, jpg, jpeg
                </span>
              </>
            )}
          </div>
          {previewSizeError && (
            <span style={{ fontSize: "13px", color: "#d13212", marginTop: "4px", display: "block" }}>
              File exceeds 3MB limit
            </span>
          )}
        </div>

        {/* Video title */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Video title
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value.slice(0, 50))}
              disabled={readOnly || uploading}
              placeholder="Enter video title"
              maxLength={50}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={handleGenerateVideoTitle}
              disabled={readOnly || uploading || isGeneratingTitle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)",
                border: "none",
                borderRadius: "8px",
                cursor: isGeneratingTitle ? "wait" : "pointer",
                whiteSpace: "nowrap",
                opacity: readOnly || uploading ? 0.4 : 1,
                flexShrink: 0,
              }}
            >
              {isGeneratingTitle ? (
                <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
              ) : (
                <Sparkles style={{ width: "14px", height: "14px" }} strokeWidth={1.75} />
              )}
              {isGeneratingTitle ? "…" : "Suggest"}
            </button>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px", color: videoTitle.length >= 50 ? "#d13212" : "#888c8c", marginTop: "4px" }}>
            {50 - videoTitle.length}
          </div>
        </div>

        {/* Video description */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Video description
          </label>
          <textarea
            value={videoDescription}
            onChange={(e) => setVideoDescription(e.target.value.slice(0, 200))}
            disabled={readOnly || uploading}
            rows={3}
            maxLength={200}
            placeholder="Enter video description"
            style={{ ...inputStyle, resize: "none" }}
          />
          <div style={{ textAlign: "right", fontSize: "12px", color: videoDescription.length >= 200 ? "#d13212" : "#888c8c", marginTop: "4px" }}>
            {200 - videoDescription.length}
          </div>
        </div>

        {/* 48hr review note */}
        <p style={{ fontSize: "13px", fontStyle: "italic", color: "#565959", marginBottom: "24px" }}>
          Note: It may take up to 48 hours for our service to review new video assets. You will be notified once your video has been reviewed and whether it has been approved or rejected.
        </p>

        {/* Upload progress */}
        {uploading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", padding: "10px", backgroundColor: "#f0f2f4", borderRadius: "4px" }}>
            <Loader2 style={{ width: "16px", height: "16px", color: "#008296", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "13px", color: "#565959" }}>{uploadProgress}</span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "12px", borderTop: "1px solid #e7e7e7" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{
              padding: "8px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#0F1111",
              backgroundColor: "#ffffff",
              border: "1px solid #888c8c",
              borderRadius: "4px",
              cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={uploading || readOnly || !videoFile || !videoTitle.trim()}
            style={{
              padding: "8px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#ffffff",
              backgroundColor: uploading || !videoFile || !videoTitle.trim() ? "#b0c4cc" : "#008296",
              border: `1px solid ${uploading || !videoFile || !videoTitle.trim() ? "#b0c4cc" : "#008296"}`,
              borderRadius: "4px",
              cursor: uploading || !videoFile || !videoTitle.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {uploading && <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />}
            {uploading ? "Uploading…" : "Add"}
          </button>
        </div>
      </div>
    </div>
    , document.body);
}

// ─── Video placeholder (Amazon SC style) ─────────────────────────

interface VideoPlaceholderProps {
  slotSpec: ImageSlotSpec;
  image: AplusModuleImage | undefined;
  productId: string;
  moduleId: string;
  readOnly: boolean;
  videoDriveFileId?: string | null;
  videoTitle?: string | null;
}

export function VideoPlaceholder({ slotSpec, image, productId, moduleId, readOnly, videoDriveFileId, videoTitle }: VideoPlaceholderProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasVideo = !!videoDriveFileId;

  return (
    <div>
      <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
        {slotSpec.label}
      </label>

      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        style={{
          width: "100%",
          backgroundColor: hasVideo ? "#e8f5e9" : "#f7f8fa",
          border: hasVideo ? "2px solid #047857" : "2px dashed #008296",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: hasVideo ? "40px 0" : "120px 0",
          cursor: "pointer",
        }}
      >
        <MonitorPlay style={{ width: "36px", height: "36px", color: hasVideo ? "#047857" : "#008296" }} />
        {hasVideo ? (
          <>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#047857" }}>
              Video uploaded
            </span>
            {videoTitle && (
              <span style={{ fontSize: "13px", color: "#565959" }}>
                {videoTitle}
              </span>
            )}
            <span style={{ fontSize: "12px", color: "#888c8c", marginTop: "4px" }}>
              Click to replace
            </span>
          </>
        ) : (
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#008296", letterSpacing: "0.5px" }}>
            ADD VIDEO
          </span>
        )}
      </button>

      <AddVideoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        readOnly={readOnly}
        productId={productId}
        moduleId={moduleId}
        videoThumbnailImageId={image?.id}
      />
    </div>
  );
}
