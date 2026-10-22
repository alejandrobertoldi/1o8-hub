/* eslint-disable react-doctor/design-no-vague-button-label */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { APLUS_MODULE_SPECS, type TextFieldSpec, type ImageSlotSpec } from "@/lib/aplus-module-specs";
import { ImagePlaceholder, ModuleTextField, CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER, patchModule } from "../module-card-types";

// ─── Comparison Table 1/3 — helpers ──────────────────────────────

/** Extract panelData from image row for a given product slot */
function ct1GetPanelData(module: AplusModule & { images: AplusModuleImage[] }, slotKey: string, slotIdx: number): Record<string, string> {
  const img = module.images.find(
    (im) => im.customLabel === slotKey || im.imageSlot === slotIdx + 1
  );
  return (img?.panelData ?? {}) as Record<string, string>;
}

/** Load metrics from module.overlayText JSON */
function ct1LoadMetrics(module: AplusModule, totalSlots: number, minMetrics: number): ComparisonMetric[] {
  try {
    const raw = (module as Record<string, unknown>).overlayText as string | null;
    if (raw) {
      const parsed = JSON.parse(raw) as { type: string; metric: string; description: string; values: string[] }[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m, i) => ({
          id: `m${i}`,
          type: (m.type === "text" ? "text" : "checkbox") as "checkbox" | "text",
          metric: m.metric ?? "",
          description: m.description ?? "",
          values: Array.from({ length: totalSlots }, (_, j) => m.values?.[j] ?? ""),
        }));
      }
    }
  } catch { /* ignore parse errors */ }
  return Array.from({ length: minMetrics }, (_, i) => ({
    id: `m${i}`,
    type: "checkbox" as const,
    metric: "",
    description: "",
    values: Array(totalSlots).fill(""),
  }));
}

// ─── Comparison Table 1 — custom body ────────────────────────────

interface ComparisonTable1BodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

interface ComparisonMetric {
  id: string;
  type: "checkbox" | "text";
  metric: string;
  description: string;
  values: string[];
}

export function ComparisonTable1Body({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  getImage,
}: ComparisonTable1BodyProps) {
  const moduleType = module.moduleType as "comparison_table_1" | "comparison_table_3";
  const spec = APLUS_MODULE_SPECS[moduleType];
  const queryClient = useQueryClient();
  const [showReviews, setShowReviews] = useState(true);
  const [showPrices, setShowPrices] = useState(true);
  const [showAddToCart, setShowAddToCart] = useState(true);
  const [descDialogIdx, setDescDialogIdx] = useState<number | null>(null);

  // Product columns: hero + comparison products
  const heroSlot = spec.imageSlots[0]; // hero_product
  const compSlots = spec.imageSlots.slice(1);
  const minComp = moduleType === "comparison_table_3" ? 2 : 3;
  const maxComp = compSlots.length;
  const maxMetrics = spec.repeatableGroup?.maxItems ?? 12;
  const minMetrics = spec.repeatableGroup?.minItems ?? 5;
  const totalProductSlots = spec.imageSlots.length; // hero + comparison

  // ── Load initial state from DB ──────────────────────────────
  const getInitialProductData = useCallback(() => {
    const hero = ct1GetPanelData(module, "hero_product", 0);
    const comps = compSlots.map((s, i) => ct1GetPanelData(module, s.key, i + 1));
    const storedCount = parseInt(hero.compCount ?? String(minComp), 10);
    return {
      heroTitle: hero.title ?? "",
      heroAsin: hero.asin ?? "",
      compTitles: comps.map(c => c.title ?? ""),
      compAsins: comps.map(c => c.asin ?? ""),
      compCount: Math.max(minComp, Math.min(maxComp, storedCount)),
    };
  }, [module, compSlots, minComp, maxComp]);

  const [heroTitle, setHeroTitle] = useState(() => getInitialProductData().heroTitle);
  const [heroAsin, setHeroAsin] = useState(() => getInitialProductData().heroAsin);
  const [compTitles, setCompTitles] = useState(() => getInitialProductData().compTitles);
  const [compAsins, setCompAsins] = useState(() => getInitialProductData().compAsins);
  const [compCount, setCompCount] = useState(() => getInitialProductData().compCount);
  const [metrics, setMetrics] = useState<ComparisonMetric[]>(() => ct1LoadMetrics(module, totalProductSlots, minMetrics));
  const [productSaveState, setProductSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const activeCompSlots = compSlots.slice(0, compCount);

  // Re-sync when module data changes (e.g. after image upload)
  useEffect(() => {
    const fresh = getInitialProductData();
    setHeroTitle(fresh.heroTitle);
    setHeroAsin(fresh.heroAsin);
    setCompTitles(fresh.compTitles);
    setCompAsins(fresh.compAsins);
    setCompCount(fresh.compCount);
    setMetrics(ct1LoadMetrics(module, totalProductSlots, minMetrics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.images]);

  // ── Save helpers ──────────────────────────────────────────────
  const saveProductSlot = useCallback(async (slotKey: string, slotIdx: number, data: Record<string, string>) => {
    setProductSaveState("saving");
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageSlot: slotIdx + 1, customLabel: slotKey, panelData: data }),
      });
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setProductSaveState("saved");
      setTimeout(() => setProductSaveState("idle"), 2000);
    } catch {
      setProductSaveState("error");
    }
  }, [productId, module.id, queryClient]);

  const saveMetricsToDb = useCallback(async (newMetrics: ComparisonMetric[]) => {
    const json = JSON.stringify(newMetrics.map(m => ({
      type: m.type, metric: m.metric, description: m.description, values: m.values,
    })));
    try {
      await patchModule(productId, module.id, { overlayText: json });
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
    } catch { /* silent */ }
  }, [productId, module.id, queryClient]);

  // Debounced metric save
  const metricTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMetricsDebounced = useCallback((newMetrics: ComparisonMetric[]) => {
    if (metricTimerRef.current) clearTimeout(metricTimerRef.current);
    metricTimerRef.current = setTimeout(() => saveMetricsToDb(newMetrics), 800);
  }, [saveMetricsToDb]);

  // Save hero on blur
  const saveHero = useCallback(() => {
    saveProductSlot("hero_product", 0, { title: heroTitle, asin: heroAsin, compCount: String(compCount) });
  }, [heroTitle, heroAsin, compCount, saveProductSlot]);

  // Save comparison product on blur
  const saveComp = useCallback((idx: number) => {
    const slot = compSlots[idx];
    saveProductSlot(slot.key, idx + 1, { title: compTitles[idx], asin: compAsins[idx] });
  }, [compTitles, compAsins, compSlots, saveProductSlot]);

  const updateCompAsin = (idx: number, val: string) => {
    const next = [...compAsins];
    next[idx] = val;
    setCompAsins(next);
  };
  const updateCompTitle = (idx: number, val: string) => {
    const next = [...compTitles];
    next[idx] = val;
    setCompTitles(next);
  };

  const addMetric = (type: "checkbox" | "text") => {
    if (metrics.length >= maxMetrics) return;
    const newMetrics = [...metrics, {
      id: `m${Date.now()}`,
      type,
      metric: "",
      description: "",
      values: Array(totalProductSlots).fill(""),
    }];
    setMetrics(newMetrics);
    saveMetricsDebounced(newMetrics);
  };

  const removeMetric = (idx: number) => {
    if (metrics.length <= minMetrics) return;
    const newMetrics = metrics.filter((_, i) => i !== idx);
    setMetrics(newMetrics);
    saveMetricsDebounced(newMetrics);
  };

  const moveMetric = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= metrics.length) return;
    const arr = [...metrics];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setMetrics(arr);
    saveMetricsDebounced(arr);
  };

  const updateMetric = (idx: number, field: "metric" | "description" | "type", value: string) => {
    const arr = [...metrics];
    if (field === "type") {
      arr[idx] = { ...arr[idx], type: value as "checkbox" | "text" };
    } else {
      arr[idx] = { ...arr[idx], [field]: value };
    }
    setMetrics(arr);
    saveMetricsDebounced(arr);
  };

  const updateMetricValue = (metricIdx: number, valIdx: number, value: string) => {
    const arr = [...metrics];
    arr[metricIdx] = { ...arr[metricIdx], values: [...arr[metricIdx].values] };
    arr[metricIdx].values[valIdx] = value;
    setMetrics(arr);
    saveMetricsDebounced(arr);
  };

  // Save compCount when it changes
  const handleCompCountChange = (newCount: number) => {
    setCompCount(newCount);
    // Persist compCount on the hero image panelData
    saveProductSlot("hero_product", 0, { title: heroTitle, asin: heroAsin, compCount: String(newCount) });
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "13px",
    padding: "5px 8px",
    width: "100%",
    outline: "none",
  };

  const iconBtnSmall: React.CSSProperties = {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d5d9d9",
    borderRadius: "4px",
    backgroundColor: "#ffffff",
    color: "#565959",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
  };

  const totalCols = 1 + compCount; // hero + comparison products

  const fieldBorder = (len: number, max: number): React.CSSProperties => ({
    ...inputStyle,
    border: `1px solid ${len > max ? EXCEEDED_BORDER : "#888c8c"}`,
  });

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Headline */}
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("headlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />

      {/* All product columns + checkboxes + metrics in one scroll container */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: `${totalCols * 172 + 1}px` }}>

          {/* ── Product column headers ────────────────────────── */}
          <div style={{ display: "flex", gap: "0" }}>
            {/* Left label area — empty above metrics */}
            <div style={{ minWidth: "172px", flex: "1 1 0", paddingRight: "12px" }} />
            <div style={{ width: "1px", flexShrink: 0, margin: "0 4px" }} />
            {/* Right: unified product grid headers */}
            <div style={{ flex: 1, paddingLeft: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalCols}, minmax(150px, 1fr))`, gap: "12px", marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111", display: "flex", alignItems: "center", gap: "8px" }}>
                  Hero Product
                  {productSaveState === "saving" && <span style={{ fontSize: 11, fontWeight: 400, color: "#888c8c" }}>Saving…</span>}
                  {productSaveState === "saved" && <span style={{ fontSize: 11, fontWeight: 400, color: "#067D62" }}>Saved</span>}
                  {productSaveState === "error" && <span style={{ fontSize: 11, fontWeight: 400, color: "#d13212" }}>Error</span>}
                </div>
                <div style={{ gridColumn: `span ${compCount}`, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111" }}>
                    Comparison Products ({maxComp} max / {minComp} min)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCompCountChange(Math.max(minComp, compCount - 1))}
                    disabled={compCount <= minComp || readOnly}
                    style={{ ...iconBtnSmall, fontSize: "14px", fontWeight: 700, opacity: compCount <= minComp ? 0.3 : 1 }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompCountChange(Math.min(maxComp, compCount + 1))}
                    disabled={compCount >= maxComp || readOnly}
                    style={{ ...iconBtnSmall, fontSize: "14px", fontWeight: 700, opacity: compCount >= maxComp ? 0.3 : 1 }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Product columns (unified grid) ────────────────── */}
          <div style={{ display: "flex", gap: "0" }}>
            <div style={{ minWidth: "172px", flex: "1 1 0", paddingRight: "12px" }} />
            <div style={{ width: "1px", backgroundColor: "#e7e7e7", flexShrink: 0, margin: "0 4px" }} />
            <div style={{ flex: 1, paddingLeft: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalCols}, minmax(150px, 1fr))`, gap: "12px" }}>
                {/* Hero product column */}
                <div>
                  <button
                    type="button"
                    style={{ ...iconBtnSmall, fontSize: "11px", width: "auto", padding: "0 10px", marginBottom: "8px" }}
                  >
                    Clear
                  </button>

                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                      <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Image
                    </label>
                    <ImagePlaceholder
                      slotSpec={heroSlot}
                      image={getImage(heroSlot.key)}
                      productId={productId}
                      moduleId={module.id}
                      readOnly={readOnly}
                    />
                  </div>

                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                      <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Title
                    </label>
                    <input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} onBlur={saveHero} placeholder="Enter title" disabled={readOnly} style={fieldBorder(heroTitle.length, 25)} />
                    <CharCounter length={heroTitle.length} max={25} />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                      <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>ASIN
                    </label>
                    <input value={heroAsin} onChange={(e) => setHeroAsin(e.target.value)} onBlur={saveHero} placeholder="Enter ASIN" disabled={readOnly} style={fieldBorder(heroAsin.length, 10)} />
                    <CharCounter length={heroAsin.length} max={10} />
                  </div>
                </div>

                {/* Comparison product columns */}
                {activeCompSlots.map((slot, i) => (
                  <div key={slot.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "8px" }}>
                      <button type="button" style={{ ...iconBtnSmall, fontSize: "11px", width: "auto", padding: "0 10px" }}>
                        Clear
                      </button>
                      <button type="button" style={iconBtnSmall} disabled={i === 0}>
                        <ChevronUp style={{ width: "12px", height: "12px", transform: "rotate(-90deg)" }} />
                      </button>
                      <button type="button" style={iconBtnSmall} disabled={i === activeCompSlots.length - 1}>
                        <ChevronUp style={{ width: "12px", height: "12px", transform: "rotate(90deg)" }} />
                      </button>
                    </div>

                    <div style={{ marginBottom: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                        {i < minComp && <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>}Image
                      </label>
                      <ImagePlaceholder
                        slotSpec={slot}
                        image={getImage(slot.key)}
                        productId={productId}
                        moduleId={module.id}
                        readOnly={readOnly}
                      />
                    </div>

                    <div style={{ marginBottom: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                        {i < minComp && <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>}Title
                      </label>
                      <input value={compTitles[i]} onChange={(e) => updateCompTitle(i, e.target.value)} onBlur={() => saveComp(i)} placeholder="Enter title" disabled={readOnly} style={fieldBorder(compTitles[i].length, 25)} />
                      <CharCounter length={compTitles[i].length} max={25} />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                        {i < minComp && <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>}ASIN
                      </label>
                      <input value={compAsins[i]} onChange={(e) => updateCompAsin(i, e.target.value)} onBlur={() => saveComp(i)} placeholder="Enter ASIN" disabled={readOnly} style={fieldBorder(compAsins[i].length, 10)} />
                      <CharCounter length={compAsins[i].length} max={10} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Show checkboxes ──────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e7e7e7" }}>
            {[
              { label: "Show reviews", checked: showReviews, set: setShowReviews },
              { label: "Show prices", checked: showPrices, set: setShowPrices },
              { label: "Show add to cart button", checked: showAddToCart, set: setShowAddToCart },
            ].map((opt) => (
              <label key={opt.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#0F1111", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => opt.set(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: "16px", height: "16px", accentColor: "#008296" }}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* ── Comparison Metrics — same flex layout as products ─ */}
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e7e7e7" }}>
            <div style={{ display: "flex", gap: "0", marginBottom: "12px" }}>
              <div style={{ minWidth: "172px", flex: "1 1 0", paddingRight: "12px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
                  Comparison Metrics ({spec.repeatableGroup!.maxItems} max / <span style={{ color: "#d13212" }}>{spec.repeatableGroup!.minItems} min</span>)
                </div>
              </div>
              <div style={{ width: "1px", flexShrink: 0, margin: "0 4px" }} />
              <div style={{ flex: 1, paddingLeft: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalCols}, minmax(150px, 1fr))`, gap: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111" }}>Hero</div>
                  {activeCompSlots.map((_, i) => (
                    <div key={i} style={{ fontSize: "12px", fontWeight: 500, color: "#565959" }}>Product {i + 1}</div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {metrics.map((m, mIdx) => (
                <div key={m.id} style={{ display: "flex", gap: "0" }}>
                  {/* Left: metric controls + name + hero value */}
                  <div style={{ minWidth: "172px", flex: "1 1 0", paddingRight: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                      <button type="button" style={iconBtnSmall} onClick={() => moveMetric(mIdx, -1)} disabled={mIdx === 0}>
                        <ChevronUp style={{ width: "12px", height: "12px" }} />
                      </button>
                      <button type="button" style={iconBtnSmall} onClick={() => moveMetric(mIdx, 1)} disabled={mIdx === metrics.length - 1}>
                        <ChevronDown style={{ width: "12px", height: "12px" }} />
                      </button>
                      <button
                        type="button"
                        style={{ ...iconBtnSmall, color: metrics.length <= minMetrics ? "#d5d9d9" : "#565959" }}
                        onClick={() => removeMetric(mIdx)}
                        disabled={metrics.length <= minMetrics}
                      >
                        <X style={{ width: "12px", height: "12px" }} />
                      </button>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", marginLeft: "4px" }}>
                        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Metric
                      </label>
                    </div>
                    <input
                      value={m.metric}
                      onChange={(e) => updateMetric(mIdx, "metric", e.target.value)}
                      placeholder="Enter metric"
                      disabled={readOnly}
                      style={fieldBorder(m.metric.length, 30)}
                    />
                    <CharCounter length={m.metric.length} max={30} />
                    <select
                      value={m.type}
                      onChange={(e) => updateMetric(mIdx, "type", e.target.value)}
                      disabled={readOnly}
                      style={{ ...inputStyle, cursor: "pointer", marginTop: "6px", fontSize: "12px" }}
                    >
                      <option value="checkbox">Checkbox</option>
                      <option value="text">Text</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setDescDialogIdx(mIdx)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#008296", marginTop: "4px", padding: 0 }}
                    >
                      Add metric description (optional)
                    </button>
                  </div>

                  <div style={{ width: "1px", flexShrink: 0, margin: "0 4px" }} />

                  {/* Right: hero value + comparison product values */}
                  <div style={{ flex: 1, paddingLeft: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalCols}, minmax(150px, 1fr))`, gap: "12px", alignItems: "start" }}>
                      {Array.from({ length: totalCols }).map((_, colIdx) => (
                        <div key={colIdx}>
                          {m.type === "checkbox" ? (
                            <select
                              value={m.values[colIdx] || "yes"}
                              onChange={(e) => updateMetricValue(mIdx, colIdx, e.target.value)}
                              disabled={readOnly}
                              style={{ ...inputStyle, cursor: "pointer" }}
                            >
                              <option value="yes">Checkbox: Yes</option>
                              <option value="no">Checkbox: No</option>
                            </select>
                          ) : (
                            <>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#565959", marginBottom: "4px" }}>Text</div>
                              <input
                                value={m.values[colIdx] || ""}
                                onChange={(e) => updateMetricValue(mIdx, colIdx, e.target.value)}
                                placeholder="Enter text"
                                disabled={readOnly}
                                style={fieldBorder((m.values[colIdx] || "").length, 30)}
                              />
                              <CharCounter length={(m.values[colIdx] || "").length} max={30} />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add metric buttons */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0F1111", marginBottom: "8px" }}>Add metric</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => addMetric("checkbox")}
                  disabled={metrics.length >= maxMetrics || readOnly}
                  style={{ padding: "4px 14px", fontSize: "13px", fontWeight: 500, color: "#008296", backgroundColor: "#ffffff", border: "1px solid #008296", borderRadius: "4px", cursor: metrics.length >= maxMetrics ? "default" : "pointer", opacity: metrics.length >= maxMetrics ? 0.5 : 1 }}
                >
                  Checkbox
                </button>
                <button
                  type="button"
                  onClick={() => addMetric("text")}
                  disabled={metrics.length >= maxMetrics || readOnly}
                  style={{ padding: "4px 14px", fontSize: "13px", fontWeight: 500, color: "#008296", backgroundColor: "#ffffff", border: "1px solid #008296", borderRadius: "4px", cursor: metrics.length >= maxMetrics ? "default" : "pointer", opacity: metrics.length >= maxMetrics ? 0.5 : 1 }}
                >
                  Text…
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Metric description dialog */}
      {descDialogIdx !== null && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setDescDialogIdx(null)} />
          <div style={{ position: "relative", backgroundColor: "#ffffff", color: "#0F1111", borderRadius: "8px", boxShadow: "0 4px 24px rgba(0,0,0,0.2)", width: "100%", maxWidth: "500px", padding: "24px", zIndex: 101 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0F1111", margin: 0 }}>
                Optional Metric Description (appears on hover)
              </h2>
              <button type="button" onClick={() => setDescDialogIdx(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}>
                <X style={{ width: "20px", height: "20px" }} />
              </button>
            </div>
            <input
              value={metrics[descDialogIdx]?.description ?? ""}
              onChange={(e) => updateMetric(descDialogIdx, "description", e.target.value)}
              placeholder="Enter your text"
              disabled={readOnly}
              maxLength={500}
              style={{ ...inputStyle, fontSize: "14px", padding: "8px 12px" }}
            />
            <CharCounter length={(metrics[descDialogIdx]?.description ?? "").length} max={500} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setDescDialogIdx(null)}
                style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 600, color: "#ffffff", backgroundColor: "#008296", border: "1px solid #008296", borderRadius: "4px", cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
