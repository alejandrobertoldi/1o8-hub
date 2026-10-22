"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
import { ResponsiveContainer, LineChart, Line } from "recharts";

export function KpiSparkline({
  current,
  py,
  currentStroke,
  pyStroke,
}: {
  current: number[];
  py: number[];
  currentStroke: string;
  pyStroke: string;
}) {
  const data = current.map((c, i) => ({ current: c, py: py[i] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line type="monotone" dataKey="py" stroke={pyStroke} strokeWidth={1} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="current" stroke={currentStroke} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
