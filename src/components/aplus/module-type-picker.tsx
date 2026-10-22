/* eslint-disable react-doctor/no-outline-none */
/* eslint-disable react-doctor/js-batch-dom-css */
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  APLUS_MODULE_SPECS,
  APLUS_MODULE_TYPES,
  type AplusModuleType,
} from "@/lib/aplus-module-specs";

interface ModuleTypePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: AplusModuleType) => void;
  slotNumber: number;
}

// Modules that show the "AI Ready" badge
const AI_READY_MODULES: AplusModuleType[] = [
  "background_image_text",
  "full_image",
  "single_image_text",
  "text",
];

export function ModuleTypePicker({
  open,
  onOpenChange,
  onSelect,
  slotNumber,
}: ModuleTypePickerProps) {
  const [search, setSearch] = useState("");

  const handleSelect = (type: AplusModuleType) => {
    onSelect(type);
    onOpenChange(false);
    setSearch("");
  };

  const filtered = APLUS_MODULE_TYPES.filter((type) => {
    if (!search.trim()) return true;
    const label = APLUS_MODULE_SPECS[type].label.toLowerCase();
    return label.includes(search.trim().toLowerCase());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: "1100px",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          backgroundColor: "#ffffff",
          border: "1px solid #e7e7e7",
        }}
      >
        <DialogHeader style={{ padding: "20px 24px 0", flexShrink: 0 }}>
          <DialogTitle style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111" }}>
            Add Module
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div style={{ padding: "12px 24px", flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #888c8c",
              borderRadius: "4px",
              outline: "none",
              color: "#0F1111",
              backgroundColor: "#ffffff",
            }}
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", alignItems: "start" }}>
            {filtered.map((type) => {
              const spec = APLUS_MODULE_SPECS[type];
              const isAiReady = AI_READY_MODULES.includes(type);

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleSelect(type)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#232f3e",
                    border: "1px solid #3b4859",
                    borderRadius: "8px",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 0,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#008296";
                    e.currentTarget.style.boxShadow = "0 0 0 1px #008296";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#3b4859";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Title bar */}
                  <div style={{
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff", lineHeight: 1.3 }}>
                      {spec.label}
                    </span>
                    {isAiReady && (
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#ffffff",
                        backgroundColor: "#2563eb",
                        borderRadius: "10px",
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}>
                        AI Ready
                      </span>
                    )}
                  </div>

                  {/* Preview image */}
                  <div style={{
                    width: "100%",
                    backgroundColor: "#f0f2f4",
                    overflow: "hidden",
                  }}>
                    <img
                      src={`/aplus/${type}.jpeg`}
                      alt={spec.label}
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid #e7e7e7",
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => { onOpenChange(false); setSearch(""); }}
            style={{
              padding: "6px 20px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#0F1111",
              backgroundColor: "#ffffff",
              border: "1px solid #888c8c",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
