/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useCallback } from "react";
import { MonitorPlay } from "lucide-react";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { ModuleTextField, RichTextToolbar } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { AddVideoDialog } from "../module-card-video";

interface VideoTextBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
}

export function VideoTextBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
}: VideoTextBodyProps) {
  const spec = APLUS_MODULE_SPECS["video_text"];
  const videoSlot = spec.imageSlots[0]; // video_thumbnail
  const [videoLayout, setVideoLayout] = useState<"right" | "left">(
    (module as Record<string, unknown>).textPosition === "left" ? "left" : "right"
  );
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);

  const saveVideoLayout = useCallback(async (layout: "right" | "left") => {
    setVideoLayout(layout);
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textPosition: layout }),
      });
    } catch { /* ignore */ }
  }, [productId, module.id]);

  const textColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", justifyContent: "center" }}>
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("subheadlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Headline
          </label>
        </div>
        <ModuleTextField
          spec={{ ...spec.textFields[1], label: "" }}
          value={getFieldValue("headlineText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Body text
        </label>
        <RichTextToolbar />
        <ModuleTextField
          spec={{ ...spec.textFields[2], label: "" }}
          value={getFieldValue("bodyText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>
    </div>
  );

  const hasVideo = !!module.videoDriveFileId;
  const videoColumn = (
    <div>
      <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
        Video
      </label>
      <button
        type="button"
        onClick={() => setVideoDialogOpen(true)}
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
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#047857" }}>Video uploaded</span>
            {module.videoTitle && <span style={{ fontSize: "13px", color: "#565959" }}>{module.videoTitle}</span>}
            <span style={{ fontSize: "12px", color: "#888c8c" }}>Click to replace</span>
          </>
        ) : (
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#008296", letterSpacing: "0.5px" }}>
            ADD VIDEO
          </span>
        )}
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
        {videoLayout === "right" ? (
          <>{textColumn}{videoColumn}</>
        ) : (
          <>{videoColumn}{textColumn}</>
        )}
      </div>

      {/* Layout toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e7e7e7" }}>
        <button
          type="button"
          onClick={() => saveVideoLayout("right")}
          style={{
            width: "48px",
            height: "32px",
            border: videoLayout === "right" ? "2px solid #008296" : "1px solid #d5d9d9",
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
          onClick={() => saveVideoLayout("left")}
          style={{
            width: "48px",
            height: "32px",
            border: videoLayout === "left" ? "2px solid #008296" : "1px solid #d5d9d9",
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

      <AddVideoDialog
        open={videoDialogOpen}
        onClose={() => setVideoDialogOpen(false)}
        readOnly={readOnly}
        productId={productId}
        moduleId={module.id}
        videoThumbnailImageId={module.images.find((img) => img.customLabel === "video_thumbnail")?.id}
      />
    </div>
  );
}
