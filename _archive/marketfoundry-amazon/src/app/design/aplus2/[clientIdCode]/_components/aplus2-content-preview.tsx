/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import {
  APLUS2_MODULE_SPECS,
  type Aplus2ModuleType,
} from "@/lib/aplus2/module-specs";
import type { ModuleDto } from "../[marketplace]/[setIdentifier]/_components/aplus2-module-editor";

type AssetDto = ModuleDto["assets"][number];
type ItemDto = ModuleDto["items"][number];
type Variant = "desktop" | "mobile";

const proxyUrl = (gid: string) =>
  `/api/aplus2/image?driveFileId=${encodeURIComponent(gid)}`;

/** Pick an image asset for a slot, preferring the requested variant and
 * falling back to desktop (mobile-only slots are rare; desktop-only common). */
function pickModuleImage(
  module: ModuleDto,
  slotKey: string,
  variant: Variant,
): AssetDto | undefined {
  const find = (v: Variant) =>
    module.assets.find(
      (a) =>
        a.kind === "image" &&
        a.slotKey === slotKey &&
        !a.moduleItemId &&
        a.variant === v,
    );
  return find(variant) ?? (variant === "mobile" ? find("desktop") : undefined);
}

function pickItemImage(
  module: ModuleDto,
  itemId: string,
  variant: Variant,
): AssetDto | undefined {
  const find = (v: Variant) =>
    module.assets.find(
      (a) => a.kind === "image" && a.moduleItemId === itemId && a.variant === v,
    );
  return find(variant) ?? (variant === "mobile" ? find("desktop") : undefined);
}

/** Ordered list of a module's top-level images (spec slot order). */
function moduleImages(
  module: ModuleDto,
  spec: (typeof APLUS2_MODULE_SPECS)[Aplus2ModuleType] | undefined,
  variant: Variant,
): AssetDto[] {
  if (!spec) return [];
  const out: AssetDto[] = [];
  for (const slot of spec.imageSlots) {
    const a = pickModuleImage(module, slot.key, variant);
    if (a) out.push(a);
  }
  return out;
}

// Item-data keys that read as a heading (rendered bold, first).
const PRIMARY_KEYS = new Set([
  "question", "headline", "caption", "title", "step_label", "spec_label",
  "metric", "feature", "tab_title", "headline_1", "headline_2", "headline_3",
  "subheadline",
]);
// Keys never rendered as visible copy.
const SKIP_KEYS = new Set(["type", "metric_type", "asin"]);

/** Render a repeatable item's text universally: primary keys bold, rest muted. */
function itemTextLines(data: Record<string, unknown>): { key: string; value: string; primary: boolean }[] {
  const entries = Object.entries(data)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => ({ key: k, value: v as string, primary: PRIMARY_KEYS.has(k) }));
  // Primary lines first, preserving insertion order within each group.
  return [...entries.filter((e) => e.primary), ...entries.filter((e) => !e.primary)];
}

function ImageBlock({ assets, alt }: { assets: AssetDto[]; alt: string }) {
  if (assets.length === 0) return null;
  const cols = assets.length === 1 ? 1 : assets.length <= 4 ? 2 : 3;
  return (
    <div
      className="grid gap-0"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {assets.map((a) => (
        <img
          key={a.id}
          src={proxyUrl(a.driveFileId)}
          alt={alt || a.filename}
          loading="lazy"
          className="block w-full h-auto object-contain"
        />
      ))}
    </div>
  );
}

/** Carousel modules render one slide (repeatable item) at a time, with a
 * side arrow on each edge and dot indicators below — like the real A+ widget. */
function ModuleCarousel({
  module,
  variant,
  itemImageKey,
}: {
  module: ModuleDto;
  variant: Variant;
  itemImageKey: string | undefined;
}) {
  const [idx, setIdx] = useState(0);
  const slides = module.items;
  const count = slides.length;
  if (count === 0) return null;
  const safe = idx % count;
  const slide = slides[safe];
  const img = itemImageKey ? pickItemImage(module, slide.id, variant) : undefined;
  const lines = itemTextLines(slide.data);
  const go = (d: number) => setIdx((i) => (i + d + count) % count);

  return (
    <div className="space-y-2">
      <div className="relative">
        {img ? (
          <img
            src={proxyUrl(img.driveFileId)}
            alt={lines[0]?.value ?? img.filename}
            loading="eager"
            className="block w-full h-auto object-contain"
          />
        ) : (
          <div className="min-h-16" />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex items-center justify-center size-8 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex items-center justify-center size-8 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="size-5" strokeWidth={1.75} />
            </button>
            <div
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5"
              role="tablist"
              aria-label={`${count} slides`}
            >
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === safe}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to slide ${i + 1} of ${count}`}
                  className={
                    i === safe
                      ? "h-1.5 w-4 rounded-full bg-white transition-all"
                      : "size-1.5 rounded-full bg-white/50 transition-all"
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      {lines.length > 0 && (
        <div className="space-y-1 px-1">
          {lines.map((l) => (
            <p
              key={l.key}
              className={
                l.primary
                  ? "text-xs font-semibold text-foreground"
                  : "text-xs text-muted-foreground whitespace-pre-line"
              }
            >
              {l.value}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function QaPreview({ items, variant }: { items: ItemDto[]; variant: Variant }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const isDesktop = variant === "desktop";
  const textSize = isDesktop ? "text-2xl" : "text-sm";
  const badgeSize = isDesktop ? "size-14 text-2xl" : "size-8 text-sm";
  const rowPad = isDesktop ? "px-6 py-5" : "px-4 py-3";
  const ansPad = isDesktop ? "px-6 pb-6" : "px-4 pb-4";
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const data = item.data as { type: string; question?: string; answer?: string };
        const isOpen = openIdx === i;
        return (
          <div key={item.id} className="border border-stone-200 dark:border-zinc-700 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className={`w-full flex items-center gap-3 ${rowPad} text-left`}
            >
              <span className={`shrink-0 flex items-center justify-center ${badgeSize} rounded bg-zinc-700 text-white font-bold`}>Q</span>
              <span className={`flex-1 ${textSize} font-semibold text-foreground leading-snug`}>{data.question}</span>
              <span className={`text-zinc-400 ${textSize}`}>{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && data.answer && (
              <div className={`flex items-start gap-3 ${ansPad}`}>
                <span className={`shrink-0 flex items-center justify-center ${badgeSize} rounded bg-orange-500 text-white font-bold`}>A</span>
                <p className={`${textSize} text-muted-foreground leading-relaxed`}>{data.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModulePreview({ module, variant }: { module: ModuleDto; variant: Variant }) {
  const spec = APLUS2_MODULE_SPECS[module.moduleType as Aplus2ModuleType];
  const isVideo = !!spec?.video;
  const images = moduleImages(module, spec, variant);
  const itemImageKey = spec?.repeatableGroup?.image?.key;
  const isCarousel = module.moduleType.includes("carousel");

  return (
    <div className="space-y-2">
      {module.subheadlineText && (
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {module.subheadlineText}
        </p>
      )}
      {module.headlineText && (
        <p className="text-sm font-bold text-foreground leading-snug">
          {module.headlineText}
        </p>
      )}

      {images.length > 0 && (
        <div className="relative">
          <ImageBlock assets={images} alt={module.altText ?? ""} />
          {isVideo && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex items-center justify-center size-12 rounded-full bg-black/55 text-white">
                <Play className="size-5 fill-white" />
              </span>
            </div>
          )}
        </div>
      )}

      {module.bodyText && (
        <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">
          {module.bodyText}
        </p>
      )}
      {module.overlayText && (
        <p className="text-xs italic text-muted-foreground">{module.overlayText}</p>
      )}

      {isVideo && module.videoTitle && (
        <div className="text-xs">
          <p className="font-semibold text-foreground">{module.videoTitle}</p>
          {module.videoDescription && (
            <p className="text-muted-foreground whitespace-pre-line">{module.videoDescription}</p>
          )}
        </div>
      )}

      {module.moduleType === "qa" && module.items.length > 0 && (
        <QaPreview items={module.items} variant={variant} />
      )}

      {module.moduleType !== "qa" && module.items.length > 0 &&
        (isCarousel ? (
          <ModuleCarousel module={module} variant={variant} itemImageKey={itemImageKey} />
        ) : (
          <div className="space-y-3 pt-1">
            {module.items.map((item: ItemDto) => {
              const img = itemImageKey ? pickItemImage(module, item.id, variant) : undefined;
              const lines = itemTextLines(item.data);
              if (!img && lines.length === 0) return null;
              return (
                <div
                  key={item.id}
                  className="space-y-1.5 rounded-md border border-stone-100 dark:border-zinc-800/60 p-2.5"
                >
                  {img && (
                    <img
                      src={proxyUrl(img.driveFileId)}
                      alt={lines[0]?.value ?? img.filename}
                      loading="lazy"
                      className="block w-full h-auto object-contain"
                    />
                  )}
                  {lines.map((l) => (
                    <p
                      key={l.key}
                      className={
                        l.primary
                          ? "text-xs font-semibold text-foreground"
                          : "text-xs text-muted-foreground whitespace-pre-line"
                      }
                    >
                      {l.value}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

/** Stacks every module of a version top-to-bottom for one device variant. */
export function Aplus2ContentPreview({
  modules,
  variant,
}: {
  modules: ModuleDto[];
  variant: Variant;
}) {
  if (modules.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No modules yet.
      </p>
    );
  }
  const ordered = [...modules].sort((a, b) => a.position - b.position);
  const preloadIds = Array.from(
    new Set(
      ordered.flatMap((m) =>
        m.assets.filter((a) => a.kind === "image").map((a) => a.driveFileId),
      ),
    ),
  );
  return (
    <div>
      {/* Preload every image in the set up-front so carousel slides and page
       * revisits render instantly (the proxy sets a long-lived browser cache). */}
      <div className="hidden" aria-hidden>
        {preloadIds.map((gid) => (
          <img key={gid} src={proxyUrl(gid)} alt="" loading="eager" />
        ))}
      </div>
      {ordered.map((m) => (
        <ModulePreview key={m.id} module={m} variant={variant} />
      ))}
    </div>
  );
}

const PA_PLUS_DESKTOP_WIDTH = 1464;

/** Scale a desktop A+ stack to the container width (Premium = 1464px). */
export function ScaledAplusPreview({
  modules,
  contentWidth = PA_PLUS_DESKTOP_WIDTH,
  variant = "desktop",
}: {
  modules: ModuleDto[];
  contentWidth?: number;
  variant?: Variant;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setZoom(width / contentWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentWidth]);

  return (
    <div ref={ref} className="w-full overflow-hidden bg-card">
      <div style={{ zoom, width: contentWidth }} className="pointer-events-none">
        <Aplus2ContentPreview modules={modules} variant={variant} />
      </div>
    </div>
  );
}
