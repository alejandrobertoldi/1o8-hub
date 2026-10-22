/** Spring + clip-path math for the liquid-glass nav bead. */

export const OPAL_LEAD_K = 16;
export const OPAL_DAMP = 0.72;
export const OPAL_PAD_Y = 5;

export class Spring {
  x: number;
  v = 0;
  target: number;
  k: number;
  damp: number;

  constructor(k: number, damp: number, x = 0) {
    this.k = k;
    this.damp = damp;
    this.x = x;
    this.target = x;
  }

  snap(x: number) {
    this.x = x;
    this.target = x;
    this.v = 0;
  }

  step(dt: number) {
    const alpha = 1 - Math.exp(-this.k * dt);
    this.x += (this.target - this.x) * alpha;
    this.v = this.target - this.x;
    if (Math.abs(this.v) < 0.05) {
      this.x = this.target;
      this.v = 0;
    }
  }
}

export function beadSquash(currentWidth: number, restWidth: number): number {
  if (restWidth <= 0) return 1;
  const stretch = Math.max(currentWidth / restWidth, 0.01);
  return Math.min(1, Math.max(0.72, 1 / Math.sqrt(stretch)));
}

export function beadClipPath(
  left: number,
  right: number,
  trackWidth: number,
  padY = OPAL_PAD_Y,
): string {
  const l = Math.max(0, left);
  const r = Math.max(0, trackWidth - right);
  return `inset(${padY}px ${r}px ${padY}px ${l}px round 999px)`;
}

export function beadClipPathY(
  top: number,
  bottom: number,
  trackHeight: number,
  padX = OPAL_PAD_Y,
): string {
  const t = Math.max(0, top);
  const b = Math.max(0, trackHeight - bottom);
  return `inset(${t}px ${padX}px ${b}px ${padX}px round 999px)`;
}

export function faceClipPath(
  itemLeft: number,
  itemWidth: number,
  beadLeft: number,
  beadRight: number,
): string {
  const itemRight = itemLeft + itemWidth;
  if (beadRight <= itemLeft || beadLeft >= itemRight) {
    return "inset(0 100% 0 0)";
  }
  const clipL = Math.max(0, beadLeft - itemLeft);
  const clipR = Math.max(0, itemRight - beadRight);
  return `inset(0 ${clipR}px 0 ${clipL}px)`;
}

export function faceClipPathY(
  itemTop: number,
  itemHeight: number,
  beadTop: number,
  beadBottom: number,
): string {
  const itemBottom = itemTop + itemHeight;
  if (beadBottom <= itemTop || beadTop >= itemBottom) {
    return "inset(100% 0 0 0)";
  }
  const clipT = Math.max(0, beadTop - itemTop);
  const clipB = Math.max(0, itemBottom - beadBottom);
  return `inset(${clipT}px 0 ${clipB}px 0)`;
}

export type OpalItemRect = { left: number; width: number };

export function paintOpalBead(opts: {
  trackWidth: number;
  edgeL: number;
  edgeR: number;
  restWidth: number;
  items: OpalItemRect[];
  padY?: number;
  axis?: "x" | "y";
}): { beadClip: string; squash: number; faceClips: string[] } {
  const {
    trackWidth,
    edgeL,
    edgeR,
    restWidth,
    items,
    padY = OPAL_PAD_Y,
    axis = "x",
  } = opts;
  const span = edgeR - edgeL;
  if (axis === "y") {
    return {
      beadClip: beadClipPathY(edgeL, edgeR, trackWidth, padY),
      squash: beadSquash(span, restWidth),
      faceClips: items.map((item) =>
        faceClipPathY(item.left, item.width, edgeL, edgeR),
      ),
    };
  }
  return {
    beadClip: beadClipPath(edgeL, edgeR, trackWidth, padY),
    squash: beadSquash(span, restWidth),
    faceClips: items.map((item) =>
      faceClipPath(item.left, item.width, edgeL, edgeR),
    ),
  };
}

/** Hover steals the pill from the active page. Open menus keep it. */
export function pickOpalTarget(
  items: { hover?: boolean; open?: boolean; active?: boolean }[],
): number {
  const hover = items.findIndex((i) => i.hover);
  if (hover >= 0) return hover;
  const open = items.findIndex((i) => i.open);
  if (open >= 0) return open;
  return items.findIndex((i) => i.active);
}
