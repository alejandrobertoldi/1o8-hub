/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/rerender-memo-with-default-value */
/* eslint-disable react-doctor/no-pure-black-background */
/* eslint-disable react-doctor/no-transition-all */
/* eslint-disable react-doctor/no-render-in-render */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useMemo, useCallback } from "react";
import { Monitor, Smartphone, ChevronLeft, ChevronRight } from "lucide-react";
import { APLUS_MODULE_SPECS } from "@/lib/aplus-module-specs";
import type { AplusModuleType } from "@/lib/aplus-module-specs";
import type { AplusModuleWithImages, AplusModuleImage, CommentPin, PendingPin } from "./module-card-types";

interface AplusPreviewPanelProps {
  modules: AplusModuleWithImages[];
  product: {
    id: string;
    name: string;
    asin: string;
    clientIdCode: string;
    marketplace?: string | null;
  };
  commentPins?: CommentPin[];
  pendingPin?: PendingPin | null;
  onPin?: (moduleId: string, moduleNumber: number, pinX: number, pinY: number) => void;
}

// ─── Type color mapping ─────────────────────────────────────────────────────

function getTypeColor(moduleType: string): string {
  switch (moduleType) {
    case "full_image":
      return "#3B82F6";
    case "background_image_text":
      return "#8B5CF6";
    case "comparison_table_1":
    case "comparison_table_2":
    case "comparison_table_3":
      return "#F59E0B";
    case "full_video":
    case "video_text":
    case "video_image_carousel":
      return "#EF4444";
    case "navigation_carousel":
    case "regimen_carousel":
    case "simple_image_carousel":
      return "#10B981";
    case "dual_images_text":
    case "four_images_text":
      return "#0EA5E9";
    case "hotspots_1":
    case "hotspots_2":
      return "#EC4899";
    case "qa":
    case "text":
    case "technical_specifications":
      return "#6B7280";
    default:
      return "#6366F1";
  }
}

// ─── Status badge colors ────────────────────────────────────────────────────

function getStatusStyle(status: string): {
  bg: string;
  color: string;
  label: string;
} {
  switch (status) {
    case "draft":
      return { bg: "#f0f2f4", color: "#565959", label: "Draft" };
    case "in_review":
      return { bg: "#fef3cd", color: "#92640d", label: "In Review" };
    case "approved":
      return { bg: "#d4edda", color: "#155724", label: "Approved" };
    case "uploaded":
      return { bg: "#cce5ff", color: "#004085", label: "Uploaded" };
    default:
      return { bg: "#f0f2f4", color: "#565959", label: status };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AplusPreviewPanel({ modules, product, commentPins = [], pendingPin, onPin }: AplusPreviewPanelProps) {
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const sorted = useMemo(
    () => modules.toSorted((a, b) => a.moduleNumber - b.moduleNumber),
    [modules]
  );

  // Group pins by moduleId for overlay rendering
  const pinsByModule = useMemo(() => {
    const map = new Map<string, CommentPin[]>();
    for (const pin of commentPins) {
      if (pin.moduleId && pin.status === "active") {
        const existing = map.get(pin.moduleId) ?? [];
        existing.push(pin);
        map.set(pin.moduleId, existing);
      }
    }
    return map;
  }, [commentPins]);

  if (sorted.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          backgroundColor: "#ffffff",
          border: "1px solid #e7e7e7",
          borderRadius: 8,
          color: "#888c8c",
          fontSize: 14,
          fontFamily:
            "'Amazon Ember', Arial, sans-serif",
        }}
      >
        No modules yet
      </div>
    );
  }

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    color: active ? "#ffffff" : "#565959",
    backgroundColor: active ? "#008296" : "transparent",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    lineHeight: 1.4,
  });

  return (
    <div
      style={{
        overflowY: "auto",
        backgroundColor: "#ffffff",
        border: "1px solid #e7e7e7",
        borderRadius: 8,
        fontFamily: "'Amazon Ember', Arial, sans-serif",
      }}
    >
      {/* Desktop / Mobile toggle — panel level */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "6px 8px",
        borderBottom: "1px solid #e7e7e7",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          backgroundColor: "#f0f2f4",
          borderRadius: 4,
          padding: 2,
        }}>
          <button type="button" onClick={() => setPreviewDevice("desktop")} style={toggleBtnStyle(previewDevice === "desktop")}>
            <Monitor style={{ width: 12, height: 12 }} />
            Desktop
          </button>
          <button type="button" onClick={() => setPreviewDevice("mobile")} style={toggleBtnStyle(previewDevice === "mobile")}>
            <Smartphone style={{ width: 12, height: 12 }} />
            Mobile
          </button>
        </div>
      </div>

      {/* Module preview stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {sorted.map((mod) => (
          <ModulePreview
            key={mod.id}
            module={mod}
            pins={pinsByModule.get(mod.id) ?? []}
            pendingPin={pendingPin?.moduleId === mod.id ? pendingPin : null}
            onPin={onPin}
            previewDevice={previewDevice}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Single module preview ──────────────────────────────────────────────────

function ModulePreview({
  module,
  pins,
  pendingPin,
  onPin,
  previewDevice,
}: {
  module: AplusModuleWithImages;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
  onPin?: (moduleId: string, moduleNumber: number, pinX: number, pinY: number) => void;
  previewDevice: "desktop" | "mobile";
}) {
  const spec = APLUS_MODULE_SPECS[module.moduleType as AplusModuleType];
  const typeColor = getTypeColor(module.moduleType);
  const statusStyle = getStatusStyle(module.status);
  const modLabel = `MOD${String(module.moduleNumber).padStart(2, "0")}`;
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [playingVideo, setPlayingVideo] = useState(false);

  // Detect carousel module (has repeatableGroup with image) — exclude hotspots & nav carousel
  const isHotspots = module.moduleType === "hotspots_1" || module.moduleType === "hotspots_2";
  const isNavCarousel = module.moduleType === "navigation_carousel";
  const isRegimenCarousel = module.moduleType === "regimen_carousel";
  const isCarousel = !!spec?.repeatableGroup?.image && !isHotspots && !isNavCarousel && !isRegimenCarousel;

  // For carousel: collect all panel images sorted by slot
  const panelImages = useMemo(() => {
    if (!isCarousel) return [];
    return module.images
      .filter((img) => img.customLabel?.startsWith("panel_"))
      .sort((a, b) => a.imageSlot - b.imageSlot);
  }, [isCarousel, module.images]);

  // For non-carousel: find first image
  const firstImageSlotSpec = spec?.imageSlots?.[0];
  const singleDesktopImage = !isCarousel ? module.images.find((img) => img.driveFileId) : null;
  const singleMobileImage = !isCarousel ? module.images.find((img) => (img as Record<string, unknown>).mobileDriveFileId) : null;
  const isVideoModule = !!spec?.hasVideo;
  const hasUploadedVideo = !!(module as Record<string, unknown>).videoDriveFileId;
  const videoTitle = (module as Record<string, unknown>).videoTitle as string | null;
  const isBackgroundImageText = module.moduleType === "background_image_text";
  const isMultiImage = module.moduleType === "dual_images_text" || module.moduleType === "four_images_text";
  const isComparisonTable13 = module.moduleType === "comparison_table_1" || module.moduleType === "comparison_table_3";
  const isComparisonTable2 = module.moduleType === "comparison_table_2";
  const textPosition = ((module as Record<string, unknown>).textPosition as string) || "left";
  const fontColor = ((module as Record<string, unknown>).fontColor as string) || "light";

  // Determine active image based on carousel vs single
  const activeImage = isCarousel
    ? panelImages[Math.min(carouselIndex, panelImages.length - 1)]
    : null;

  const activeFileId = isCarousel
    ? (previewDevice === "mobile" && (activeImage as Record<string, unknown> | undefined)?.mobileDriveFileId
        ? (activeImage as Record<string, unknown>)?.mobileDriveFileId as string
        : activeImage?.driveFileId ?? null)
    : (previewDevice === "mobile" && (singleMobileImage as Record<string, unknown> | undefined)?.mobileDriveFileId
        ? (singleMobileImage as Record<string, unknown>)?.mobileDriveFileId as string
        : singleDesktopImage?.driveFileId ?? null);

  // Carousel image spec from repeatableGroup or first imageSlot
  const imageSpec = isCarousel ? spec?.repeatableGroup?.image : firstImageSlotSpec;
  const activeDims = previewDevice === "mobile" && imageSpec?.mobileSize
    ? imageSpec.mobileSize
    : imageSpec?.desktopSize;
  const dims = activeDims;
  const aspectRatio = dims ? dims.width / dims.height : 16 / 9;

  // Short label for vertical strip (remove "Premium " prefix)
  const stripLabel = spec
    ? spec.label.replace(/^Premium\s+/i, "")
    : module.moduleType.replace(/_/g, " ");

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPin) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onPin(module.id, module.moduleNumber, Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    },
    [onPin, module.id, module.moduleNumber]
  );

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
      }}
    >
      {/* Vertical type label strip with MOD badge + status */}
      <div
        style={{
          width: 28,
          minWidth: 28,
          backgroundColor: typeColor,
          borderTop: "1px dotted #ffffff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          padding: "4px 0",
        }}
      >
        {/* MOD badge at top */}
        <span
          style={{
            fontSize: 7,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "monospace",
            letterSpacing: "0.03em",
            lineHeight: 1,
            textAlign: "center",
            userSelect: "none",
          }}
        >
          {modLabel}
        </span>
        {/* Type label (vertical) */}
        <span
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {stripLabel}
        </span>
        {/* Status dot at bottom */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: statusStyle.bg,
            border: `1.5px solid ${statusStyle.color}`,
            flexShrink: 0,
          }}
          title={statusStyle.label}
        />
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Text fields BEFORE image (e.g. headline) — skip for background_image_text (overlaid) */}
        {!isBackgroundImageText && spec?.layout?.filter((l) => l.type === "textField").map((l) => {
          const idx = spec.layout!.indexOf(l);
          const imageIdx = spec.layout!.findIndex((li) => li.type === "imageSlot");
          if (imageIdx >= 0 && idx >= imageIdx) return null;
          const fieldSpec = spec.textFields.find((f) => f.key === l.fieldKey);
          const value = (module as Record<string, unknown>)[l.fieldKey!] as string | null;
          if (!value) return null;
          return (
            <div key={l.fieldKey} style={{
              padding: fieldSpec?.multiline ? "8px 16px" : "10px 16px 6px",
              textAlign: "center",
              fontSize: fieldSpec?.multiline ? 14 : 18,
              fontWeight: fieldSpec?.multiline ? 400 : 700,
              color: "#0F1111",
              lineHeight: 1.4,
              backgroundColor: "#ffffff",
            }}>
              {value}
            </div>
          );
        })}

        {/* Comparison Table 1/3 preview */}
        {isComparisonTable13 && spec ? (
          <ComparisonTable13Preview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Comparison Table 2 preview */
        isComparisonTable2 && spec ? (
          <ComparisonTable2Preview
            module={module}
            spec={spec}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Multi-image grid (dual / four images with text) */
        isMultiImage && spec ? (
          <MultiImagePreview
            module={module}
            spec={spec}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Regimen Carousel — image + dark bar + numbered step pills */
        isRegimenCarousel ? (
          <RegimenCarouselPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Navigation Carousel — tab bar with panel images */
        isNavCarousel ? (
          <NavigationCarouselPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Hotspots preview — background image with interactive dots */
        isHotspots ? (
          <HotspotsPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Q&A accordion preview */
        module.moduleType === "qa" ? (
          <QAPreview module={module} />
        ) : /* Simple Image Carousel */
        module.moduleType === "simple_image_carousel" ? (
          <SimpleImageCarouselPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Single Image with Text */
        module.moduleType === "single_image_text" ? (
          <SingleImageTextPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Technical Specifications */
        module.moduleType === "technical_specifications" ? (
          <TechSpecsPreview module={module} />
        ) : /* Premium Text */
        module.moduleType === "text" ? (
          <TextPreview module={module} />
        ) : /* Video Image Carousel */
        module.moduleType === "video_image_carousel" ? (
          <VideoImageCarouselPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : /* Video with Text */
        module.moduleType === "video_text" ? (
          <VideoTextPreview
            module={module}
            previewDevice={previewDevice}
            onPin={onPin ? handleImageClick : undefined}
            pins={pins}
            pendingPin={pendingPin}
          />
        ) : (
        /* Image / video area — clickable for pin placement */
        <div
          style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
          onClick={handleImageClick}
        >

        {/* Existing comment pins */}
        {pins.map((pin) => (
          <PinMarker
            key={pin.id}
            pinX={pin.pinX}
            pinY={pin.pinY}
            label={pin.commentNumber ?? undefined}
            isPending={false}
            isClient={pin.isClient}
          />
        ))}

        {/* Pending pin (not yet submitted) */}
        {pendingPin && (
          <PinMarker
            pinX={pendingPin.pinX}
            pinY={pendingPin.pinY}
            isPending={true}
          />
        )}

        {/* Video playback: inline player */}
        {isVideoModule && hasUploadedVideo && playingVideo ? (
          <div style={{ position: "relative", width: "100%", backgroundColor: "#000" }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={`/api/drive/file/${(module as Record<string, unknown>).videoDriveFileId as string}`}
              controls
              autoPlay
              style={{ width: "100%", display: "block" }}
              onEnded={() => setPlayingVideo(false)}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPlayingVideo(false); }}
              style={{
                position: "absolute", top: 8, right: 8, zIndex: 5,
                width: 28, height: 28, borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.6)", border: "none",
                color: "#fff", fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        ) : activeFileId || (isVideoModule && hasUploadedVideo) ? (
          <>
            {activeFileId ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/drive/file/${activeFileId}`}
                alt={activeImage?.altText || singleDesktopImage?.altText || `${stripLabel} preview`}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            ) : (
              /* Video without preview image: dark placeholder */
              <div
                style={{
                  width: "100%",
                  paddingBottom: `${(1 / aspectRatio) * 100}%`,
                  backgroundColor: "#1a1a2e",
                }}
              />
            )}
            {/* Background image text overlay */}
            {isBackgroundImageText && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  [textPosition === "right" ? "right" : "left"]: 0,
                  width: "50%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "16px 24px",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              >
                {module.subheadlineText && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: fontColor === "light" ? "#ffffff" : "#0F1111",
                    marginBottom: 4,
                    textShadow: fontColor === "light" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
                  }}>
                    {module.subheadlineText}
                  </div>
                )}
                {module.headlineText && (
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: fontColor === "light" ? "#ffffff" : "#0F1111",
                    lineHeight: 1.2,
                    marginBottom: 6,
                    textShadow: fontColor === "light" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
                  }}>
                    {module.headlineText}
                  </div>
                )}
                {module.bodyText && (
                  <div style={{
                    fontSize: 11,
                    color: fontColor === "light" ? "rgba(255,255,255,0.9)" : "#565959",
                    lineHeight: 1.4,
                    textShadow: fontColor === "light" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
                  }}>
                    {module.bodyText}
                  </div>
                )}
              </div>
            )}
            {/* Play button overlay for video modules */}
            {isVideoModule && hasUploadedVideo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: "pointer",
                  zIndex: 3,
                }}
                onClick={(e) => { e.stopPropagation(); setPlayingVideo(true); }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  border: "2px solid rgba(255,255,255,0.8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background-color 0.2s",
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff">
                    <polygon points="8,5 20,12 8,19" />
                  </svg>
                </div>
                {videoTitle && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: "#ffffff", marginTop: 4,
                    textShadow: "0 1px 4px rgba(0,0,0,0.7)",
                  }}>
                    {videoTitle}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          /* Placeholder — no image, no video */
          <div
            style={{
              width: "100%",
              paddingBottom: `${(1 / aspectRatio) * 100}%`,
              position: "relative",
              backgroundColor: "#f7f8f8",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                color: "#888c8c",
                pointerEvents: "none",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{stripLabel}</span>
              {dims && <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>}
            </div>
          </div>
        )}

        {/* Carousel navigation */}
        {isCarousel && panelImages.length > 1 && (
          <>
            {/* Left arrow */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCarouselIndex((i) => (i - 1 + panelImages.length) % panelImages.length); }}
              style={{
                position: "absolute",
                left: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "rgba(200,200,200,0.7)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 4,
              }}
            >
              <ChevronLeft style={{ width: 16, height: 16, color: "#ffffff" }} />
            </button>
            {/* Right arrow */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCarouselIndex((i) => (i + 1) % panelImages.length); }}
              style={{
                position: "absolute",
                right: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "rgba(200,200,200,0.7)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 4,
              }}
            >
              <ChevronRight style={{ width: 16, height: 16, color: "#ffffff" }} />
            </button>
            {/* Dot indicators */}
            <div style={{
              position: "absolute",
              bottom: 6,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 5,
              zIndex: 4,
            }}>
              {panelImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCarouselIndex(i); }}
                  style={{
                    width: i === carouselIndex ? 16 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i === carouselIndex ? "rgba(200,200,200,0.9)" : "rgba(200,200,200,0.4)",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "width 0.2s, background-color 0.2s",
                  }}
                />
              ))}
            </div>
          </>
        )}
        </div>
        )}

        {/* Text fields AFTER image (e.g. body text) — skip for background_image_text (overlaid) */}
        {!isBackgroundImageText && spec?.layout?.filter((l) => l.type === "textField").map((l) => {
          const idx = spec.layout!.indexOf(l);
          const imageIdx = spec.layout!.findIndex((li) => li.type === "imageSlot");
          if (imageIdx >= 0 && idx <= imageIdx) return null;
          const fieldSpec = spec.textFields.find((f) => f.key === l.fieldKey);
          const value = (module as Record<string, unknown>)[l.fieldKey!] as string | null;
          if (!value) return null;
          return (
            <div key={l.fieldKey} style={{
              padding: fieldSpec?.multiline ? "6px 16px 10px" : "10px 16px 6px",
              textAlign: "center",
              fontSize: fieldSpec?.multiline ? 14 : 18,
              fontWeight: fieldSpec?.multiline ? 400 : 700,
              color: "#0F1111",
              lineHeight: 1.4,
              backgroundColor: "#ffffff",
            }}>
              {value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
// ─── Regimen Carousel preview (image + dark bar + numbered step pills) ───────

function RegimenCarouselPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const spec = APLUS_MODULE_SPECS["regimen_carousel"];
  const imgSpec = spec.repeatableGroup!.image!;
  const dims = previewDevice === "mobile" && imgSpec.mobileSize ? imgSpec.mobileSize : imgSpec.desktopSize;
  const aspectRatio = dims.width / dims.height;

  const headlineText = (module as Record<string, unknown>).headlineText as string | null;

  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const panelCount = Math.max(panelImages.length, 2);

  // Build panel data from image records
  const panels = Array.from({ length: panelCount }, (_, i) => {
    const img = panelImages[i];
    const pd = (img?.panelData ?? {}) as Record<string, string>;
    return {
      headline: pd.step_label || "",
      body: pd.description || "",
      navText: pd.nav_text || `Step ${i + 1}`,
      fileId: previewDevice === "mobile" && (img as Record<string, unknown>)?.mobileDriveFileId
        ? (img as Record<string, unknown>).mobileDriveFileId as string
        : img?.driveFileId ?? null,
    };
  });

  const active = panels[Math.min(activeStep, panels.length - 1)];

  const isMobile = previewDevice === "mobile";

  return (
    <div style={{ backgroundColor: "#ffffff" }}>
      {/* Module headline */}
      {headlineText && (
        <div style={{ padding: "10px 16px 6px", textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.4 }}>
          {headlineText}
        </div>
      )}

      {/* Desktop: image with text overlay + step pills on the right */}
      {!isMobile ? (
        <div style={{ position: "relative" }}>
          {/* Image area with text overlay */}
          <div
            style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
            onClick={onPin}
          >
            {pins.map((pin) => (
              <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
            ))}
            {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

            {active.fileId ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`/api/drive/file/${active.fileId}`} alt={active.headline || active.navText} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
            ) : (
              <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Panel {activeStep + 1}</span>
                  <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
                </div>
              </div>
            )}

            {/* Text overlay on the left side of the image */}
            {(active.headline || active.body) && (
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: "45%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "16px 24px",
                zIndex: 2,
                pointerEvents: "none",
                background: "linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 80%, transparent 100%)",
              }}>
                {active.headline && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.3, marginBottom: active.body ? 6 : 0, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                    {active.headline}
                  </div>
                )}
                {active.body && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
                    {active.body}
                  </div>
                )}
              </div>
            )}

            {/* Step pills on the right side of the image */}
            <div style={{
              position: "absolute",
              top: "50%",
              right: 12,
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              zIndex: 3,
            }}>
              {panels.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveStep(i); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 16px",
                    borderRadius: "20px",
                    border: i === activeStep ? "none" : "1px solid rgba(255,255,255,0.6)",
                    backgroundColor: i === activeStep ? "#0F1111" : "rgba(255,255,255,0.85)",
                    color: i === activeStep ? "#ffffff" : "#0F1111",
                    fontSize: 12,
                    fontWeight: i === activeStep ? 700 : 400,
                    cursor: "pointer",
                    minWidth: "120px",
                    transition: "all 0.15s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{i + 1}</span>
                  <span>{p.navText}</span>
                </button>
              ))}
            </div>

            {/* Left/right arrows */}
            {panelCount > 1 && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); setActiveStep((s) => (s - 1 + panelCount) % panelCount); }}
                  style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4 }}>
                  <ChevronLeft style={{ width: 16, height: 16, color: "#ffffff" }} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setActiveStep((s) => (s + 1) % panelCount); }}
                  style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4 }}>
                  <ChevronRight style={{ width: 16, height: 16, color: "#ffffff" }} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Mobile: image + dark bar below + step pills below */
        <>
          {/* Panel image */}
          <div
            style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
            onClick={onPin}
          >
            {pins.map((pin) => (
              <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
            ))}
            {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

            {active.fileId ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`/api/drive/file/${active.fileId}`} alt={active.headline || active.navText} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
            ) : (
              <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Panel {activeStep + 1}</span>
                  <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
                </div>
              </div>
            )}
          </div>

          {/* Dark bar with headline + body */}
          {(active.headline || active.body) && (
            <div style={{ backgroundColor: "#232f3e", padding: "12px 16px" }}>
              {active.headline && (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.3, marginBottom: active.body ? 4 : 0 }}>
                  {active.headline}
                </div>
              )}
              {active.body && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                  {active.body}
                </div>
              )}
            </div>
          )}

          {/* Numbered step pills */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 16px" }}>
            {panels.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveStep(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 20px",
                  borderRadius: "20px",
                  border: i === activeStep ? "none" : "1px solid #d5d9d9",
                  backgroundColor: i === activeStep ? "#0F1111" : "#ffffff",
                  color: i === activeStep ? "#ffffff" : "#0F1111",
                  fontSize: 13,
                  fontWeight: i === activeStep ? 700 : 400,
                  cursor: "pointer",
                  minWidth: "160px",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontWeight: 700 }}>{i + 1}</span>
                <span>{p.navText}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Q&A accordion preview ───────────────────────────────────────────────────

function QAPreview({ module }: { module: AplusModuleWithImages }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Read Q&A items from image records with panelData
  const qaImages = module.images
    .filter((img) => img.customLabel?.startsWith("qa_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const items = qaImages.map((img) => {
    const pd = (img.panelData ?? {}) as Record<string, string>;
    return { question: pd.question ?? "", answer: pd.answer ?? "" };
  }).filter((item) => item.question); // only show items with a question

  if (items.length === 0) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#888c8c", fontSize: 13 }}>
        No questions added yet
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", backgroundColor: "#ffffff", display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.map((item, i) => {
        const isExpanded = expandedIdx === i;
        return (
          <div key={i} style={{ border: "1px solid #d5d9d9", borderRadius: "4px", overflow: "hidden" }}>
            {/* Question row — always visible */}
            <button
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                backgroundColor: "#ffffff",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {/* Q badge */}
              <span style={{
                width: 32, height: 32, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "#565959", borderRadius: "4px",
                color: "#ffffff", fontSize: 16, fontWeight: 700,
              }}>
                Q
              </span>
              {/* Question text */}
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#0F1111", lineHeight: 1.4 }}>
                {item.question}
              </span>
              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#565959" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Answer row — visible when expanded */}
            {isExpanded && item.answer && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "0 12px 12px", borderTop: "1px solid #e7e7e7", paddingTop: "10px" }}>
                {/* A badge */}
                <span style={{
                  width: 32, height: 32, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "#C67A1A", borderRadius: "4px",
                  color: "#ffffff", fontSize: 16, fontWeight: 700,
                }}>
                  A
                </span>
                {/* Answer text */}
                <span style={{ flex: 1, fontSize: 13, color: "#565959", lineHeight: 1.5 }}>
                  {item.answer}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Navigation Carousel preview (tab bar + panel image + text) ──────────────

function NavigationCarouselPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const [activeTab, setActiveTab] = useState(0);

  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const panelCount = Math.max(panelImages.length, 2);
  const spec = APLUS_MODULE_SPECS["navigation_carousel"];
  const imgSpec = spec.repeatableGroup!.image!;
  const dims = previewDevice === "mobile" && imgSpec.mobileSize ? imgSpec.mobileSize : imgSpec.desktopSize;
  const aspectRatio = dims.width / dims.height;

  // Build panel data from image records
  const panels = Array.from({ length: panelCount }, (_, i) => {
    const img = panelImages[i];
    const pd = (img?.panelData ?? {}) as Record<string, string>;
    return {
      tabTitle: pd.tab_title || `Panel ${i + 1}`,
      subheadline: pd.subheadline || "",
      headline: pd.caption || "",
      body: pd.body || "",
      fileId: previewDevice === "mobile" && (img as Record<string, unknown>)?.mobileDriveFileId
        ? (img as Record<string, unknown>).mobileDriveFileId as string
        : img?.driveFileId ?? null,
    };
  });

  const active = panels[Math.min(activeTab, panels.length - 1)];

  return (
    <div style={{ backgroundColor: "#ffffff" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "2px solid #e7e7e7",
        backgroundColor: "#f7f8f8",
      }}>
        {panels.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTab(i)}
            style={{
              flex: 1,
              padding: "10px 8px",
              fontSize: 12,
              fontWeight: i === activeTab ? 700 : 400,
              color: i === activeTab ? "#0F1111" : "#565959",
              backgroundColor: i === activeTab ? "#ffffff" : "transparent",
              border: "none",
              borderBottom: i === activeTab ? "3px solid #e77600" : "3px solid transparent",
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              transition: "all 0.15s",
            }}
          >
            {p.tabTitle}
          </button>
        ))}
      </div>

      {/* Panel image */}
      <div
        style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
        onClick={onPin}
      >
        {/* Comment pins */}
        {pins.map((pin) => (
          <PinMarker
            key={pin.id}
            pinX={pin.pinX}
            pinY={pin.pinY}
            label={pin.commentNumber ?? undefined}
            isPending={false}
            isClient={pin.isClient}
          />
        ))}
        {pendingPin && (
          <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />
        )}

        {active.fileId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/drive/file/${active.fileId}`}
            alt={active.headline || active.tabTitle}
            style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }}
          />
        ) : (
          <div style={{
            width: "100%",
            paddingBottom: `${(1 / aspectRatio) * 100}%`,
            position: "relative",
            backgroundColor: "#f7f8f8",
          }}>
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: "#888c8c",
              pointerEvents: "none",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{active.tabTitle}</span>
              <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
            </div>
          </div>
        )}
      </div>

      {/* Panel text below image */}
      {(active.subheadline || active.headline || active.body) && (
        <div style={{ padding: "12px 16px", backgroundColor: "#ffffff" }}>
          {active.subheadline && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#565959", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {active.subheadline}
            </div>
          )}
          {active.headline && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: 6 }}>
              {active.headline}
            </div>
          )}
          {active.body && (
            <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.5 }}>
              {active.body}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hotspots preview (background image with interactive dots) ───────────────

function HotspotsPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const spec = APLUS_MODULE_SPECS[module.moduleType as AplusModuleType];
  const bgSlot = spec.imageSlots[0]; // main_image 1464x600
  const bgImage = module.images.find(
    (img) => img.customLabel === bgSlot.key || img.imageSlot === 1
  );
  const bgFileId = bgImage?.driveFileId ?? null;
  const dims = bgSlot.desktopSize;
  const aspectRatio = dims.width / dims.height;

  // Module-level text fields (Hotspots 2 has headline + body)
  const headlineText = (module as Record<string, unknown>).headlineText as string | null;
  const bodyText = (module as Record<string, unknown>).bodyText as string | null;
  const isType2 = module.moduleType === "hotspots_2";

  return (
    <div
      style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
      onClick={onPin}
    >
      {/* Comment pins */}
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pinX={pin.pinX}
          pinY={pin.pinY}
          label={pin.commentNumber ?? undefined}
          isPending={false}
          isClient={pin.isClient}
        />
      ))}
      {pendingPin && (
        <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />
      )}

      {/* Module-level text (Hotspots 2) */}
      {isType2 && (headlineText || bodyText) && (
        <div style={{ padding: "12px 16px", backgroundColor: "#ffffff", textAlign: "center" }}>
          {headlineText && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F1111", lineHeight: 1.3 }}>
              {headlineText}
            </div>
          )}
          {bodyText && (
            <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.4, marginTop: 4 }}>
              {bodyText}
            </div>
          )}
        </div>
      )}

      {bgFileId ? (
        <div style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/drive/file/${bgFileId}`}
            alt={bgImage?.altText || "Hotspot background"}
            style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }}
          />
          {/* Placeholder hotspot dots — visual indicator that this is a hotspots module */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {/* Show "Hotspots" label overlay when no hotspots are configured */}
            <div style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "#ffffff",
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 3,
              letterSpacing: "0.02em",
            }}>
              {module.moduleType === "hotspots_1" ? "Hotspots 1" : "Hotspots 2"}
            </div>
          </div>
        </div>
      ) : (
        /* Placeholder — no background image */
        <div
          style={{
            width: "100%",
            paddingBottom: `${(1 / aspectRatio) * 100}%`,
            position: "relative",
            backgroundColor: "#f7f8f8",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: "#888c8c",
              pointerEvents: "none",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {module.moduleType === "hotspots_1" ? "Hotspots 1" : "Hotspots 2"}
            </span>
            <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Multi-image preview (dual / four images with text) ─────────────────────

function MultiImagePreview({
  module,
  spec,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  spec: (typeof APLUS_MODULE_SPECS)[AplusModuleType];
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const columns = spec.imageSlots.length; // 2 or 4
  const rg = spec.repeatableGroup;

  // Find image for each slot
  const getSlotImage = (slotKey: string, slotIdx: number) => {
    return module.images.find(
      (img) => img.customLabel === slotKey || img.imageSlot === slotIdx + 1
    );
  };

  // Get panelData caption/body for each image (stored on the image record)
  const getPanelText = (img: AplusModuleImage | undefined, field: string): string => {
    if (!img?.panelData) return "";
    const pd = img.panelData as Record<string, unknown>;
    return (pd[field] as string) ?? "";
  };

  return (
    <div
      style={{ position: "relative", cursor: onPin ? "crosshair" : "default" }}
      onClick={onPin}
    >
      {/* Comment pins */}
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pinX={pin.pinX}
          pinY={pin.pinY}
          label={pin.commentNumber ?? undefined}
          isPending={false}
          isClient={pin.isClient}
        />
      ))}
      {pendingPin && (
        <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />
      )}

      {/* Headline (module-level) */}
      {module.headlineText && (
        <div style={{
          padding: "12px 16px 8px",
          textAlign: "center",
          fontSize: 18,
          fontWeight: 700,
          color: "#0F1111",
          lineHeight: 1.3,
          backgroundColor: "#ffffff",
        }}>
          {module.headlineText}
        </div>
      )}

      {/* Image grid with per-image captions */}
      <div style={{
        display: "grid",
        gridTemplateColumns: previewDevice === "mobile" ? "1fr" : `repeat(${columns}, 1fr)`,
        gap: 0,
        backgroundColor: "#ffffff",
      }}>
        {spec.imageSlots.map((slot, i) => {
          const img = getSlotImage(slot.key, i);
          const fileId = previewDevice === "mobile" && (img as Record<string, unknown> | undefined)?.mobileDriveFileId
            ? (img as Record<string, unknown>).mobileDriveFileId as string
            : img?.driveFileId ?? null;
          const dims = previewDevice === "mobile" && slot.mobileSize ? slot.mobileSize : slot.desktopSize;
          const aspectRatio = dims ? dims.width / dims.height : 4 / 3;
          const caption = getPanelText(img, "caption");
          const body = getPanelText(img, "body");

          return (
            <div key={slot.key} style={{ display: "flex", flexDirection: "column" }}>
              {/* Image */}
              {fileId ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/drive/file/${fileId}`}
                  alt={img?.altText || `${slot.label} preview`}
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    paddingBottom: `${(1 / aspectRatio) * 100}%`,
                    position: "relative",
                    backgroundColor: "#f7f8f8",
                  }}
                >
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    color: "#888c8c",
                    pointerEvents: "none",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{slot.label}</span>
                    {dims && <span style={{ fontSize: 9, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>}
                  </div>
                </div>
              )}

              {/* Per-image caption + body */}
              <div style={{ padding: "8px 12px 12px" }}>
                {caption && (
                  <div style={{
                    fontSize: columns === 2 ? 14 : 12,
                    fontWeight: 700,
                    color: "#0F1111",
                    lineHeight: 1.3,
                    marginBottom: 4,
                  }}>
                    {caption}
                  </div>
                )}
                {body && (
                  <div style={{
                    fontSize: columns === 2 ? 13 : 11,
                    color: "#565959",
                    lineHeight: 1.4,
                  }}>
                    {body}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Comparison Table 1/3 preview ────────────────────────────────────────────

interface CTMetric {
  type: "checkbox" | "text";
  metric: string;
  description?: string;
  values: string[];
}

function CheckIcon({ filled }: { filled: boolean }) {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: "50%",
      border: filled ? "none" : "2px solid #d5d9d9",
      backgroundColor: filled ? "#008296" : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {filled && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

function ComparisonTable13Preview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const spec = APLUS_MODULE_SPECS[module.moduleType as AplusModuleType];
  const [activeIdx, setActiveIdx] = useState(0);
  const [mobileCompIdx, setMobileCompIdx] = useState(0);

  // Parse product data from image panelData
  const products = useMemo(() => {
    return spec.imageSlots.map((slot, i) => {
      const img = module.images.find(
        (im) => im.customLabel === slot.key || im.imageSlot === i + 1
      );
      const pd = (img?.panelData ?? {}) as Record<string, string>;
      const fileId = previewDevice === "mobile" && (img as Record<string, unknown> | undefined)?.mobileDriveFileId
        ? (img as Record<string, unknown>).mobileDriveFileId as string
        : img?.driveFileId ?? null;
      return {
        key: slot.key,
        label: slot.label,
        title: pd.title ?? "",
        asin: pd.asin ?? "",
        fileId,
        altText: img?.altText ?? "",
        dims: previewDevice === "mobile" && slot.mobileSize ? slot.mobileSize : slot.desktopSize,
      };
    });
  }, [spec.imageSlots, module.images, previewDevice]);

  // Parse metrics from overlayText
  const metrics: CTMetric[] = useMemo(() => {
    try {
      const raw = (module as Record<string, unknown>).overlayText as string | null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  }, [module]);

  // Determine active comparison products count (from hero panelData)
  const heroImg = module.images.find(
    (im) => im.customLabel === "hero_product" || im.imageSlot === 1
  );
  const heroPd = (heroImg?.panelData ?? {}) as Record<string, string>;
  const minComp = module.moduleType === "comparison_table_3" ? 2 : 3;
  const compCount = Math.max(minComp, parseInt(heroPd.compCount ?? String(minComp), 10));
  const allProducts = [products[0], ...products.slice(1, 1 + compCount)];
  const totalProducts = allProducts.length;
  const clampedIdx = Math.min(activeIdx, totalProducts - 1);


  // ── Desktop: one product at a time with carousel ──────────────
  if (previewDevice === "desktop") {
    const prod = allProducts[clampedIdx];
    return (
      <div
        style={{ position: "relative", cursor: onPin ? "crosshair" : "default", backgroundColor: "#ffffff" }}
        onClick={onPin}
      >
        {pins.map((pin) => (
          <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
        ))}
        {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

        {/* Headline */}
        {module.headlineText && (
          <div style={{ padding: "14px 16px 8px", textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.3 }}>
            {module.headlineText}
          </div>
        )}

        {/* Product image */}
        <div style={{ padding: "0 16px" }}>
          {prod?.fileId ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/drive/file/${prod.fileId}`}
              alt={prod.altText || prod.title || "Product"}
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }}
            />
          ) : (
            <div style={{
              width: "100%", paddingBottom: prod?.dims ? `${(prod.dims.height / prod.dims.width) * 100}%` : "143%",
              backgroundColor: "#f7f8f8", borderRadius: 4, position: "relative",
            }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#888c8c" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{prod?.label ?? "Product"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        {prod?.title && (
          <div style={{ padding: "10px 16px 4px", textAlign: "center", fontSize: 15, fontWeight: 700, color: "#0F1111" }}>
            {prod.title}
          </div>
        )}

        {/* Metrics */}
        {metrics.length > 0 && (
          <div style={{ padding: "8px 20px 12px" }}>
            {metrics.map((m, mIdx) => (
              <div key={mIdx} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: mIdx < metrics.length - 1 ? "1px solid #e7e7e7" : "none",
              }}>
                <span style={{ fontSize: 13, color: "#565959" }}>{m.metric || `Metric ${mIdx + 1}`}</span>
                {m.type === "checkbox" ? (
                  <CheckIcon filled={m.values?.[clampedIdx] !== "no"} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F1111" }}>
                    {m.values?.[clampedIdx] ?? ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Dot indicators */}
        {totalProducts > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingBottom: 12 }}>
            {allProducts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }}
                style={{
                  width: i === clampedIdx ? 10 : 8,
                  height: i === clampedIdx ? 10 : 8,
                  borderRadius: "50%",
                  backgroundColor: i === clampedIdx ? "#c77d2e" : "#d5d9d9",
                  border: "none", cursor: "pointer", padding: 0,
                  transition: "all 0.2s",
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Mobile: hero | metrics | comparison product (3-col) ───────
  const hero = allProducts[0];
  const compProducts = allProducts.slice(1);
  const activeComp = compProducts[Math.min(mobileCompIdx, compProducts.length - 1)];

  return (
    <div
      style={{ position: "relative", cursor: onPin ? "crosshair" : "default", backgroundColor: "#ffffff", overflow: "hidden" }}
      onClick={onPin}
    >
      {pins.map((pin) => (
        <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
      ))}
      {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

      <div style={{ display: "flex", alignItems: "stretch", minHeight: 200 }}>
        {/* Left: Hero product */}
        <div style={{ flex: "0 0 30%", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px" }}>
          {hero?.fileId ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/drive/file/${hero.fileId}`} alt={hero.altText || hero.title} style={{ width: "100%", height: "auto", borderRadius: 4 }} />
          ) : (
            <div style={{ width: "100%", paddingBottom: "75%", backgroundColor: "#f7f8f8", borderRadius: 4, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#adb1b8", fontSize: 10 }}>Hero</div>
            </div>
          )}
          {hero?.title && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#0F1111", textAlign: "center", marginTop: 4, padding: "0 2px" }}>{hero.title}</div>
          )}
        </div>

        {/* Center: Headline + metrics table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 6px", minWidth: 0 }}>
          {module.headlineText && (
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#0F1111", marginBottom: 6 }}>
              {module.headlineText}
            </div>
          )}
          {metrics.map((m, mIdx) => {
            const heroVal = m.values?.[0];
            const compVal = m.values?.[mobileCompIdx + 1];
            return (
              <div key={mIdx} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: mIdx < metrics.length - 1 ? "1px solid #e7e7e7" : "none",
                fontSize: 10,
              }}>
                <div style={{ flex: "0 0 24px", display: "flex", justifyContent: "center" }}>
                  {m.type === "checkbox" ? (
                    <CheckIcon filled={heroVal !== "no"} />
                  ) : (
                    <span style={{ fontWeight: 600, color: "#0F1111" }}>{heroVal ?? ""}</span>
                  )}
                </div>
                <div style={{ flex: 1, textAlign: "center", color: "#565959", padding: "0 4px" }}>{m.metric}</div>
                <div style={{ flex: "0 0 24px", display: "flex", justifyContent: "center" }}>
                  {m.type === "checkbox" ? (
                    <CheckIcon filled={compVal !== "no"} />
                  ) : (
                    <span style={{ fontWeight: 600, color: "#0F1111" }}>{compVal ?? ""}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Comparison product */}
        <div style={{ flex: "0 0 30%", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px" }}>
          {activeComp?.fileId ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/drive/file/${activeComp.fileId}`} alt={activeComp.altText || activeComp.title} style={{ width: "100%", height: "auto", borderRadius: 4 }} />
          ) : (
            <div style={{ width: "100%", paddingBottom: "75%", backgroundColor: "#f7f8f8", borderRadius: 4, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#adb1b8", fontSize: 10 }}>Product</div>
            </div>
          )}
          {activeComp?.title && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#0F1111", textAlign: "center", marginTop: 4, padding: "0 2px" }}>{activeComp.title}</div>
          )}
        </div>
      </div>

      {/* Navigation arrows + dots for mobile comparison products */}
      {compProducts.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMobileCompIdx((i) => (i - 1 + compProducts.length) % compProducts.length); }}
            style={{
              position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)",
              width: 22, height: 22, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4,
            }}
          >
            <ChevronLeft style={{ width: 14, height: 14, color: "#ffffff" }} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMobileCompIdx((i) => (i + 1) % compProducts.length); }}
            style={{
              position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
              width: 22, height: 22, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4,
            }}
          >
            <ChevronRight style={{ width: 14, height: 14, color: "#ffffff" }} />
          </button>
          <div style={{ display: "flex", justifyContent: "center", gap: 5, paddingBottom: 8 }}>
            {compProducts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMobileCompIdx(i); }}
                style={{
                  width: i === mobileCompIdx ? 10 : 7, height: 7, borderRadius: 4,
                  backgroundColor: i === mobileCompIdx ? "#c77d2e" : "#d5d9d9",
                  border: "none", cursor: "pointer", padding: 0, transition: "all 0.2s",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Comparison Table 2 preview ──────────────────────────────────────────────

function ComparisonTable2Preview({
  module,
  spec,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  spec: (typeof APLUS_MODULE_SPECS)[AplusModuleType];
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const getSlotImage = (slotKey: string, slotIdx: number) => {
    return module.images.find(
      (img) => img.customLabel === slotKey || img.imageSlot === slotIdx + 1
    );
  };

  const getPanelText = (img: AplusModuleImage | undefined, field: string): string => {
    if (!img?.panelData) return "";
    const pd = img.panelData as Record<string, unknown>;
    return (pd[field] as string) ?? "";
  };

  // Derive feature count from product_1's panelData
  const pd0 = (getSlotImage(spec.imageSlots[0].key, 0)?.panelData ?? {}) as Record<string, string>;
  let featureCount = 0;
  for (let f = 0; f < 5; f++) {
    if (pd0[`feature_${f}_headline`] || pd0[`feature_${f}_body`]) {
      featureCount = f + 1;
    }
  }

  return (
    <div
      style={{ position: "relative", cursor: onPin ? "crosshair" : "default", backgroundColor: "#ffffff" }}
      onClick={onPin}
    >
      {/* Comment pins */}
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pinX={pin.pinX}
          pinY={pin.pinY}
          label={pin.commentNumber ?? undefined}
          isPending={false}
          isClient={pin.isClient}
        />
      ))}
      {pendingPin && (
        <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />
      )}

      {/* Headline */}
      {module.headlineText && (
        <div style={{
          padding: "16px 16px 12px",
          textAlign: "center",
          fontSize: 18,
          fontWeight: 700,
          color: "#0F1111",
          lineHeight: 1.3,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}>
          {module.headlineText}
        </div>
      )}

      {/* 3-product image row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: previewDevice === "mobile" ? "1fr" : "repeat(3, 1fr)",
        gap: 0,
      }}>
        {spec.imageSlots.map((slot, i) => {
          const img = getSlotImage(slot.key, i);
          const fileId = previewDevice === "mobile" && (img as Record<string, unknown> | undefined)?.mobileDriveFileId
            ? (img as Record<string, unknown>).mobileDriveFileId as string
            : img?.driveFileId ?? null;
          const dims = slot.desktopSize;
          const aspectRatio = dims ? dims.width / dims.height : 4 / 3;
          const imageHeadline = getPanelText(img, "imageHeadline");

          return (
            <div key={slot.key} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Product image */}
              {fileId ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/drive/file/${fileId}`}
                  alt={img?.altText || `${slot.label} preview`}
                  style={{
                    width: previewDevice === "mobile" ? "60%" : "80%",
                    height: "auto",
                    display: "block",
                    pointerEvents: "none",
                    margin: "0 auto",
                  }}
                />
              ) : (
                <div style={{
                  width: previewDevice === "mobile" ? "60%" : "80%",
                  paddingBottom: `${((1 / aspectRatio) * (previewDevice === "mobile" ? 60 : 80))}%`,
                  position: "relative",
                  backgroundColor: "#f7f8f8",
                  margin: "0 auto",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 4, color: "#888c8c", pointerEvents: "none",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{slot.label}</span>
                  </div>
                </div>
              )}
              {/* Image headline */}
              {imageHeadline && (
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0F1111",
                  textAlign: "center",
                  padding: "6px 8px 2px",
                  lineHeight: 1.3,
                }}>
                  {imageHeadline}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature comparison table */}
      {featureCount > 0 && (
        <div style={{ padding: "8px 0 0", borderTop: "1px solid #e7e7e7", margin: "8px 0 0" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            color: "#0F1111",
          }}>
            <tbody>
              {Array.from({ length: featureCount }, (_, fIdx) => {
                // Get headline and body for each of the 3 products
                const cells = spec.imageSlots.map((slot, colIdx) => {
                  const img = getSlotImage(slot.key, colIdx);
                  const headline = getPanelText(img, `feature_${fIdx}_headline`);
                  const body = getPanelText(img, `feature_${fIdx}_body`);
                  return { headline, body };
                });

                return (
                  <tr key={fIdx} style={{ borderBottom: "1px solid #e7e7e7" }}>
                    {cells.map((cell, colIdx) => (
                      <td key={colIdx} style={{
                        padding: "6px 10px",
                        verticalAlign: "top",
                        backgroundColor: fIdx % 2 === 0 ? "#f7f8f8" : "#ffffff",
                        width: "33.33%",
                      }}>
                        {cell.headline && (
                          <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 11 }}>{cell.headline}</div>
                        )}
                        {cell.body && (
                          <div style={{ color: "#565959", fontSize: 10, lineHeight: 1.3 }}>{cell.body}</div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Compare button */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        padding: "12px 16px 16px",
      }}>
        <div style={{
          padding: "8px 24px",
          backgroundColor: "#008296",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 4,
          textAlign: "center",
        }}>
          Compare More
        </div>
      </div>
    </div>
  );
}

// ─── Simple Image Carousel preview ────────────────────────────────────────────

function SimpleImageCarouselPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const spec = APLUS_MODULE_SPECS["simple_image_carousel"];
  const imgSpec = spec.repeatableGroup!.image!;
  const dims = previewDevice === "mobile" && imgSpec.mobileSize ? imgSpec.mobileSize : imgSpec.desktopSize;
  const aspectRatio = dims.width / dims.height;

  const headlineText = (module as Record<string, unknown>).headlineText as string | null;
  const bodyText = (module as Record<string, unknown>).bodyText as string | null;

  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const panelCount = Math.max(panelImages.length, 2);

  const panels = Array.from({ length: panelCount }, (_, i) => {
    const img = panelImages[i];
    const pd = (img?.panelData ?? {}) as Record<string, string>;
    return {
      headline: pd.headline || "",
      body: pd.body || "",
      ctaText: pd.cta_text || "",
      asin: pd.asin || "",
      fileId: previewDevice === "mobile" && (img as Record<string, unknown>)?.mobileDriveFileId
        ? (img as Record<string, unknown>).mobileDriveFileId as string
        : img?.driveFileId ?? null,
    };
  });

  const active = panels[Math.min(activeSlide, panels.length - 1)];

  return (
    <div style={{ backgroundColor: "#ffffff" }}>
      {/* Module headline */}
      {headlineText && (
        <div style={{ padding: "10px 16px 6px", textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.4 }}>
          {headlineText}
        </div>
      )}

      {/* Panel image */}
      <div
        style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
        onClick={onPin}
      >
        {pins.map((pin) => (
          <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
        ))}
        {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

        {active.fileId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/drive/file/${active.fileId}`} alt={active.headline || `Slide ${activeSlide + 1}`} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
        ) : (
          <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Slide {activeSlide + 1}</span>
              <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
            </div>
          </div>
        )}

        {/* Arrows — Amazon teal style */}
        {panelCount > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setActiveSlide((s) => (s - 1 + panelCount) % panelCount); }}
              style={{ position: "absolute", left: previewDevice === "desktop" ? 8 : 4, top: "50%", transform: "translateY(-50%)", width: previewDevice === "desktop" ? 44 : 28, height: previewDevice === "desktop" ? 44 : 28, borderRadius: "50%", backgroundColor: "#008296", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              <ChevronLeft style={{ width: previewDevice === "desktop" ? 22 : 16, height: previewDevice === "desktop" ? 22 : 16, color: "#ffffff" }} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setActiveSlide((s) => (s + 1) % panelCount); }}
              style={{ position: "absolute", right: previewDevice === "desktop" ? 8 : 4, top: "50%", transform: "translateY(-50%)", width: previewDevice === "desktop" ? 44 : 28, height: previewDevice === "desktop" ? 44 : 28, borderRadius: "50%", backgroundColor: "#008296", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              <ChevronRight style={{ width: previewDevice === "desktop" ? 22 : 16, height: previewDevice === "desktop" ? 22 : 16, color: "#ffffff" }} />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {panelCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "10px 0" }}>
          {panels.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveSlide(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: i === activeSlide ? "#008296" : "#d5d9d9",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "background-color 0.2s",
              }}
            />
          ))}
        </div>
      )}

      {/* Per-slide text + CTA below image */}
      {(active.headline || active.body || active.ctaText) && (
        <div style={{ padding: "8px 20px 12px", backgroundColor: "#f7f7f7", borderTop: "1px solid #e7e7e7" }}>
          {active.headline && (
            <div style={{ fontSize: previewDevice === "desktop" ? 16 : 14, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: 4, textAlign: "center" }}>
              {active.headline}
            </div>
          )}
          {active.body && (
            <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.5, textAlign: "center", marginBottom: active.ctaText ? 4 : 0 }}>
              {active.body}
            </div>
          )}
          {active.ctaText && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button type="button" style={{
                backgroundColor: "#FFD814",
                color: "#0F1111",
                border: "1px solid #FCD200",
                borderRadius: 20,
                padding: "7px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}>
                {active.ctaText}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Module-level body text */}
      {bodyText && (
        <div style={{ padding: "6px 16px 12px", textAlign: "center", fontSize: 14, color: "#565959", lineHeight: 1.4 }}>
          {bodyText}
        </div>
      )}
    </div>
  );
}

// ─── Single Image with Text preview ──────────────────────────────────────────

function SingleImageTextPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const spec = APLUS_MODULE_SPECS["single_image_text"];
  const imgSlot = spec.imageSlots[0];
  const dims = previewDevice === "mobile" && imgSlot.mobileSize ? imgSlot.mobileSize : imgSlot.desktopSize;
  const aspectRatio = dims.width / dims.height;

  const image = module.images.find((img) => img.driveFileId);
  const fileId = previewDevice === "mobile" && (image as Record<string, unknown>)?.mobileDriveFileId
    ? (image as Record<string, unknown>).mobileDriveFileId as string
    : image?.driveFileId ?? null;

  const subheadline = module.subheadlineText;
  const headline = module.headlineText;
  const body = module.bodyText;

  // textPosition: where text goes. Default "left" → image right
  const textPos = (module.textPosition as "left" | "right") || "left";
  const imageOnLeft = textPos === "right";

  const imageBlock = (
    <div style={{ lineHeight: 0, fontSize: 0 }}>
      {fileId ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/api/drive/file/${fileId}`} alt={image?.altText || "Module image"} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
      ) : (
        <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Image</span>
            <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
          </div>
        </div>
      )}
    </div>
  );

  const textBlock = (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px" }}>
      {subheadline && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#565959", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {subheadline}
        </div>
      )}
      {headline && (
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: 8 }}>
          {headline}
        </div>
      )}
      {body && (
        <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.5 }}>
          {body}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        cursor: onPin ? "crosshair" : "default",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        backgroundColor: "#ffffff",
      }}
      onClick={onPin}
    >
      {pins.map((pin) => (
        <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
      ))}
      {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

      {imageOnLeft ? <>{imageBlock}{textBlock}</> : <>{textBlock}{imageBlock}</>}
    </div>
  );
}

// ─── Technical Specifications preview ────────────────────────────────────────

function TechSpecsPreview({ module }: { module: AplusModuleWithImages }) {
  const headline = module.headlineText;
  const layout = (module as Record<string, unknown>).textPosition === "split" ? "split" : "full";

  // Read spec rows from image records
  const specImages = module.images
    .filter((img) => img.customLabel?.startsWith("spec_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const rows = specImages.map((img) => {
    const pd = (img.panelData ?? {}) as Record<string, string>;
    return { label: pd.spec_label ?? "", value: pd.spec_value ?? "" };
  }).filter((r) => r.label || r.value);

  if (rows.length === 0 && !headline) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#888c8c", fontSize: 13, backgroundColor: "#ffffff" }}>
        No specifications added yet
      </div>
    );
  }

  const renderTable = (tableRows: typeof rows) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <tbody>
        {tableRows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #e7e7e7" }}>
            <td style={{
              padding: "10px 16px",
              fontWeight: 700,
              color: "#0F1111",
              backgroundColor: i % 2 === 0 ? "#f7f8f8" : "#ffffff",
              width: "40%",
              verticalAlign: "top",
            }}>
              {row.label}
            </td>
            <td style={{
              padding: "10px 16px",
              color: "#565959",
              backgroundColor: i % 2 === 0 ? "#f7f8f8" : "#ffffff",
              lineHeight: 1.5,
              verticalAlign: "top",
            }}>
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ backgroundColor: "#ffffff" }}>
      {headline && (
        <div style={{ padding: "12px 16px 8px", textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.3 }}>
          {headline}
        </div>
      )}

      {rows.length > 0 && layout === "split" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", padding: "4px 16px 12px" }}>
          {renderTable(rows.slice(0, Math.ceil(rows.length / 2)))}
          {renderTable(rows.slice(Math.ceil(rows.length / 2)))}
        </div>
      ) : rows.length > 0 ? (
        <div style={{ padding: "4px 16px 12px" }}>
          {renderTable(rows)}
        </div>
      ) : null}
    </div>
  );
}

// ─── Premium Text preview ────────────────────────────────────────────────────

function TextPreview({ module }: { module: AplusModuleWithImages }) {
  const headline = module.headlineText;
  const body = module.bodyText;

  if (!headline && !body) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#888c8c", fontSize: 13, backgroundColor: "#ffffff" }}>
        No text content yet
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#ffffff", padding: "16px 24px" }}>
      {headline && (
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: body ? 10 : 0 }}>
          {headline}
        </div>
      )}
      {body && (
        <div style={{ fontSize: 14, color: "#565959", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {body}
        </div>
      )}
    </div>
  );
}

// ─── Video Image Carousel preview ────────────────────────────────────────────

function VideoImageCarouselPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const spec = APLUS_MODULE_SPECS["video_image_carousel"];
  const imgSpec = spec.repeatableGroup!.image!;
  const dims = previewDevice === "mobile" && imgSpec.mobileSize ? imgSpec.mobileSize : imgSpec.desktopSize;
  const aspectRatio = dims.width / dims.height;
  const [playingVideo, setPlayingVideo] = useState(false);

  const headlineText = (module as Record<string, unknown>).headlineText as string | null;

  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  // Each panel is one slide — may have image, video, or both
  const panels = panelImages.map((img) => {
    const pd = (img.panelData ?? {}) as Record<string, string>;
    const imageFileId = previewDevice === "mobile" && (img as Record<string, unknown>)?.mobileDriveFileId
      ? (img as Record<string, unknown>).mobileDriveFileId as string
      : img?.driveFileId ?? null;
    return {
      headline: pd.headline || "",
      subheadline: pd.subheadline || "",
      body: pd.body || "",
      imageFileId,
      videoDriveFileId: pd.videoDriveFileId || null,
      videoPreviewFileId: pd.videoPreviewDriveFileId || null,
    };
  });

  const totalSlides = panels.length;
  const activePanel = panels[activeSlide] ?? null;
  const panelHasVideo = !!activePanel?.videoDriveFileId;
  const panelHasImage = !!activePanel?.imageFileId;
  const showVideo = panelHasVideo;

  return (
    <div style={{ backgroundColor: "#ffffff" }}>
      {headlineText && (
        <div style={{ padding: "10px 16px 6px", textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.4 }}>
          {headlineText}
        </div>
      )}

      <div
        style={{ position: "relative", cursor: onPin ? "crosshair" : "default", lineHeight: 0, fontSize: 0 }}
        onClick={onPin}
      >
        {pins.map((pin) => (
          <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
        ))}
        {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

        {activePanel ? (
          showVideo ? (
            // Video panel
            activePanel.videoDriveFileId && playingVideo ? (
              <div style={{ position: "relative", width: "100%", backgroundColor: "#000" }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={`/api/drive/file/${activePanel.videoDriveFileId}`}
                  controls
                  autoPlay
                  style={{ width: "100%", display: "block" }}
                  onEnded={() => setPlayingVideo(false)}
                />
                <button type="button" onClick={(e) => { e.stopPropagation(); setPlayingVideo(false); }}
                  style={{ position: "absolute", top: 8, right: 8, zIndex: 5, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>
            ) : activePanel.videoPreviewFileId ? (
              <div style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/drive/file/${activePanel.videoPreviewFileId}`} alt="Video preview" style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
                {activePanel.videoDriveFileId && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 3 }}
                    onClick={(e) => { e.stopPropagation(); setPlayingVideo(true); }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.45)", border: "2px solid rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><polygon points="8,5 20,12 8,19" /></svg>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#1a1a2e" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#adb1b8" }}>Video</span>
                </div>
              </div>
            )
          ) : panelHasImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/drive/file/${activePanel.imageFileId}`} alt={activePanel.headline || `Panel ${activeSlide + 1}`} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
          ) : (
            <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#888c8c" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Panel {activeSlide + 1}</span>
                <span style={{ fontSize: 10, color: "#adb1b8" }}>{dims.width} x {dims.height}</span>
              </div>
            </div>
          )
        ) : (
          <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#f7f8f8" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#888c8c", fontSize: 13 }}>
              No panels yet
            </div>
          </div>
        )}

        {/* Arrows */}
        {totalSlides > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPlayingVideo(false); setActiveSlide((s) => (s - 1 + totalSlides) % totalSlides); }}
              style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4 }}>
              <ChevronLeft style={{ width: 16, height: 16, color: "#ffffff" }} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPlayingVideo(false); setActiveSlide((s) => (s + 1) % totalSlides); }}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(200,200,200,0.7)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 4 }}>
              <ChevronRight style={{ width: 16, height: 16, color: "#ffffff" }} />
            </button>
          </>
        )}
      </div>

      {/* Per-panel text */}
      {activePanel && (activePanel.headline || activePanel.subheadline || activePanel.body) && (
        <div style={{ padding: "12px 16px" }}>
          {activePanel.subheadline && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#565959", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {activePanel.subheadline}
            </div>
          )}
          {activePanel.headline && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: 6 }}>
              {activePanel.headline}
            </div>
          )}
          {activePanel.body && (
            <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.5 }}>
              {activePanel.body}
            </div>
          )}
        </div>
      )}

      {/* Dot indicators */}
      {totalSlides > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 5, padding: "4px 0 12px" }}>
          {Array.from({ length: totalSlides }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setPlayingVideo(false); setActiveSlide(i); }}
              style={{
                width: i === activeSlide ? 16 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: i === activeSlide ? "rgba(15,17,17,0.6)" : "rgba(15,17,17,0.2)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "width 0.2s, background-color 0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Video with Text preview ─────────────────────────────────────────────────

function VideoTextPreview({
  module,
  previewDevice,
  onPin,
  pins,
  pendingPin,
}: {
  module: AplusModuleWithImages;
  previewDevice: "desktop" | "mobile";
  onPin?: (e: React.MouseEvent<HTMLDivElement>) => void;
  pins: CommentPin[];
  pendingPin: PendingPin | null;
}) {
  const [playingVideo, setPlayingVideo] = useState(false);
  const spec = APLUS_MODULE_SPECS["video_text"];
  const videoSlot = spec.imageSlots[0];
  const dims = previewDevice === "mobile" && videoSlot.mobileSize ? videoSlot.mobileSize : videoSlot.desktopSize;
  const aspectRatio = dims.width / dims.height;

  const videoDriveFileId = (module as Record<string, unknown>).videoDriveFileId as string | null;
  const videoThumbnail = module.images.find((img) => img.customLabel === "video_thumbnail");
  const videoThumbFileId = videoThumbnail?.driveFileId ?? null;
  const videoOnLeft = (module as Record<string, unknown>).textPosition === "left";

  const subheadline = module.subheadlineText;
  const headline = module.headlineText;
  const body = module.bodyText;

  const isMobile = previewDevice === "mobile";

  const videoBlock = (
    <div style={{ lineHeight: 0, fontSize: 0, position: "relative" }}>
        {videoDriveFileId && playingVideo ? (
          <div style={{ position: "relative", width: "100%", backgroundColor: "#000" }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={`/api/drive/file/${videoDriveFileId}`}
              controls
              autoPlay
              style={{ width: "100%", display: "block" }}
              onEnded={() => setPlayingVideo(false)}
            />
            <button type="button" onClick={(e) => { e.stopPropagation(); setPlayingVideo(false); }}
              style={{ position: "absolute", top: 8, right: 8, zIndex: 5, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>
        ) : videoThumbFileId ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/drive/file/${videoThumbFileId}`} alt="Video thumbnail" style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
            {videoDriveFileId && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 3 }}
                onClick={(e) => { e.stopPropagation(); setPlayingVideo(true); }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.45)", border: "2px solid rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><polygon points="8,5 20,12 8,19" /></svg>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ width: "100%", paddingBottom: `${(1 / aspectRatio) * 100}%`, position: "relative", backgroundColor: "#1a1a2e" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#adb1b8" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Video</span>
              <span style={{ fontSize: 10 }}>{dims.width} x {dims.height}</span>
            </div>
          </div>
        )}
    </div>
  );

  const textBlock = (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px" }}>
      {subheadline && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#565959", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {subheadline}
        </div>
      )}
      {headline && (
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0F1111", lineHeight: 1.3, marginBottom: 8 }}>
          {headline}
        </div>
      )}
      {body && (
        <div style={{ fontSize: 13, color: "#565959", lineHeight: 1.5 }}>
          {body}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        cursor: onPin ? "crosshair" : "default",
        display: isMobile ? "block" : "grid",
        gridTemplateColumns: isMobile ? undefined : "1fr 1fr",
        backgroundColor: "#ffffff",
      }}
      onClick={onPin}
    >
      {pins.map((pin) => (
        <PinMarker key={pin.id} pinX={pin.pinX} pinY={pin.pinY} label={pin.commentNumber ?? undefined} isPending={false} isClient={pin.isClient} />
      ))}
      {pendingPin && <PinMarker pinX={pendingPin.pinX} pinY={pendingPin.pinY} isPending={true} />}

      {videoOnLeft ? <>{videoBlock}{textBlock}</> : <>{textBlock}{videoBlock}</>}
    </div>
  );
}

// ─── Pin marker for A+ comments ──────────────────────────────────────────────

function PinMarker({
  pinX,
  pinY,
  label,
  isPending,
  isClient = false,
}: {
  pinX: number;
  pinY: number;
  label?: number;
  isPending: boolean;
  isClient?: boolean;
}) {
  const color = isPending ? "#008296" : isClient ? "#2563eb" : "#EF4444";

  return (
    <div
      style={{
        position: "absolute",
        left: `${pinX}%`,
        top: `${pinY}%`,
        transform: "translate(-50%, -100%)",
        zIndex: 5,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: isPending ? 20 : 22,
          height: isPending ? 20 : 22,
          borderRadius: "50%",
          backgroundColor: color,
          border: isPending ? "2px dashed #ffffff" : "2px solid #ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          opacity: isPending ? 0.85 : 1,
        }}
      >
        {label != null && (
          <span
            style={{
              color: "#ffffff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `6px solid ${color}`,
          marginTop: -1,
        }}
      />
    </div>
  );
}
