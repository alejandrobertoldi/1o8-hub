/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, ChevronUp, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  APLUS_MODULE_SPECS,
  getModuleLayout,
  type TextFieldSpec,
  type AplusModuleType,
} from "@/lib/aplus-module-specs";

// ─── Re-exports for backward compatibility ───────────────────────
export {
  ProductFallbackCtx,
  ModuleNamingCtx,
  SetConfigCtx,
  patchModule,
  deleteModule,
  STATUS_OPTIONS,
  STATUS_COLORS,
} from "./module-card-types";
export type { AplusModuleCardProps } from "./module-card-types";

import {
  ProductFallbackCtx,
  ModuleNamingCtx,
  patchModule,
  deleteModule,
  STATUS_OPTIONS,
  STATUS_COLORS,
} from "./module-card-types";
import type {
  AplusModule,
  AplusModuleImage,
  AplusStatus,
  AplusModuleCardProps,
} from "./module-card-types";

// ─── Shared components ───────────────────────────────────────────
import { ModuleTextField, ImagePlaceholder } from "./module-card-shared";
import { VideoPlaceholder } from "./module-card-video";
import { RepeatableGroupSection } from "./module-card-panels";

// ─── Body components ─────────────────────────────────────────────
import { BackgroundImageTextBody } from "./bodies/background-image-text";
import { ComparisonTable1Body } from "./bodies/comparison-table-1";
import { ComparisonTable2Body } from "./bodies/comparison-table-2";
import { HotspotsBody } from "./bodies/hotspots";
import { TechSpecsBody } from "./bodies/tech-specs";
import { VideoTextBody } from "./bodies/video-text";
import { VideoImageCarouselBody } from "./bodies/video-image-carousel";
import { PremiumTextBody } from "./bodies/premium-text";
import { SingleImageTextBody } from "./bodies/single-image-text";
import { SimpleImageCarouselBody } from "./bodies/simple-image-carousel";
import { RegimenCarouselBody } from "./bodies/regimen-carousel";
import { NavigationCarouselBody } from "./bodies/navigation-carousel";
import { ImagesTextBody } from "./bodies/images-text";
import { QABody } from "./bodies/qa";

// ─── Main card ────────────────────────────────────────────────────

export function AplusModuleCard({
  module,
  productId,
  readOnly,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  productClientIdCode,
  productAsin,
  productName,
  productMarketplace,
  sortableProps,
}: AplusModuleCardProps) {
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState<AplusStatus>(
    module.status as AplusStatus
  );
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      patchModule(productId, module.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteModule(productId, module.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success("Module deleted");
      onDelete();
    },
    onError: () => {
      toast.error("Failed to delete module");
    },
  });

  const handleSaveField = async (key: string, value: string) => {
    const fieldSpec = spec.textFields.find((f) => f.key === key);
    if (fieldSpec?.maxLength && value.length > fieldSpec.maxLength) {
      toast.error(`${fieldSpec.label} exceeds ${fieldSpec.maxLength} character limit`);
      return;
    }
    await patchMutation.mutateAsync({ [key]: value });
  };

  const handleStatusChange = async (newStatus: AplusStatus) => {
    const prev = currentStatus;
    setCurrentStatus(newStatus);
    setStatusDropdownOpen(false);
    try {
      await patchMutation.mutateAsync({ status: newStatus });
      toast.success(`Status updated to ${newStatus.replace(/_/g, " ")}`);
    } catch {
      setCurrentStatus(prev);
      toast.error("Failed to update status");
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const handleDelete = () => setDeleteOpen(true);

  const spec = APLUS_MODULE_SPECS[module.moduleType];
  const layout = getModuleLayout(spec);

  const getFieldValue = (key: TextFieldSpec["key"]): string => {
    switch (key) {
      case "headlineText": return module.headlineText ?? "";
      case "subheadlineText": return module.subheadlineText ?? "";
      case "bodyText": return module.bodyText ?? "";
      case "overlayText": return module.overlayText ?? "";
    }
  };

  const getImage = (slotKey: string): AplusModuleImage | undefined => {
    const slotIdx = spec.imageSlots.findIndex((s) => s.key === slotKey);
    return module.images.find(
      (img) => img.customLabel === slotKey || img.imageSlot === slotIdx + 1
    );
  };

  const fallbackCtxValue = { clientIdCode: productClientIdCode, asin: productAsin, productName };
  const moduleNamingValue = {
    moduleType: module.moduleType as AplusModuleType,
    modulePosition: module.moduleNumber,
    marketplace: productMarketplace,
  };

  return (
    <ProductFallbackCtx.Provider value={fallbackCtxValue}>
    <ModuleNamingCtx.Provider value={moduleNamingValue}>
    <div
      ref={sortableProps?.setNodeRef}
      style={sortableProps?.style}
      {...(sortableProps?.attributes as React.HTMLAttributes<HTMLDivElement>)}
    >
      {/* Force light theme — Amazon SC card style */}
      <div
        style={{
          border: "1px solid #d5d9d9",
          borderRadius: "2px",
          overflow: "hidden",
          backgroundColor: "#ffffff",
          color: "#0F1111",
        }}
      >
        {/* ── Header bar (Amazon SC style) ─────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e7e7e7",
          }}
        >
          {/* Drag handle */}
          {sortableProps && (
            <button
              type="button"
              style={{ cursor: "grab", padding: "2px", color: "#888c8c", flexShrink: 0, background: "none", border: "none" }}
              {...(sortableProps.listeners as React.HTMLAttributes<HTMLButtonElement>)}
              aria-label="Drag to reorder"
            >
              <GripVertical style={{ width: "16px", height: "16px" }} />
            </button>
          )}

          <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            {spec.label}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Status dropdown */}
          {!readOnly && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                style={{
                  height: "28px",
                  padding: "0 28px 0 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: STATUS_COLORS[currentStatus].text,
                  backgroundColor: STATUS_COLORS[currentStatus].bg,
                  border: `1px solid ${STATUS_COLORS[currentStatus].border}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_OPTIONS.find((o) => o.value === currentStatus)?.label}
                <ChevronDown
                  style={{
                    width: "14px",
                    height: "14px",
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: STATUS_COLORS[currentStatus].text,
                  }}
                />
              </button>
              {statusDropdownOpen && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    onClick={() => setStatusDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: "2px",
                      backgroundColor: "#ffffff",
                      border: "1px solid #d5d9d9",
                      borderRadius: "4px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      zIndex: 50,
                      minWidth: "120px",
                    }}
                  >
                    {STATUS_OPTIONS.map((opt) => {
                      const optColors = STATUS_COLORS[opt.value];
                      const isActive = opt.value === currentStatus;
                      return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusChange(opt.value)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          textAlign: "left",
                          padding: "5px 10px",
                          fontSize: "12px",
                          backgroundColor: isActive ? "#f7f8fa" : "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f7f8fa";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: optColors.bg,
                            color: optColors.text,
                            border: `1px solid ${optColors.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt.label}
                        </span>
                      </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Move up/down + delete (SC style: simple icon buttons) */}
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || readOnly}
            aria-label="Move up"
            style={{
              background: "none",
              border: "none",
              cursor: isFirst || readOnly ? "default" : "pointer",
              color: isFirst || readOnly ? "#d5d9d9" : "#565959",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronUp style={{ width: "20px", height: "20px" }} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || readOnly}
            aria-label="Move down"
            style={{
              background: "none",
              border: "none",
              cursor: isLast || readOnly ? "default" : "pointer",
              color: isLast || readOnly ? "#d5d9d9" : "#565959",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronDown style={{ width: "20px", height: "20px" }} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending || readOnly}
            aria-label="Delete module"
            style={{
              background: "none",
              border: "none",
              cursor: readOnly ? "default" : "pointer",
              color: "#565959",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => { if (!readOnly) (e.currentTarget as HTMLButtonElement).style.color = "#d13212"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#565959"; }}
          >
            {deleteMutation.isPending ? (
              <Loader2 style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} />
            ) : (
              <X style={{ width: "20px", height: "20px" }} />
            )}
          </button>
        </div>

        {/* ── Body — type-specific or layout-driven ──────────── */}
        {module.moduleType === "background_image_text" ? (
          <BackgroundImageTextBody
            spec={spec as (typeof APLUS_MODULE_SPECS)["background_image_text"]}
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            onSaveOption={async (key, value) => { await patchMutation.mutateAsync({ [key]: value }); }}
            getImage={getImage}
          />
        ) : module.moduleType === "comparison_table_1" || module.moduleType === "comparison_table_3" ? (
          <ComparisonTable1Body
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : module.moduleType === "comparison_table_2" ? (
          <ComparisonTable2Body
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : module.moduleType === "hotspots_1" || module.moduleType === "hotspots_2" ? (
          <HotspotsBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : module.moduleType === "qa" ? (
          <QABody module={module} readOnly={readOnly} />
        ) : module.moduleType === "technical_specifications" ? (
          <TechSpecsBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
          />
        ) : module.moduleType === "video_image_carousel" ? (
          <VideoImageCarouselBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
          />
        ) : module.moduleType === "video_text" ? (
          <VideoTextBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
          />
        ) : module.moduleType === "text" ? (
          <PremiumTextBody
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
          />
        ) : module.moduleType === "single_image_text" ? (
          <SingleImageTextBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            onSaveOption={async (key, value) => { await patchMutation.mutateAsync({ [key]: value }); }}
            getImage={getImage}
          />
        ) : module.moduleType === "simple_image_carousel" ? (
          <SimpleImageCarouselBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : module.moduleType === "regimen_carousel" ? (
          <RegimenCarouselBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : module.moduleType === "navigation_carousel" ? (
          <NavigationCarouselBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getImage={getImage}
          />
        ) : module.moduleType === "dual_images_text" || module.moduleType === "four_images_text" ? (
          <ImagesTextBody
            module={module}
            productId={productId}
            readOnly={readOnly}
            getFieldValue={getFieldValue}
            onSaveField={handleSaveField}
            getImage={getImage}
          />
        ) : (
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {layout.map((item) => {
            switch (item.type) {
              case "textField": {
                const fieldSpec = spec.textFields.find((f) => f.key === item.fieldKey);
                if (!fieldSpec) return null;
                return (
                  <ModuleTextField
                    key={`tf-${item.fieldKey}`}
                    spec={fieldSpec}
                    value={getFieldValue(item.fieldKey)}
                    readOnly={readOnly}
                    onSave={handleSaveField}
                  />
                );
              }
              case "imageSlot": {
                const slotSpec = spec.imageSlots.find((s) => s.key === item.slotKey);
                if (!slotSpec) return null;
                // Use VideoPlaceholder for video modules' video slots
                if (spec.hasVideo && slotSpec.key.startsWith("video")) {
                  return (
                    <VideoPlaceholder
                      key={`vid-${item.slotKey}`}
                      slotSpec={slotSpec}
                      image={getImage(item.slotKey)}
                      productId={productId}
                      moduleId={module.id}
                      readOnly={readOnly}
                      videoDriveFileId={module.videoDriveFileId}
                      videoTitle={module.videoTitle}
                    />
                  );
                }
                return (
                  <ImagePlaceholder
                    key={`img-${item.slotKey}`}
                    slotSpec={slotSpec}
                    image={getImage(item.slotKey)}
                    productId={productId}
                    moduleId={module.id}
                    readOnly={readOnly}
                  />
                );
              }
              case "repeatableGroup": {
                if (!spec.repeatableGroup) return null;
                return (
                  <RepeatableGroupSection
                    key="repeatable"
                    spec={spec.repeatableGroup}
                    module={module}
                    productId={productId}
                    readOnly={readOnly}
                  />
                );
              }
              default:
                return null;
            }
          })}
        </div>
        )}
      </div>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
        title={`Delete Module ${module.moduleNumber}?`}
        description="This will permanently remove the module. This action cannot be undone."
        pending={deleteMutation.isPending}
        confirmLabel="Delete module"
      />
    </div>
    </ModuleNamingCtx.Provider>
    </ProductFallbackCtx.Provider>
  );
}
