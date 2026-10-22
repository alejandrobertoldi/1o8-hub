/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { APLUS_MODULE_SPECS } from "@/lib/aplus-module-specs";
import { CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";

interface QAItem { id: string; question: string; answer: string; }

interface QABodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  readOnly: boolean;
}

export function QABody({ module, readOnly }: QABodyProps) {
  const queryClient = useQueryClient();
  const spec = APLUS_MODULE_SPECS["qa"];
  const rg = spec.repeatableGroup!;
  const qField = rg.fields.find(f => f.key === "question")!;
  const aField = rg.fields.find(f => f.key === "answer")!;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const isDark = theme === "dark";
  const bgColor = isDark ? "#0F1111" : "#ffffff";
  const labelColor = isDark ? "#ffffff" : "#0F1111";
  const deleteBtnBg = isDark ? "#232f3e" : "#ffffff";
  const deleteBtnBorder = isDark ? "#565959" : "#d5d9d9";
  const deleteBtnColor = isDark ? "#888c8c" : "#565959";
  const disabledDeleteColor = isDark ? "#3d4f5f" : "#d5d9d9";

  // Load initial Q&A items from DB (stored as image records with panelData)
  const getInitialItems = useCallback((): QAItem[] => {
    const qaImages = module.images
      .filter((img) => img.customLabel?.startsWith("qa_"))
      .sort((a, b) => a.imageSlot - b.imageSlot);
    if (qaImages.length > 0) {
      return qaImages.map((img, i) => {
        const pd = (img.panelData ?? {}) as Record<string, string>;
        return { id: img.id || `qa${i + 1}`, question: pd.question ?? "", answer: pd.answer ?? "" };
      });
    }
    // Default: 2 empty items
    return [
      { id: "qa1", question: "", answer: "" },
      { id: "qa2", question: "", answer: "" },
    ];
  }, [module.images]);

  const [items, setItems] = useState<QAItem[]>(getInitialItems);

  // Re-sync when images change
  useEffect(() => {
    setItems(getInitialItems());
  }, [getInitialItems]);

  // Persist all Q&A items to DB
  const saveItems = useCallback(async (itemsToSave: QAItem[]) => {
    setSaveState("saving");
    try {
      // Save each item as an image record with panelData
      for (let i = 0; i < itemsToSave.length; i++) {
        await fetch(`/api/aplus/${module.productId}/modules/${module.id}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageSlot: i + 1,
            customLabel: `qa_${i + 1}`,
            panelData: { question: itemsToSave[i].question, answer: itemsToSave[i].answer },
          }),
        });
      }
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      toast.error("Failed to save Q&A data");
    }
  }, [module.id, module.productId, queryClient]);

  const addItem = () => {
    if (items.length >= rg.maxItems) return;
    const newItems = [...items, { id: `qa-${Date.now()}`, question: "", answer: "" }];
    setItems(newItems);
    saveItems(newItems);
  };

  const removeItem = (idx: number) => {
    if (items.length <= rg.minItems) return;
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);
    saveItems(newItems);
  };

  const updateItem = (idx: number, field: "question" | "answer", value: string) => {
    const arr = [...items];
    arr[idx] = { ...arr[idx], [field]: value };
    setItems(arr);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "14px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
    resize: "vertical" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
          Questions and answers ({rg.maxItems} max / {rg.minItems} min)
        </span>
        {saveState === "saving" && <span style={{ fontSize: 11, color: "#888c8c" }}>Saving…</span>}
        {saveState === "saved" && <span style={{ fontSize: 11, color: "#067D62" }}>Saved</span>}
        {saveState === "error" && <span style={{ fontSize: 11, color: "#d13212" }}>Error</span>}
      </div>

      {/* Themed Q&A area */}
      <div style={{ backgroundColor: bgColor, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", gap: "8px" }}>
            {/* X delete */}
            <button
              type="button"
              onClick={() => removeItem(i)}
              disabled={items.length <= rg.minItems || readOnly}
              style={{
                width: "24px",
                height: "24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${deleteBtnBorder}`,
                borderRadius: "4px",
                backgroundColor: deleteBtnBg,
                color: items.length <= rg.minItems ? disabledDeleteColor : deleteBtnColor,
                cursor: items.length <= rg.minItems ? "default" : "pointer",
                flexShrink: 0,
                marginTop: "2px",
                padding: 0,
              }}
            >
              <X style={{ width: "12px", height: "12px" }} />
            </button>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Question */}
              <div>
                <label style={{ fontSize: "14px", fontWeight: 700, color: labelColor, display: "block", marginBottom: "6px" }}>
                  <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                  Question
                </label>
                <textarea
                  value={item.question}
                  onChange={(e) => updateItem(i, "question", e.target.value)}
                  onBlur={() => saveItems(items)}
                  placeholder="Enter question"
                  disabled={readOnly}
                  rows={2}
                  style={{
                    ...inputStyle,
                    border: `1px solid ${item.question.length > (qField.maxLength ?? 120) ? EXCEEDED_BORDER : "#888c8c"}`,
                  }}
                />
                <CharCounter length={item.question.length} max={qField.maxLength ?? 120} />
              </div>

              {/* Answer */}
              <div>
                <label style={{ fontSize: "14px", fontWeight: 700, color: labelColor, display: "block", marginBottom: "6px" }}>
                  <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                  Answer
                </label>
                <textarea
                  value={item.answer}
                  onChange={(e) => updateItem(i, "answer", e.target.value)}
                  onBlur={() => saveItems(items)}
                  placeholder="Enter answer"
                  disabled={readOnly}
                  rows={3}
                  style={{
                    ...inputStyle,
                    border: `1px solid ${item.answer.length > (aField.maxLength ?? 250) ? EXCEEDED_BORDER : "#888c8c"}`,
                  }}
                />
                <CharCounter length={item.answer.length} max={aField.maxLength ?? 250} />
              </div>
            </div>
          </div>
        ))}

        {/* + Add question */}
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= rg.maxItems || readOnly}
          style={{
            alignSelf: "flex-start",
            padding: "4px 14px",
            fontSize: "13px",
            fontWeight: 500,
            color: items.length >= rg.maxItems ? "#888c8c" : "#008296",
            backgroundColor: "#ffffff",
            border: `1px solid ${items.length >= rg.maxItems ? "#d5d9d9" : "#008296"}`,
            borderRadius: "3px",
            cursor: items.length >= rg.maxItems ? "default" : "pointer",
          }}
        >
          + Add question
        </button>
      </div>

      {/* Color switch (light/dark) */}
      <div style={{ display: "flex", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e7e7e7" }}>
        <button
          type="button"
          onClick={() => setTheme("light")}
          style={{
            width: "36px",
            height: "28px",
            border: theme === "light" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "3px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          onClick={() => setTheme("dark")}
          style={{
            width: "36px",
            height: "28px",
            border: theme === "dark" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "3px",
            backgroundColor: "#0F1111",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
