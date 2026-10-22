"use client";

interface QualitySparklineProps {
  /** Quality scores ordered newest → oldest. At least 2 needed to draw a line. */
  scores: number[];
  width?: number;
  height?: number;
}

/**
 * Tiny inline SVG sparkline for quality score trends.
 * Green when trend is up, red when down, amber when flat.
 */
export function QualitySparkline({
  scores,
  width = 64,
  height = 20,
}: QualitySparklineProps) {
  if (scores.length < 2) return null;

  // Reverse so oldest is first (left) and newest is last (right)
  const data = [...scores].reverse();
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 2;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = padY + ((max - val) / range) * (height - 2 * padY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trend = data[data.length - 1] - data[0];
  const color =
    trend > 2 ? "var(--color-emerald-500, #10b981)" :
    trend < -2 ? "var(--color-red-500, #ef4444)" :
    "var(--color-amber-500, #f59e0b)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
      aria-label={`Quality trend: ${data[0]} → ${data[data.length - 1]}`}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on the latest value */}
      <circle
        cx={width}
        cy={parseFloat(points[points.length - 1].split(",")[1])}
        r={2}
        fill={color}
      />
    </svg>
  );
}
