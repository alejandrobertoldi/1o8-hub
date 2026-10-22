/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

// ═══════════════════════════════════════════════════════════════
// AI Cost Tracker — Shows token usage + estimated cost
// Place inline next to "Run AI" buttons
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";

// Sonnet pricing (per million tokens) as of Feb 2026
const PRICING = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  default: { input: 3.0, output: 15.0 },
};

interface AIUsage {
  input_tokens: number;
  output_tokens: number;
  model?: string;
}

interface AICostTrackerProps {
  isRunning: boolean;
  usage: AIUsage | null;
  startTime: number | null; // Date.now() when started
  error?: string;
}

export default function AICostTracker({ isRunning, usage, startTime, error }: AICostTrackerProps) {
  const [elapsed, setElapsed] = useState(0);

  // Live timer while running
  useEffect(() => {
    if (!isRunning || !startTime) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  // Calculate cost
  const estimateCost = (u: AIUsage): number => {
    const model = u.model || "default";
    const rates = PRICING[model as keyof typeof PRICING] || PRICING.default;
    return (u.input_tokens / 1_000_000) * rates.input + (u.output_tokens / 1_000_000) * rates.output;
  };

  // Running state
  if (isRunning) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-700/30 bg-brand-950/30 px-3 py-2">
        <span className="inline-block size-2 animate-pulse rounded-full bg-brand-500" />
        <div className="text-xs">
          <span className="font-bold text-brand-400">Processing</span>
          <span className="ml-2 font-mono text-zinc-500">{formatTime(elapsed)}</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2">
        <span className="inline-block size-2 rounded-full bg-accent-red" />
        <span className="text-xs font-bold text-accent-red">Failed</span>
      </div>
    );
  }

  // Completed with usage data
  if (usage) {
    const cost = estimateCost(usage);
    const totalTokens = usage.input_tokens + usage.output_tokens;

    return (
      <div className="flex items-center gap-4 rounded-lg border border-surface-4 bg-surface-2/50 px-3 py-2">
        {/* Tokens */}
        <div className="flex items-center gap-1.5">
          <svg className="size-3 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          <div className="text-[10px]">
            <span className="font-mono text-zinc-400">{totalTokens.toLocaleString()}</span>
            <span className="text-zinc-600"> tok</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="text-[9px] text-zinc-600">
          {usage.input_tokens.toLocaleString()}↑ {usage.output_tokens.toLocaleString()}↓
        </div>

        {/* Cost */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-accent-green">${cost.toFixed(4)}</span>
        </div>

        {/* Check mark */}
        <svg className="size-3.5 text-accent-green" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
    );
  }

  // No usage yet
  return null;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
