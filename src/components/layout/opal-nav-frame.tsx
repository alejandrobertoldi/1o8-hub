"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { LucideIcon } from "lucide-react";
import { BetaPill } from "@/components/ui/beta-pill";
import {
  OPAL_DAMP,
  OPAL_LEAD_K,
  Spring,
  paintOpalBead,
  pickOpalTarget,
} from "./opal-nav";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useOpalBead(
  trackRef: RefObject<HTMLElement | null>,
  beadRef: RefObject<HTMLElement | null>,
  activeKey: string,
  opts?: { axis?: "x" | "y"; itemSelector?: string },
) {
  const axis = opts?.axis ?? "x";
  const itemSelector = opts?.itemSelector ?? "[data-opal-item]";

  useEffect(() => {
    const track = trackRef.current;
    const bead = beadRef.current;
    if (!track || !bead) return;

    const edgeL = new Spring(OPAL_LEAD_K, OPAL_DAMP);
    const edgeR = new Spring(OPAL_LEAD_K, OPAL_DAMP);
    let raf = 0;
    let inited = false;
    let restWidth = 0;
    let last = performance.now();
    let hoverEl: HTMLElement | null = null;
    const reduced = prefersReducedMotion();

    const measure = () => {
      const nodes = [...track.querySelectorAll<HTMLElement>(itemSelector)];
      if (nodes.length === 0) return null;
      const idx = pickOpalTarget(
        nodes.map((el) => ({
          hover: el === hoverEl,
          open: el.getAttribute("data-state") === "open",
          active: el.getAttribute("data-opal-active") === "true",
        })),
      );
      const target = idx >= 0 ? nodes[idx] : null;
      nodes.forEach((el, i) => {
        if (i === idx) el.setAttribute("data-opal-lit", "");
        else el.removeAttribute("data-opal-lit");
      });
      if (!target) return { kind: "hidden" as const, nodes };
      const t = track.getBoundingClientRect();
      const a = target.getBoundingClientRect();
      const start =
        axis === "y"
          ? a.top - t.top + track.scrollTop
          : a.left - t.left + track.scrollLeft;
      const end =
        axis === "y"
          ? a.bottom - t.top + track.scrollTop
          : a.right - t.left + track.scrollLeft;
      const trackSize = axis === "y" ? t.height : t.width;
      return {
        kind: "target" as const,
        left: start,
        right: end,
        width: end - start,
        trackWidth: trackSize,
        items: nodes.map((el) => {
          const r = el.getBoundingClientRect();
          const itemStart =
            axis === "y"
              ? r.top - t.top + track.scrollTop
              : r.left - t.left + track.scrollLeft;
          const itemSize = axis === "y" ? r.height : r.width;
          return { el, left: itemStart, width: itemSize };
        }),
      };
    };

    const paint = (
      left: number,
      right: number,
      rest: number,
      items: { el: HTMLElement; left: number; width: number }[],
      trackWidth: number,
    ) => {
      const painted = paintOpalBead({
        trackWidth,
        edgeL: left,
        edgeR: right,
        restWidth: rest,
        items,
        axis,
      });
      bead.style.clipPath = painted.beadClip;
      bead.style.opacity = "1";
      items.forEach((item, i) => {
        const on = item.el.querySelector<HTMLElement>(".opal-item__face--on");
        if (on) on.style.clipPath = painted.faceClips[i];
      });
    };

    const hide = (nodes: HTMLElement[]) => {
      bead.style.opacity = "0";
      nodes.forEach((el) => {
        el.removeAttribute("data-opal-lit");
        const on = el.querySelector<HTMLElement>(".opal-item__face--on");
        if (on) on.style.clipPath = axis === "y" ? "inset(100% 0 0 0)" : "inset(0 100% 0 0)";
      });
    };

    let lastTarget: {
      left: number;
      right: number;
      width: number;
      trackWidth: number;
      items: { el: HTMLElement; left: number; width: number }[];
    } | null = null;

    const applyTarget = (
      m: {
        left: number;
        right: number;
        width: number;
        trackWidth: number;
        items: { el: HTMLElement; left: number; width: number }[];
      },
      animate: boolean,
    ) => {
      lastTarget = m;
      restWidth = m.width;
      if (!inited || reduced || !animate) {
        edgeL.snap(m.left);
        edgeR.snap(m.right);
        inited = true;
        paint(m.left, m.right, m.width, m.items, m.trackWidth);
        return;
      }
      if (
        Math.abs(m.left - edgeL.target) < 0.5 &&
        Math.abs(m.right - edgeR.target) < 0.5
      ) {
        return;
      }
      edgeL.target = m.left;
      edgeR.target = m.right;
      edgeL.k = OPAL_LEAD_K;
      edgeR.k = OPAL_LEAD_K;
      kick();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      edgeL.step(dt);
      edgeR.step(dt);
      const m = lastTarget;
      if (!m) {
        raf = 0;
        return;
      }
      paint(edgeL.x, edgeR.x, restWidth || m.width, m.items, m.trackWidth);
      const settled =
        Math.abs(edgeL.v) < 0.05 &&
        Math.abs(edgeR.v) < 0.05 &&
        Math.abs(edgeL.x - edgeL.target) < 0.4 &&
        Math.abs(edgeR.x - edgeR.target) < 0.4;
      if (settled) {
        edgeL.snap(edgeL.target);
        edgeR.snap(edgeR.target);
        paint(edgeL.x, edgeR.x, restWidth || m.width, m.items, m.trackWidth);
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const retarget = (animate = true) => {
      const m = measure();
      if (!m || m.kind === "hidden") {
        hide(m?.nodes ?? []);
        return;
      }
      applyTarget(m, animate);
    };

    const onPointerOver = (e: PointerEvent) => {
      const item = (e.target as HTMLElement | null)?.closest?.(itemSelector);
      if (item instanceof HTMLElement && track.contains(item) && hoverEl !== item) {
        hoverEl = item;
        retarget();
      }
    };

    const onPointerOut = (e: PointerEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && track.contains(next)) {
        const still = next instanceof Element ? next.closest(itemSelector) : null;
        if (still && track.contains(still)) return;
      }
      if (hoverEl) {
        hoverEl = null;
        retarget();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const item = (e.target as HTMLElement | null)?.closest?.(itemSelector);
      if (item instanceof HTMLElement && track.contains(item) && hoverEl !== item) {
        hoverEl = item;
        retarget();
      }
    };

    const onResize = () => retarget(false);
    const onMutate = () => retarget(true);
    const ro = new ResizeObserver(onResize);
    ro.observe(track);
    const mo = new MutationObserver(onMutate);
    mo.observe(track, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ["data-opal-active", "data-state"],
    });
    track.addEventListener("pointerover", onPointerOver);
    track.addEventListener("pointerout", onPointerOut);
    track.addEventListener("focusin", onFocusIn);
    const boot = requestAnimationFrame(() => retarget(false));

    return () => {
      cancelAnimationFrame(boot);
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      track.removeEventListener("pointerover", onPointerOver);
      track.removeEventListener("pointerout", onPointerOut);
      track.removeEventListener("focusin", onFocusIn);
    };
  }, [activeKey, axis, beadRef, itemSelector, trackRef]);
}

export function OpalNavFrame({
  children,
  themeToggle,
  activeKey,
  tone = "hub",
}: {
  children: ReactNode;
  themeToggle?: ReactNode;
  activeKey: string;
  tone?: "hub" | "portal";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const beadRef = useRef<HTMLSpanElement>(null);
  useOpalBead(trackRef, beadRef, activeKey);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const track = trackRef.current;
    if (!track) return;
    const items = [...track.querySelectorAll<HTMLElement>("[data-opal-item]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }, []);

  return (
    <div
      ref={trackRef}
      className={tone === "portal" ? "opal-nav opal-nav--portal" : "opal-nav"}
      onKeyDown={onKeyDown}
    >
      <span ref={beadRef} className="opal-nav__bead" data-bead="" aria-hidden />
      {children}
      {themeToggle ? (
        <>
          <span className="opal-nav__sep" aria-hidden />
          <div className="opal-nav__theme">{themeToggle}</div>
        </>
      ) : null}
    </div>
  );
}

export function OpalItemInner({
  icon: Icon,
  label,
  align = "center",
  beta = false,
}: {
  icon: LucideIcon;
  label: string;
  align?: "center" | "start";
  beta?: boolean;
}) {
  const face = align === "start" ? "opal-item__face opal-item__face--start" : "opal-item__face";
  return (
    <>
      <span className={face}>
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="opal-item__label">{label}</span>
        {beta && <BetaPill />}
      </span>
      <span className={`${face} opal-item__face--on`} aria-hidden>
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="opal-item__label">{label}</span>
        {beta && <BetaPill />}
      </span>
    </>
  );
}

export function OpalMenu({
  children,
  activeKey,
  tone = "hub",
}: {
  children: ReactNode;
  activeKey: string;
  tone?: "hub" | "portal";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const beadRef = useRef<HTMLSpanElement>(null);
  useOpalBead(trackRef, beadRef, activeKey, {
    axis: "y",
    itemSelector: "[data-opal-option]",
  });

  return (
    <div
      ref={trackRef}
      className={tone === "portal" ? "opal-menu opal-nav--portal" : "opal-menu"}
    >
      <span ref={beadRef} className="opal-nav__bead" data-bead="" aria-hidden />
      {children}
    </div>
  );
}
