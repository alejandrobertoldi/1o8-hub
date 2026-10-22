/**
 * Oversized 1o8 "108" mark as a decorative background watermark for the auth screens.
 *
 * Charcoal-blue mark on the light Ghost White canvas; inverted to a white
 * silhouette in dark mode, where `--background` is itself Charcoal Blue and the
 * mark would otherwise be invisible. Purely decorative: hidden from assistive
 * tech and transparent to pointer events.
 *
 * The parent must be `relative overflow-hidden`, and any content that should sit
 * above the mark needs its own `relative z-10` (an absolutely positioned sibling
 * otherwise paints over in-flow content).
 */
export function BrandWatermark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- matches the raw <img> used at every other MF logo call site
    <img
      src="/1o8_Mark_Ink.png"
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute size-[min(88vh,88vw)] select-none object-contain opacity-[0.08] dark:opacity-[0.14] dark:brightness-0 dark:invert"
    />
  );
}
