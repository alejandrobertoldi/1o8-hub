/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useState, useEffect } from "react";

const PRICING = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  default: { input: 0.8, output: 4.0 },
};

interface AIUsage {
  input_tokens: number;
  output_tokens: number;
  model?: string;
}

interface AICostTrackerProps {
  isRunning: boolean;
  usage: AIUsage | null;
  startTime: number | null;
  error?: string;
}

export default function AICostTracker({ isRunning, usage, startTime, error }: AICostTrackerProps) {
  const estimateCost = (u: AIUsage): number => {
    const model = u.model || "default";
    const rates = PRICING[model as keyof typeof PRICING] || PRICING.default;
    return (u.input_tokens / 1_000_000) * rates.input + (u.output_tokens / 1_000_000) * rates.output;
  };

  if (isRunning) {
    return <RunningCostTimer startTime={startTime} />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-red-900/30 bg-red-950/20 px-4 py-2">
        <span className="inline-block size-2 rounded-full bg-red-400" />
        <span className="text-xs font-bold text-red-400">Failed</span>
      </div>
    );
  }

  if (usage) {
    const cost = estimateCost(usage);
    const totalTokens = usage.input_tokens + usage.output_tokens;

    return (
      <div className="flex items-center gap-4 rounded-full border border-border bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <svg className="size-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          <div className="text-[10px]">
            <span className="font-mono text-muted-foreground">{totalTokens.toLocaleString()}</span>
            <span className="text-muted-foreground/60"> tok</span>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground/60">
          {usage.input_tokens.toLocaleString()}↑ {usage.output_tokens.toLocaleString()}↓
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-emerald-400">${cost.toFixed(4)}</span>
        </div>
        <svg className="size-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
    );
  }

  return null;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function RunningCostTimer({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds(startTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(startTime));
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="flex items-center gap-3 rounded-full border border-amber-700/30 bg-amber-950/30 px-4 py-2">
      <span className="inline-block size-2 animate-pulse rounded-full bg-amber-500" />
      <div className="text-xs">
        <span className="font-bold text-amber-400">Processing</span>
        <span className="ml-2 font-mono text-muted-foreground">{formatTime(elapsed)}</span>
      </div>
    </div>
  );
}

function getElapsedSeconds(startTime: number | null) {
  return startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
}
