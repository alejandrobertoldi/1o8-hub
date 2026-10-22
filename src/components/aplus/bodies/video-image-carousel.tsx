/* eslint-disable react-doctor/no-react19-deprecated-apis */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useCallback, useEffect, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { X, ImageIcon, MonitorPlay, Plus, Minus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { AplusImageSlot } from "../aplus-image-slot";
import { ModuleTextField, CharCounter, RichTextToolbar } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER, ProductFallbackCtx, ModuleNamingCtx, SetConfigCtx } from "../module-card-types";

interface VideoImagePanel {
  id: string;
  headline: string;
  subheadline: string;
  body: string;
  videoDriveFileId: string;
  videoPreviewDriveFileId: string;
  videoTitle: string;
  videoDescription: string;
}

interface VideoImageCarouselBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
}

export function VideoImageCarouselBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
}: VideoImageCarouselBodyProps) {
  const queryClient = useQueryClient();
  const spec = APLUS_MODULE_SPECS["video_image_carousel"];
  const rg = spec.repeatableGroup!;
  const imageSpec = rg.image!;

  // Derive panels from DB images
  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);
  const panelCount = Math.max(panelImages.length, rg.minItems);

  // Load initial panel text from DB panelData
  const emptyPanel: Omit<VideoImagePanel, "id"> = { headline: "", subheadline: "", body: "", videoDriveFileId: "", videoPreviewDriveFileId: "", videoTitle: "", videoDescription: "" };

  const getInitialPanelData = useCallback(() => {
    const data: Record<number, Omit<VideoImagePanel, "id">> = {};
    for (let i = 0; i < panelCount; i++) {
      const img = panelImages[i];
      const pd = (img?.panelData ?? {}) as Record<string, string>;
      data[i] = {
        headline: pd.headline ?? "",
        subheadline: pd.subheadline ?? "",
        body: pd.body ?? "",
        videoDriveFileId: pd.videoDriveFileId ?? "",
        videoPreviewDriveFileId: pd.videoPreviewDriveFileId ?? "",
        videoTitle: pd.videoTitle ?? "",
        videoDescription: pd.videoDescription ?? "",
      };
    }
    return data;
  }, [panelImages, panelCount]);

  const [panelData, setPanelData] = useState<Record<number, Omit<VideoImagePanel, "id">>>(getInitialPanelData);
  const [activeIdx, setActiveIdx] = useState(0);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [mediaLayout, setMediaLayout] = useState<"right" | "left">("left");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Re-sync when images change
  useEffect(() => {
    setPanelData(getInitialPanelData());
  }, [getInitialPanelData]);

  const canAddPanel = panelCount < rg.maxItems;
  const canRemovePanel = panelCount > rg.minItems;

  const addPanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/modules/${module.id}/panels`, { method: "POST" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add panel"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const removePanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/modules/${module.id}/panels`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to remove panel"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      setActiveIdx(prev => Math.min(prev, panelCount - 2));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePanelField = (idx: number, field: keyof Omit<VideoImagePanel, "id">, value: string) => {
    setPanelData(prev => {
      const cur = prev[idx] ?? emptyPanel;
      return { ...prev, [idx]: { ...cur, [field]: value } };
    });
  };

  // Save panel text to DB (on blur)
  const savePanelText = useCallback(async (idx: number) => {
    const data = panelData[idx];
    if (!data) return;
    const img = panelImages[idx];
    if (!img) return;
    setSaveState("saving");
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: idx + 1,
          customLabel: `panel_${idx + 1}_${imageSpec.key}`,
          panelData: {
            headline: data.headline,
            subheadline: data.subheadline,
            body: data.body,
            videoDriveFileId: data.videoDriveFileId || undefined,
            videoPreviewDriveFileId: data.videoPreviewDriveFileId || undefined,
            videoTitle: data.videoTitle || undefined,
            videoDescription: data.videoDescription || undefined,
          },
        }),
      });
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      toast.error("Failed to save panel text");
    }
  }, [panelData, panelImages, productId, module.id, imageSpec.key, queryClient]);

  const active = panelData[activeIdx] ?? emptyPanel;
  const fields = rg.fields;
  const headField = fields.find(f => f.key === "headline")!;
  const subField = fields.find(f => f.key === "subheadline")!;
  const bodyField = fields.find(f => f.key === "body")!;

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

  const fieldBorder = (len: number, max: number): React.CSSProperties => ({
    ...inputStyle,
    border: `1px solid ${len > max ? EXCEEDED_BORDER : "#888c8c"}`,
  });

  const textColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Headline */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Headline
        </label>
        <input
          value={active.headline}
          onChange={(e) => updatePanelField(activeIdx, "headline", e.target.value)}
          onBlur={() => savePanelText(activeIdx)}
          placeholder="Enter headline text"
          disabled={readOnly}
          style={fieldBorder(active.headline.length, headField.maxLength ?? 50)}
        />
        <CharCounter length={active.headline.length} max={headField.maxLength ?? 50} />
      </div>

      {/* Subheadline (required) */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
          Subheadline
        </label>
        <input
          value={active.subheadline}
          onChange={(e) => updatePanelField(activeIdx, "subheadline", e.target.value)}
          onBlur={() => savePanelText(activeIdx)}
          placeholder="Enter subheadline text"
          disabled={readOnly}
          style={fieldBorder(active.subheadline.length, subField.maxLength ?? 80)}
        />
        <CharCounter length={active.subheadline.length} max={subField.maxLength ?? 80} />
      </div>

      {/* Body text (rich text) */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Body text
        </label>
        <RichTextToolbar />
        <textarea
          value={active.body}
          onChange={(e) => updatePanelField(activeIdx, "body", e.target.value)}
          onBlur={() => savePanelText(activeIdx)}
          placeholder="Enter body text"
          disabled={readOnly}
          rows={3}
          style={{ ...fieldBorder(active.body.length, bodyField.maxLength ?? 500), resize: "vertical" as const }}
        />
        <CharCounter length={active.body.length} max={bodyField.maxLength ?? 500} />
      </div>
    </div>
  );

  const activePanelImage = module.images.find(
    (img) => img.customLabel === `panel_${activeIdx + 1}_${imageSpec.key}`
  );
  const hasVideo = !!active.videoDriveFileId;

  const mediaColumn = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {/* Image upload */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Image
        </label>
        {activePanelImage ? (
          <AplusImageSlot
            image={activePanelImage}
            productId={productId}
            moduleId={module.id}
            readOnly={readOnly}
            slotSpec={{
              key: imageSpec.key,
              label: imageSpec.label,
              desktopSize: imageSpec.desktopSize,
              mobileSize: imageSpec.mobileSize,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              backgroundColor: "#f7f8fa",
              border: "2px dashed #7f9ba6",
              borderRadius: "2px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "60px 0",
            }}
          >
            <ImageIcon style={{ width: "28px", height: "28px", color: "#6b8f9e" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b8f9e" }}>
              {imageSpec.desktopSize.width}:{imageSpec.desktopSize.height}
            </span>
            <span style={{ fontSize: "13px", color: "#6b8f9e" }}>Create panel first</span>
          </div>
        )}
      </div>

      {/* Video slot */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Video
        </label>
        {hasVideo && active.videoPreviewDriveFileId ? (
          <button
            type="button"
            onClick={() => setVideoDialogOpen(true)}
            style={{
              width: "100%",
              backgroundColor: "#e8f5e9",
              border: "2px solid #047857",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              padding: "8px",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/drive/file/${active.videoPreviewDriveFileId}`}
              alt="Video preview"
              style={{ width: "100%", height: "auto", borderRadius: "2px", objectFit: "cover", maxHeight: "120px" }}
            />
            <span style={{ fontSize: "11px", color: "#047857", fontWeight: 600 }}>{active.videoTitle || "Video uploaded"}</span>
            <span style={{ fontSize: "10px", color: "#888c8c" }}>Click to replace</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setVideoDialogOpen(true)}
            style={{
              width: "100%",
              backgroundColor: "#f7f8fa",
              border: "2px dashed #008296",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "60px 0",
              cursor: "pointer",
            }}
          >
            <MonitorPlay style={{ width: "28px", height: "28px", color: "#008296" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#008296", letterSpacing: "0.5px" }}>
              ADD VIDEO
            </span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Module headline (full width) */}
      <div style={{ padding: "20px 20px 0" }}>
        <ModuleTextField
          spec={spec.textFields[0]}
          value={getFieldValue("headlineText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>

      {/* Panel thumbnails row */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111" }}>
            Panels ({rg.maxItems} max / {rg.minItems} min)
          </div>
          {!readOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button type="button" onClick={() => removePanelMutation.mutate()} disabled={!canRemovePanel || removePanelMutation.isPending}
                style={{ width: "24px", height: "24px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canRemovePanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canRemovePanel ? "pointer" : "default", opacity: canRemovePanel ? 1 : 0.4 }}
                title={`Remove panel (min ${rg.minItems})`}>
                <Minus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
              <button type="button" onClick={() => addPanelMutation.mutate()} disabled={!canAddPanel || addPanelMutation.isPending}
                style={{ width: "24px", height: "24px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canAddPanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canAddPanel ? "pointer" : "default", opacity: canAddPanel ? 1 : 0.4 }}
                title={`Add panel (max ${rg.maxItems})`}>
                <Plus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          {Array.from({ length: rg.maxItems }, (_, i) => {
            const img = panelImages[i];
            const pd = (img?.panelData ?? {}) as Record<string, string>;
            const isCreated = i < panelCount;
            const isActive = i === activeIdx;
            const thumbFileId = img?.driveFileId || pd.videoPreviewDriveFileId;
            const isVideo = !!pd.videoDriveFileId && !img?.driveFileId;
            return (
              <div key={img?.id ?? `slot-${i}`} style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", marginBottom: "4px" }}>
                  PANEL ({i + 1} / {rg.maxItems})
                </div>
                <button
                  type="button"
                  onClick={() => { if (isCreated) setActiveIdx(i); }}
                  style={{
                    width: "100%",
                    height: "80px",
                    backgroundColor: isActive ? "#eef6f8" : "#f7f8fa",
                    border: isActive
                      ? "2px solid #008296"
                      : isCreated ? "2px solid #d5d9d9" : "2px dashed #c6c6c6",
                    borderRadius: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isCreated ? "pointer" : "default",
                    overflow: "hidden",
                    padding: 0,
                    opacity: isCreated ? 1 : 0.5,
                    position: "relative",
                  }}
                >
                  {thumbFileId ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/drive/file/${thumbFileId}`}
                        alt={`Panel ${i + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {isVideo && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#ffffff"><polygon points="8,5 20,12 8,19" /></svg>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: "28px", color: isActive ? "#565959" : "#6b8f9e", fontWeight: 300 }}>+</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #e7e7e7" }} />

      {/* Active panel editor */}
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            PANEL ({activeIdx + 1} / {rg.maxItems})
          </div>
          {saveState === "saving" && <span style={{ fontSize: 11, color: "#888c8c" }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: 11, color: "#067D62" }}>Saved</span>}
          {saveState === "error" && <span style={{ fontSize: 11, color: "#d13212" }}>Error</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: mediaLayout === "left" ? "1.2fr 1fr" : "1fr 1.2fr", gap: "24px", alignItems: "start" }}>
          {mediaLayout === "left" ? (
            <>{mediaColumn}{textColumn}</>
          ) : (
            <>{textColumn}{mediaColumn}</>
          )}
        </div>
      </div>

      {/* Layout toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e7e7e7" }}>
        <button
          type="button"
          onClick={() => setMediaLayout("right")}
          style={{
            width: "48px",
            height: "32px",
            border: mediaLayout === "right" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            padding: "4px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px", width: "80%" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
          <div style={{ width: "14px", height: "18px", backgroundColor: "#3d4f5f", borderRadius: "2px", flexShrink: 0 }} />
        </button>

        <button
          type="button"
          onClick={() => setMediaLayout("left")}
          style={{
            width: "48px",
            height: "32px",
            border: mediaLayout === "left" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            padding: "4px",
          }}
        >
          <div style={{ width: "14px", height: "18px", backgroundColor: "#3d4f5f", borderRadius: "2px", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px", width: "80%", marginLeft: "auto" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
        </button>
      </div>

      {/* Add Video dialog (per-panel) */}
      <PanelVideoDialog
        open={videoDialogOpen}
        onClose={() => setVideoDialogOpen(false)}
        readOnly={readOnly}
        productId={productId}
        moduleId={module.id}
        panelIndex={activeIdx}
        imageSlot={panelImages[activeIdx]?.imageSlot ?? activeIdx + 1}
        imageSpecKey={imageSpec.key}
        currentPanelData={panelData[activeIdx] ?? emptyPanel}
        onVideoSaved={(videoInfo) => {
          setPanelData(prev => ({
            ...prev,
            [activeIdx]: {
              ...(prev[activeIdx] ?? emptyPanel),
              videoDriveFileId: videoInfo.videoDriveFileId,
              videoPreviewDriveFileId: videoInfo.videoPreviewDriveFileId,
              videoTitle: videoInfo.videoTitle,
              videoDescription: videoInfo.videoDescription,
            },
          }));
        }}
      />
    </div>
  );
}

// ─── Panel Video Dialog (per-panel video for Video Image Carousel) ──

interface PanelVideoDialogProps {
  open: boolean;
  onClose: () => void;
  readOnly: boolean;
  productId: string;
  moduleId: string;
  panelIndex: number;
  imageSlot: number;
  imageSpecKey: string;
  currentPanelData: Omit<VideoImagePanel, "id">;
  onVideoSaved: (info: { videoDriveFileId: string; videoPreviewDriveFileId: string; videoTitle: string; videoDescription: string }) => void;
}

export function PanelVideoDialog({
  open,
  onClose,
  readOnly,
  productId,
  moduleId,
  panelIndex,
  imageSlot,
  imageSpecKey,
  currentPanelData,
  onVideoSaved,
}: PanelVideoDialogProps) {
  const [videoTitle, setVideoTitle] = useState(currentPanelData.videoTitle || "");
  const [videoDescription, setVideoDescription] = useState(currentPanelData.videoDescription || "");
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
    const commonMeta = {
      clientIdCode: clientIdCode ?? "",
      asin: asin ?? "",
      folderType: "aplus",
      entityType: "aplus_video",
      entityId: moduleId,
      imageSlot: String(panelIndex),
      moduleType: moduleNamingCtx.moduleType ?? undefined,
      modulePosition: moduleNamingCtx.modulePosition ?? undefined,
      slotKey,
      device,
      marketplace: moduleNamingCtx.marketplace ?? undefined,
      platform: setConfigCtx.platform ?? undefined,
      scopeType: setConfigCtx.scopeType ?? undefined,
      scopeIdentifier: setConfigCtx.scopeIdentifier ?? undefined,
      version: setConfigCtx.version ?? undefined,
      isVideo: file.type.startsWith("video/") || undefined,
    };

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
    if (!videoFile && !currentPanelData.videoDriveFileId) {
      toast.error("Please select a video file");
      return;
    }
    if (!videoTitle.trim()) {
      toast.error("Please enter a video title");
      return;
    }

    setUploading(true);
    try {
      let videoDriveFileId = currentPanelData.videoDriveFileId;
      let videoPreviewDriveFileId = currentPanelData.videoPreviewDriveFileId;

      // Upload video file if new one selected
      if (videoFile) {
        setUploadProgress("Uploading video…");
        videoDriveFileId = await uploadFileToDrive(videoFile, "VIDEO", "DV");
      }

      // Upload preview image if provided
      if (previewFile) {
        setUploadProgress("Uploading preview image…");
        videoPreviewDriveFileId = await uploadFileToDrive(previewFile, "PREV", "DV");
      }

      // Save to panelData via images API
      setUploadProgress("Saving…");
      const updatedPanelData = {
        headline: currentPanelData.headline,
        subheadline: currentPanelData.subheadline,
        body: currentPanelData.body,
        videoDriveFileId,
        videoPreviewDriveFileId,
        videoTitle: videoTitle.trim(),
        videoDescription: videoDescription.trim() || undefined,
      };

      await fetch(`/api/aplus/${productId}/modules/${moduleId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: imageSlot,
          customLabel: `panel_${panelIndex + 1}_${imageSpecKey}`,
          panelData: updatedPanelData,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      onVideoSaved({
        videoDriveFileId,
        videoPreviewDriveFileId,
        videoTitle: videoTitle.trim(),
        videoDescription: videoDescription.trim(),
      });
      toast.success("Video saved successfully");
      onClose();
    } catch (err) {
      console.error("[panel video upload]", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
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
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={uploading ? undefined : onClose} />
      <div style={{ position: "relative", backgroundColor: "#ffffff", color: "#0F1111", borderRadius: "8px", boxShadow: "0 4px 24px rgba(0,0,0,0.2)", width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", padding: "24px", zIndex: 101 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid #e7e7e7" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111", margin: 0 }}>Add Video — Panel {panelIndex + 1}</h2>
          <button type="button" onClick={onClose} disabled={uploading} style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}>
            <X style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        {/* Select video */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Select video [800:600 min resolution]. For the best customer experience, please use the highest resolution possible.
          </label>
          <input ref={videoInputRef} type="file" accept="video/mp4" style={{ display: "none" }} onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="button" style={browseButtonStyle} disabled={readOnly || uploading} onClick={() => videoInputRef.current?.click()}>Browse…</button>
            <span style={{ fontSize: "13px", fontStyle: "italic", color: videoFile ? "#047857" : "#565959" }}>
              {videoFile ? videoFile.name : currentPanelData.videoDriveFileId ? "Current video will be kept" : "Formats accepted: video/mp4"}
            </span>
          </div>
        </div>

        {/* Select preview image */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Select image for video preview [800:600 min resolution]
          </label>
          <input ref={previewInputRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setPreviewFile(f); setPreviewSizeError(f ? f.size > 3 * 1024 * 1024 : false); }} />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {previewFile ? (
              <>
                <button type="button" style={{ ...browseButtonStyle, color: "#d13212", borderColor: "#d13212" }} disabled={readOnly || uploading} onClick={() => { setPreviewFile(null); setPreviewSizeError(false); if (previewInputRef.current) previewInputRef.current.value = ""; }}>Remove</button>
                <span style={{ fontSize: "13px", fontStyle: "italic", color: previewSizeError ? "#d13212" : "#047857" }}>{previewFile.name}</span>
              </>
            ) : (
              <>
                <button type="button" style={browseButtonStyle} disabled={readOnly || uploading} onClick={() => previewInputRef.current?.click()}>Browse…</button>
                <span style={{ fontSize: "13px", fontStyle: "italic", color: "#565959" }}>
                  {currentPanelData.videoPreviewDriveFileId ? "Current preview will be kept" : "Formats accepted: image/png, image/jpg, image/jpeg"}
                </span>
              </>
            )}
          </div>
          {previewSizeError && <span style={{ fontSize: "13px", color: "#d13212", marginTop: "4px", display: "block" }}>File exceeds 3MB limit</span>}
        </div>

        {/* Video title */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Video title
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value.slice(0, 50))} disabled={readOnly || uploading} placeholder="Enter video title" maxLength={50} style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={handleGenerateVideoTitle} disabled={readOnly || uploading || isGeneratingTitle}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "13px", fontWeight: 600, color: "#ffffff", background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)", border: "none", borderRadius: "8px", cursor: isGeneratingTitle ? "wait" : "pointer", whiteSpace: "nowrap", opacity: readOnly || uploading ? 0.4 : 1, flexShrink: 0 }}>
              {isGeneratingTitle ? <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} /> : (
                <Sparkles style={{ width: "14px", height: "14px" }} strokeWidth={1.75} />
              )}
              {isGeneratingTitle ? "…" : "Suggest"}
            </button>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px", color: videoTitle.length >= 50 ? "#d13212" : "#888c8c", marginTop: "4px" }}>{50 - videoTitle.length}</div>
        </div>

        {/* Video description */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Video description
          </label>
          <textarea value={videoDescription} onChange={(e) => setVideoDescription(e.target.value.slice(0, 200))} disabled={readOnly || uploading} rows={3} maxLength={200} placeholder="Enter video description" style={{ ...inputStyle, resize: "none" }} />
          <div style={{ textAlign: "right", fontSize: "12px", color: videoDescription.length >= 200 ? "#d13212" : "#888c8c", marginTop: "4px" }}>{200 - videoDescription.length}</div>
        </div>

        <p style={{ fontSize: "13px", fontStyle: "italic", color: "#565959", marginBottom: "24px" }}>
          Note: It may take up to 48 hours for our service to review new video assets. You will be notified once your video has been reviewed and whether it has been approved or rejected.
        </p>

        {uploading && (
          <div style={{ padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "4px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite", color: "#008296" }} />
            <span style={{ fontSize: "13px", color: "#0F1111" }}>{uploadProgress}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "12px", borderTop: "1px solid #e7e7e7" }}>
          <button type="button" onClick={onClose} disabled={uploading} style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 500, color: "#0F1111", backgroundColor: "#ffffff", border: "1px solid #888c8c", borderRadius: "4px", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={handleAdd} disabled={uploading || readOnly} style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 600, color: "#ffffff", backgroundColor: "#008296", border: "1px solid #008296", borderRadius: "4px", cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Uploading…" : "Add"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
