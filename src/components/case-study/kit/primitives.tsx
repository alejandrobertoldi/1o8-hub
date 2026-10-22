"use client";
import { createContext, useContext, type CSSProperties, type ReactNode, type JSX } from "react";
import type { DeckFormat } from "@/lib/case-study/kit/display";
import { splitMetric, fillTokens, monthShort } from "@/lib/case-study/kit/display";
import { printImageUrl } from "@/lib/case-study/kit/print-image-url";
import { resolveSlotImages, type SectionContent, type ImageSlotDef } from "@/lib/case-study/kit/slides";
import type { PulledMetrics, Derived } from "@/lib/case-study/kit/metrics";

export type SlideComponent = (props: { content: SectionContent; e: Partial<PulledMetrics>; d: Derived }) => JSX.Element;

export interface DeckCtx {
  format: DeckFormat; clientName: string; period: string; periodShort: string; contactEmail: string;
  editing: boolean; slideNo: number; slideTotal: number; tokens: Record<string, string>;
  /** Chrome-less print page (browser "Save as PDF"): Design images are served as ~1600px JPEGs. */
  print?: boolean;
}
export const DeckContext = createContext<DeckCtx>({
  format: "detailed", clientName: "", period: "", periodShort: "", contactEmail: "", editing: false, slideNo: 1, slideTotal: 1, tokens: {},
});
export const useDeck = () => useContext(DeckContext);
const pad = (n: number) => String(n).padStart(2, "0");

export function formatPeriod(start: string, end: string): string {
  const a = `${monthShort(start.slice(0, 7))} ${start.slice(0, 4)}`, b = `${monthShort(end.slice(0, 7))} ${end.slice(0, 4)}`;
  return a === b ? a : `${a} – ${b}`;
}
export function SlideShell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <section className={`slide ${className ?? ""}`} data-label={label}>{children}</section>;
}
export function Topbar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return <div className="topbar"><span>{left}</span>{right !== undefined && <span className="right">{right}</span>}</div>;
}
export function PageNo() { const d = useDeck(); return <>{`${pad(d.slideNo)} / ${pad(d.slideTotal)}`}</>; }
export function Bottombar() {
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="bottombar"><img className="mf-mark" src="/case-study/mf-mark.png" alt="market foundry" /><span><PageNo /></span></div>;
}
export function MissingChip({ label = "needs data" }: { label?: string }) {
  return useDeck().editing ? <span className="cs-missing">{label}</span> : null;
}
export function Val({ v, missing }: { v: string; missing?: boolean }) {
  const d = useDeck();
  if (missing && d.editing) return <MissingChip />;
  return <>{v}</>;
}
export function Metric({ value, unitClass = "unit", style, unitStyle }: { value: string; unitClass?: "pct" | "unit"; style?: CSSProperties; unitStyle?: CSSProperties }) {
  const { num, unit } = splitMetric(value);
  return <div className="metric" style={style}>{num}{unit && <span className={unitClass} style={unitStyle}>{unit}</span>}</div>;
}
export function Copy({ content, k }: { content: SectionContent; k: string }) {
  const d = useDeck();
  const raw = content.copy?.[k] ?? "";
  if (!raw.trim()) return d.editing ? <MissingChip label="add copy" /> : null;
  return <>{fillTokens(raw, d.tokens, d.format === "high_level")}</>;
}
export function SlotImage({ content, slot, style, radius = 10 }: { content: SectionContent; slot: ImageSlotDef; style?: CSSProperties; radius?: number }) {
  const d = useDeck();
  const { urls, source } = resolveSlotImages(content, slot.id);
  const s: CSSProperties = { borderRadius: radius, ...style };
  if (!urls.length) return <div className={`cs-slot empty`} style={s} data-slot={slot.id}>{d.editing && <span>{slot.label}</span>}</div>;
  return (
    <div className={`cs-slot fit-${slot.fit}`} style={s} data-slot={slot.id} data-source={source}>
      {source === "manual" && d.editing && <span className="cs-manual-tag">manual — not from Design</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {urls.map((u, i) => <img key={`${u}-${i}`} src={d.print ? printImageUrl(u) : u} alt="" loading="eager" />)}
    </div>
  );
}
