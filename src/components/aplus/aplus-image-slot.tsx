/* eslint-disable react-doctor/no-react19-deprecated-apis */
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable react-doctor/no-render-in-render */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Check, X, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ImageSlotSpec, AplusModuleType } from "@/lib/aplus-module-specs";
import { ProductFallbackCtx, ModuleNamingCtx, SetConfigCtx } from "./module-card-types";
import type { AplusModuleImage, FieldSaveState } from "./module-card-types";
import { getFixedSlotKey, getRepeatableSlotKey, generateImageFilename, type AplusScopeType } from "@/lib/aplus-file-naming";
type UploadState = "idle" | "uploading" | "success" | "error";

interface AplusImageSlotProps {
  image: AplusModuleImage;
  productId: string;
  moduleId: string;
  readOnly: boolean;
  slotSpec: ImageSlotSpec;
  fallbackClientIdCode?: string | null;
  fallbackAsin?: string | null;
  /** Module type for SOP file naming */
  moduleType?: AplusModuleType;
  /** Module position (1-based) for SOP file naming */
  modulePosition?: number;
  /** Product marketplace for SOP folder resolution */
  marketplace?: string | null;
  /** Panel number (1-based) — for repeatable group images (carousel, hotspot, etc.) */
  panelNumber?: number;
}

async function patchImage(
  productId: string,
  moduleId: string,
  imageId: string,
  data: Partial<{ altText: string; imageDescription: string; aiImagePrompt: string; driveFileId: string; mobileDriveFileId: string }>
) {
  const res = await fetch(
    `/api/aplus/${productId}/modules/${moduleId}/images/${imageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save");
  }
  return res.json();
}

function SaveIndicator({ state }: { state: FieldSaveState }) {
  if (state === "saving")
    return <Loader2 style={{ width: "12px", height: "12px", color: "#888c8c", animation: "spin 1s linear infinite", flexShrink: 0 }} />;
  if (state === "saved")
    return <Check style={{ width: "12px", height: "12px", color: "#047857", flexShrink: 0 }} />;
  if (state === "error")
    return <X style={{ width: "12px", height: "12px", color: "#d13212", flexShrink: 0 }} />;
  return null;
}

export function AplusImageSlot({
  image,
  productId,
  moduleId,
  readOnly,
  slotSpec,
  fallbackClientIdCode,
  fallbackAsin,
  moduleType,
  modulePosition,
  marketplace,
  panelNumber,
}: AplusImageSlotProps) {
  const productFallback = useContext(ProductFallbackCtx);
  const moduleNamingCtx = useContext(ModuleNamingCtx);
  const clientIdCode = image.clientIdCode || fallbackClientIdCode || productFallback.clientIdCode;
  const asin = image.asin || fallbackAsin || productFallback.asin;

  const setConfigCtx = useContext(SetConfigCtx);

  // SOP naming: prefer props, fall back to context
  const resolvedModuleType = moduleType ?? moduleNamingCtx.moduleType;
  const resolvedModulePosition = modulePosition ?? moduleNamingCtx.modulePosition;
  const resolvedMarketplace = marketplace ?? moduleNamingCtx.marketplace;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [altText, setAltText] = useState(image.altText ?? "");
  const [aiImagePrompt, setAiImagePrompt] = useState(image.aiImagePrompt ?? "");
  const [imageDescription, setImageDescription] = useState(image.imageDescription ?? "");

  const [altSaveState, setAltSaveState] = useState<FieldSaveState>("idle");
  const [promptSaveState, setPromptSaveState] = useState<FieldSaveState>("idle");
  const [descSaveState, setDescSaveState] = useState<FieldSaveState>("idle");

  // AI alt text generation
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false);

  // Upload state — desktop
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(
    (image as Record<string, unknown>).driveFileId as string | null ?? null
  );

  // Upload state — mobile
  const [mobileUploadState, setMobileUploadState] = useState<UploadState>("idle");
  const [mobileDriveFileId, setMobileDriveFileId] = useState<string | null>(
    (image as Record<string, unknown>).mobileDriveFileId as string | null ?? null
  );

  // Sync local state when image prop changes (e.g. after query invalidation)
  useEffect(() => {
    setAltText(image.altText ?? "");
    setAiImagePrompt(image.aiImagePrompt ?? "");
    setImageDescription(image.imageDescription ?? "");
    setDriveFileId((image as Record<string, unknown>).driveFileId as string | null ?? null);
    setMobileDriveFileId((image as Record<string, unknown>).mobileDriveFileId as string | null ?? null);
  }, [image.id, image.altText, image.aiImagePrompt, image.imageDescription, (image as Record<string, unknown>).driveFileId, (image as Record<string, unknown>).mobileDriveFileId]);

  // Replace-in-place confirmation state
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [pendingReplaceDevice, setPendingReplaceDevice] = useState<"DV" | "MV" | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (data: Partial<{ altText: string; imageDescription: string; aiImagePrompt: string; driveFileId: string; mobileDriveFileId: string }>) =>
      patchImage(productId, moduleId, image.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    },
  });

  const makeBlurHandler = (
    field: "altText" | "aiImagePrompt" | "imageDescription",
    currentValue: string,
    savedValue: string | null,
    setSaveState: (s: FieldSaveState) => void
  ) => async () => {
    const trimmed = currentValue.trim() || null;
    if (trimmed === (savedValue?.trim() || null)) return;
    setSaveState("saving");
    try {
      await mutation.mutateAsync({ [field]: trimmed ?? "" });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
      toast.error("Failed to save field");
    }
  };

  async function handleGenerateAltText() {
    setIsGeneratingAlt(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/aplus/ai/alt-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            productId,
            productName: productFallback.productName || "Unknown product",
            moduleType: resolvedModuleType,
            slotLabel: slotSpec.label,
            imageDescription: imageDescription.trim() || undefined,
            aiImagePrompt: aiImagePrompt.trim() || undefined,
            driveFileId: driveFileId || undefined,
          }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Alt text generation timed out. Please try again."
          : "Network error. Check your connection and try again.");
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error("Failed to generate");
      const data = await res.json();
      if (data.altText) {
        setAltText(data.altText);
        // Auto-save
        setAltSaveState("saving");
        await mutation.mutateAsync({ altText: data.altText });
        setAltSaveState("saved");
        setTimeout(() => setAltSaveState("idle"), 1500);
        toast.success("Alt text generated");
      }
    } catch {
      toast.error("Failed to generate alt text");
    } finally {
      setIsGeneratingAlt(false);
    }
  }

  // Resolve the SOP file slot key from spec key + module type
  // Panel images (panelNumber set) → PAN{n}, fixed images → MAIN/BG/IMG/etc.
  const fileSlotKey = panelNumber
    ? getRepeatableSlotKey(slotSpec.key, panelNumber)
    : resolvedModuleType
      ? getFixedSlotKey(resolvedModuleType, slotSpec.key)
      : String(image.imageSlot);

  /** Build the SOP filename for display in the replace confirmation dialog */
  function getSopFilename(device: "DV" | "MV"): string {
    const cid = setConfigCtx.clientIdCode || clientIdCode || "UNKNOWN";
    const ver = setConfigCtx.version || 1;
    const st = (setConfigCtx.scopeType || "ASIN") as AplusScopeType;
    const scopeAsin = st === "ASIN" ? (asin || "UNKNOWN") : undefined;
    const grpNum = st === "GRP" ? setConfigCtx.groupNumber : undefined;
    if (resolvedModuleType && resolvedModulePosition) {
      return generateImageFilename(cid, ver, st, resolvedModulePosition, resolvedModuleType, fileSlotKey, device, scopeAsin, grpNum);
    }
    return `${cid}_V${String(ver).padStart(2, "0")}_${fileSlotKey}_${device}.png`;
  }

  async function doMultipartUpload(file: File, device: "DV" | "MV"): Promise<{ driveFileId: string; displayName: string }> {
    // Resolve clientIdCode: prefer set config context (has full cid), fall back to product-level
    const resolvedCid = setConfigCtx.clientIdCode || clientIdCode || "";
    const formData = new FormData();
    formData.append("file", file);
    formData.append("clientIdCode", resolvedCid);
    formData.append("asin", asin ?? "");
    formData.append("folderType", "aplus");
    formData.append("entityType", "aplus_image");
    formData.append("entityId", image.id);
    formData.append("imageSlot", String(image.imageSlot));
    // SOP naming metadata
    if (resolvedModuleType) formData.append("moduleType", resolvedModuleType);
    if (resolvedModulePosition) formData.append("modulePosition", String(resolvedModulePosition));
    formData.append("slotKey", fileSlotKey);
    formData.append("device", device);
    if (resolvedMarketplace) formData.append("marketplace", resolvedMarketplace);
    // Set config values for folder resolution + new naming convention
    if (setConfigCtx.platform) formData.append("platform", setConfigCtx.platform);
    if (setConfigCtx.scopeType) formData.append("scopeType", setConfigCtx.scopeType);
    if (setConfigCtx.scopeIdentifier) formData.append("scopeIdentifier", setConfigCtx.scopeIdentifier);
    if (setConfigCtx.version) formData.append("version", String(setConfigCtx.version));
    if (setConfigCtx.groupNumber) formData.append("groupNumber", String(setConfigCtx.groupNumber));

    const res = await fetch("/api/drive/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Upload failed");
    }

    const data = await res.json();
    return { driveFileId: data.driveFileId, displayName: data.displayName };
  }

  async function doResumableUpload(file: File, device: "DV" | "MV"): Promise<{ driveFileId: string; displayName: string }> {
    // Step 1: Initiate session server-side
    const sessionRes = await fetch("/api/drive/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientIdCode: clientIdCode ?? "",
        asin: asin ?? "",
        folderType: "aplus",
        imageSlot: String(image.imageSlot),
        mimeType: file.type,
        entityType: "aplus_image",
        entityId: image.id,
        fileName: file.name,
        // SOP naming metadata
        moduleType: resolvedModuleType ?? undefined,
        modulePosition: resolvedModulePosition ?? undefined,
        slotKey: fileSlotKey,
        device,
        marketplace: resolvedMarketplace ?? undefined,
        // Set config values for folder resolution + new naming convention
        platform: setConfigCtx.platform ?? undefined,
        scopeType: setConfigCtx.scopeType ?? undefined,
        scopeIdentifier: setConfigCtx.scopeIdentifier ?? undefined,
        version: setConfigCtx.version ?? undefined,
        clientIdCodeOverride: setConfigCtx.clientIdCode ?? undefined,
        groupNumber: setConfigCtx.groupNumber ?? undefined,
      }),
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
        "x-mime-type": meta.mimeType ?? file.type,
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
      throw new Error(err.error || "Upload to Drive failed");
    }

    const proxyData = await proxyRes.json();
    return { driveFileId: proxyData.driveFileId, displayName: proxyData.displayName ?? meta.displayName };
  }

  /** Execute the actual upload for a device slot */
  async function executeUpload(file: File, device: "DV" | "MV") {
    const isDesktop = device === "DV";
    if (isDesktop) setUploadState("uploading");
    else setMobileUploadState("uploading");

    try {
      const FOUR_MB = 4 * 1024 * 1024;
      const result = file.size <= FOUR_MB
        ? await doMultipartUpload(file, device)
        : await doResumableUpload(file, device);

      if (isDesktop) {
        setUploadState("success");
        setUploadedFileName(result.displayName);
        setDriveFileId(result.driveFileId);
        mutation.mutate({ driveFileId: result.driveFileId });
      } else {
        setMobileUploadState("success");
        setMobileDriveFileId(result.driveFileId);
        mutation.mutate({ mobileDriveFileId: result.driveFileId });
      }
      toast.success(`${isDesktop ? "Desktop" : "Mobile"} image uploaded to Drive`);
    } catch (err) {
      if (isDesktop) setUploadState("error");
      else setMobileUploadState("error");
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    }
  }

  /** Confirm replace and proceed with upload */
  function handleConfirmReplace() {
    const file = pendingFileRef.current;
    const device = pendingReplaceDevice;
    setConfirmReplaceOpen(false);
    setPendingReplaceDevice(null);
    pendingFileRef.current = null;
    if (file && device) {
      executeUpload(file, device);
    }
  }

  function handleCancelReplace() {
    setConfirmReplaceOpen(false);
    setPendingReplaceDevice(null);
    pendingFileRef.current = null;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // If slot already has a file, show replace confirmation
    if (driveFileId) {
      pendingFileRef.current = file;
      setPendingReplaceDevice("DV");
      setConfirmReplaceOpen(true);
      return;
    }

    executeUpload(file, "DV");
  }

  async function handleMobileFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // If slot already has a file, show replace confirmation
    if (mobileDriveFileId) {
      pendingFileRef.current = file;
      setPendingReplaceDevice("MV");
      setConfirmReplaceOpen(true);
      return;
    }

    executeUpload(file, "MV");
  }

  function handleDropZoneClick() {
    if (readOnly) return;
    if (!clientIdCode) {
      toast.error("This image slot has no client code. Save the module first.");
      return;
    }
    fileInputRef.current?.click();
  }

  function handleMobileDropZoneClick() {
    if (readOnly) return;
    if (!clientIdCode) {
      toast.error("This image slot has no client code. Save the module first.");
      return;
    }
    mobileFileInputRef.current?.click();
  }

  const dimText = `${slotSpec.desktopSize.width}:${slotSpec.desktopSize.height}`;
  const hasAltText = !!image.altText?.trim();

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

  const hasDesktopImage = !!driveFileId;
  const hasMobileImage = !!mobileDriveFileId;

  const dropZoneStyle: React.CSSProperties = {
    backgroundColor: "#f7f8fa",
    border: "2px dashed #7f9ba6",
    borderRadius: "2px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    cursor: "pointer",
    overflow: "hidden",
  };

  // Render drop zone content based on upload state
  function renderDesktopDropZoneContent() {
    if (uploadState === "uploading") {
      return (
        <>
          <Loader2 style={{ width: "36px", height: "36px", color: "#6b8f9e", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: "14px", color: "#6b8f9e" }}>Uploading…</span>
        </>
      );
    }
    if (uploadState === "success" && imageProxyUrl) {
      return (
        <img
          src={imageProxyUrl}
          alt={altText || "Uploaded image"}
          style={{
            width: "100%",
            objectFit: "cover",
            borderRadius: "2px",
          }}
        />
      );
    }
    if (uploadState === "error") {
      return (
        <>
          <AlertTriangle style={{ width: "36px", height: "36px", color: "#d13212" }} />
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "14px", color: "#d13212", fontWeight: 500 }}>
              Upload failed
            </span>
            <br />
            <span style={{ fontSize: "13px", color: "#6b8f9e" }}>
              Click to retry
            </span>
          </div>
        </>
      );
    }
    return (
      <>
        <ImageIcon style={{ width: "36px", height: "36px", color: "#6b8f9e" }} />
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: "14px", color: "#6b8f9e", fontWeight: 500 }}>
            Click to upload
          </span>
        </div>
      </>
    );
  }

  const imageProxyUrl = driveFileId ? `/api/drive/file/${driveFileId}` : null;

  return (
    <>
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={mobileFileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleMobileFileChange}
      />

      {/* ── Clickable image placeholder (SC style) ────────────── */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        style={{
          width: "100%",
          backgroundColor: "#f7f8fa",
          border: imageProxyUrl ? "2px solid #e7e7e7" : "2px dashed #7f9ba6",
          borderRadius: "2px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: imageProxyUrl ? "8px" : "48px 0",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {imageProxyUrl ? (
          <>
            <img
              src={imageProxyUrl}
              alt={altText || "Uploaded image"}
              style={{
                width: "100%",
                objectFit: "cover",
                borderRadius: "2px",
              }}
            />
            {hasAltText && (
              <span style={{ fontSize: "12px", color: "#888c8c", marginTop: "4px" }}>
                Alt: {image.altText}
              </span>
            )}
          </>
        ) : (
          <>
            <ImageIcon style={{ width: "28px", height: "28px", color: "#6b8f9e" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b8f9e" }}>{dimText}</span>
            <span style={{ fontSize: "13px", color: "#6b8f9e", display: "flex", alignItems: "center", gap: "6px" }}>
              {uploadState === "uploading" && (
                <Loader2 style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} />
              )}
              Click to add image
            </span>
            {hasAltText && (
              <span style={{ fontSize: "12px", color: "#888c8c", marginTop: "4px" }}>
                Alt: {image.altText}
              </span>
            )}
            {uploadedFileName && (
              <span style={{ fontSize: "12px", color: "#047857", marginTop: "4px" }}>
                Uploaded: {uploadedFileName}
              </span>
            )}
          </>
        )}
      </button>

      {/* ── Replace-in-place confirmation dialog ────────────── */}
      {confirmReplaceOpen && pendingReplaceDevice && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={handleCancelReplace}
          />
          <div
            style={{
              position: "relative",
              backgroundColor: "#ffffff",
              color: "#0F1111",
              borderRadius: "4px",
              boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: "420px",
              padding: "24px",
              zIndex: 111,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
              <AlertTriangle style={{ width: "24px", height: "24px", color: "#e47911", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F1111", margin: "0 0 8px 0" }}>
                  Replace existing image?
                </h3>
                <p style={{ fontSize: "14px", color: "#565959", margin: "0 0 8px 0" }}>
                  This slot already has a file in Drive. Uploading will overwrite:
                </p>
                <code style={{
                  display: "block",
                  fontSize: "13px",
                  backgroundColor: "#f0f2f4",
                  color: "#0F1111",
                  padding: "8px 12px",
                  borderRadius: "3px",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                }}>
                  {getSopFilename(pendingReplaceDevice)}
                </code>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={handleCancelReplace}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#0F1111",
                  backgroundColor: "#ffffff",
                  border: "1px solid #888c8c",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#ffffff",
                  backgroundColor: "#e47911",
                  border: "1px solid #c45500",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Add Image dialog (Amazon SC style) ─────────────── */}
      {dialogOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={() => setDialogOpen(false)}
          />

          <div
            style={{
              position: "relative",
              backgroundColor: "#ffffff",
              color: "#0F1111",
              borderRadius: "4px",
              boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: slotSpec.mobileSize ? "680px" : "480px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              zIndex: 101,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111", margin: 0 }}>Add Image</h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}
              >
                <X style={{ width: "20px", height: "20px" }} />
              </button>
            </div>

            {/* Drop zone(s) */}
            <div style={{ display: "grid", gridTemplateColumns: slotSpec.mobileSize ? "1fr 1fr" : "1fr", gap: "20px", marginBottom: "20px" }}>
              <div>
                <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
                  <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                  Add image [{slotSpec.desktopSize.width}px x {slotSpec.desktopSize.height}px min]
                </label>
                <div
                  style={{ ...dropZoneStyle, padding: hasDesktopImage ? 0 : "48px 0" }}
                  onClick={handleDropZoneClick}
                >
                  {renderDesktopDropZoneContent()}
                </div>
              </div>

              {slotSpec.mobileSize && (
                <div>
                  <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
                    <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                    Add mobile image [{slotSpec.mobileSize.width}px x {slotSpec.mobileSize.height}px min]
                  </label>
                  <div style={{ ...dropZoneStyle, padding: hasMobileImage ? 0 : "48px 0" }} onClick={handleMobileDropZoneClick}>
                    {mobileUploadState === "uploading" ? (
                      <>
                        <Loader2 style={{ width: "36px", height: "36px", color: "#6b8f9e", animation: "spin 1s linear infinite" }} />
                        <span style={{ fontSize: "14px", color: "#6b8f9e" }}>Uploading…</span>
                      </>
                    ) : mobileDriveFileId ? (
                      <img
                        src={`/api/drive/file/${mobileDriveFileId}`}
                        alt={altText || "Uploaded mobile image"}
                        style={{ width: "100%", objectFit: "cover", borderRadius: "2px" }}
                      />
                    ) : (
                      <>
                        <ImageIcon style={{ width: "36px", height: "36px", color: "#6b8f9e" }} />
                        <div style={{ textAlign: "center" }}>
                          <span style={{ fontSize: "14px", color: "#6b8f9e", fontWeight: 500 }}>
                            Drag image here
                          </span>
                          <br />
                          <span style={{ fontSize: "14px", color: "#6b8f9e" }}>
                            <strong>or</strong> click to select
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Alt text */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
                  <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                  Alt text
                </label>
                <span style={{ fontSize: "12px", color: "#888c8c", cursor: "help" }} title="Describe the image for accessibility">&#9432;</span>
                <SaveIndicator state={altSaveState} />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  onBlur={makeBlurHandler("altText", altText, image.altText, setAltSaveState)}
                  disabled={readOnly}
                  placeholder="Enter alt text"
                  maxLength={110}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleGenerateAltText}
                  disabled={readOnly || isGeneratingAlt}
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
                    cursor: isGeneratingAlt ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                    opacity: readOnly ? 0.4 : 1,
                    minWidth: "fit-content",
                    flexShrink: 0,
                  }}
                >
                  {isGeneratingAlt ? (
                    <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Sparkles style={{ width: "14px", height: "14px" }} strokeWidth={1.75} />
                  )}
                  {isGeneratingAlt ? "Generating…" : "Generate Alt Text"}
                </button>
              </div>
            </div>

            {/* AI Image Prompt (our custom addition) */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#565959" }}>AI Image Prompt</label>
                <SaveIndicator state={promptSaveState} />
              </div>
              <textarea
                value={aiImagePrompt}
                onChange={(e) => setAiImagePrompt(e.target.value)}
                onBlur={makeBlurHandler("aiImagePrompt", aiImagePrompt, image.aiImagePrompt, setPromptSaveState)}
                disabled={readOnly}
                rows={2}
                placeholder="Describe the image you want AI to generate"
                style={{ ...inputStyle, resize: "none", fontSize: "13px" }}
              />
            </div>

            {/* Image Description (our custom addition) */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#565959" }}>Image Description</label>
                <SaveIndicator state={descSaveState} />
              </div>
              <textarea
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                onBlur={makeBlurHandler("imageDescription", imageDescription, image.imageDescription, setDescSaveState)}
                disabled={readOnly}
                rows={2}
                placeholder="Describe what this image should show"
                style={{ ...inputStyle, resize: "none", fontSize: "13px" }}
              />
            </div>

            {/* Action buttons (SC style) */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#0F1111",
                  backgroundColor: "#ffffff",
                  border: "1px solid #888c8c",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await mutation.mutateAsync({ driveFileId: "" });
                    setDriveFileId(null);
                    setUploadState("idle");
                    setUploadedFileName(null);
                    setDialogOpen(false);
                    toast.success("Image removed from slot");
                  } catch {
                    toast.error("Failed to remove image");
                  }
                }}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#d13212",
                  backgroundColor: "#ffffff",
                  border: "1px solid #d13212",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#ffffff",
                  backgroundColor: "#008296",
                  border: "1px solid #008296",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
