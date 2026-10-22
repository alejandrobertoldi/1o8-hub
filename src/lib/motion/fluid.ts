/** Apple fluid-interface math (WWDC Designing Fluid Interfaces), for the web. */

export const GESTURE_HYSTERESIS_PX = 10;

export function pastHysteresis(
  dx: number,
  dy: number,
  threshold = GESTURE_HYSTERESIS_PX,
): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/** Progressive resistance past a boundary. `dimension` is the axis length in px. */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  if (dimension <= 0) return 0;
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/**
 * Apple's exponential-decay projection (not v²/2a).
 * `initialVelocity` is px/s. `decelerationRate` ≈ 0.998 for scroll feel.
 */
export function project(
  initialVelocity: number,
  decelerationRate = 0.998,
): number {
  return (
    (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate)
  );
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

export function rubberbandRange(
  value: number,
  min: number,
  max: number,
  dimension: number,
): number {
  if (min > max) {
    const rest = (min + max) / 2;
    if (value < rest) return rest - rubberband(rest - value, dimension);
    if (value > rest) return rest + rubberband(value - rest, dimension);
    return rest;
  }
  if (value < min) return min - rubberband(min - value, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

export type MotionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Transform origin so a dialog/sheet grows from the trigger, not the center. */
export function originFromRects(
  trigger: MotionRect | null,
  content: MotionRect,
): string {
  if (!trigger) return "center center";
  const x = trigger.left + trigger.width / 2 - content.left;
  const y = trigger.top + trigger.height / 2 - content.top;
  return `${x}px ${y}px`;
}

export type PointerSample = { t: number; x: number; y: number };

export function velocityFromSamples(
  samples: PointerSample[],
): { x: number; y: number } {
  if (samples.length < 2) return { x: 0, y: 0 };
  const a = samples[samples.length - 2];
  const b = samples[samples.length - 1];
  const dt = Math.max(1, b.t - a.t) / 1000;
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

export function panLimits(
  content: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: { width: number; height: number },
  zoom: number,
  padding = 48,
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: padding - content.maxX * zoom,
    maxX: viewport.width - padding - content.minX * zoom,
    minY: padding - content.maxY * zoom,
    maxY: viewport.height - padding - content.minY * zoom,
  };
}

export function settlePan(
  current: { x: number; y: number },
  velocity: { x: number; y: number },
  limits: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number } {
  return {
    x: clamp(current.x + project(velocity.x), limits.minX, limits.maxX),
    y: clamp(current.y + project(velocity.y), limits.minY, limits.maxY),
  };
}

/** Critically damped step toward a target. k=16 ≈ Apple response 0.3–0.4. */
export function stepToward(
  current: number,
  target: number,
  dt: number,
  k = 16,
): number {
  const next = current + (target - current) * (1 - Math.exp(-k * dt));
  return Math.abs(next - target) < 0.4 ? target : next;
}
