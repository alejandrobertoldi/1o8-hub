/* eslint-disable react-doctor/no-long-transition-duration */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import React, { useEffect, useState } from "react";

interface AIGeneratingButtonProps {
  isGenerating: boolean;
  onClick: () => void;
  label: string;
  generatingLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const GENERATING_MESSAGES = [
  "Analyzing research data",
  "Building semantic context",
  "Applying COSMO relationships",
  "Optimizing for human voice",
  "Integrating keyword strategy",
  "Crafting content",
  "Applying brand guidelines",
  "Finalizing output",
];

// Claude asterisk logomark — exact match to the app icon
function ClaudeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.987 1C5.924 1 1 5.923 1 11.987 1 18.05 5.924 23 11.987 23 18.05 23 23 18.05 23 11.987 23 5.923 18.05 1 11.987 1zm.013 3.5c.46 0 .833.373.833.833v3.334a.833.833 0 0 1-1.666 0V5.333c0-.46.373-.833.833-.833zm5.196 2.304a.833.833 0 0 1 0 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179l2.357-2.357a.833.833 0 0 1 1.179 0zM5.804 6.804a.833.833 0 0 1 1.179 0l2.357 2.357a.833.833 0 1 1-1.179 1.179L5.804 7.983a.833.833 0 0 1 0-1.179zM4.5 11.154h3.334a.833.833 0 0 1 0 1.666H4.5a.833.833 0 0 1 0-1.666zm11.666 0H19.5a.833.833 0 0 1 0 1.666h-3.334a.833.833 0 0 1 0-1.666zm-3.023 3.189a.833.833 0 0 1 0 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179l2.357-2.357a.833.833 0 0 1 1.179 0zM9.34 14.34a.833.833 0 0 1 1.179 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179zm2.647 2.327a.833.833 0 0 1 .833.833V20.833a.833.833 0 0 1-1.666 0V17.5c0-.46.373-.833.833-.833z"/>
    </svg>
  );
}

export default function AIGeneratingButton({
  isGenerating,
  onClick,
  label,
  disabled = false,
  className = "",
  size = "md",
}: AIGeneratingButtonProps) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    if (!isGenerating) { setMsgIdx(0); setProgress(0); setDots(0); return; }
    const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length), 2600);
    const progressTimer = setInterval(() => setProgress(p => Math.min(p + Math.random() * 2.5, 92)), 350);
    const dotsTimer = setInterval(() => setDots(d => (d + 1) % 4), 450);
    return () => { clearInterval(msgTimer); clearInterval(progressTimer); clearInterval(dotsTimer); };
  }, [isGenerating]);

  const sizeClasses = size === "sm"
    ? "px-3.5 py-1.5 text-xs"
    : size === "lg"
    ? "px-8 py-3 text-sm"
    : "px-5 py-2.5 text-sm";

  // ── GENERATING STATE ──────────────────────────────────────
  if (isGenerating) {
    return (
      <div className={`relative rounded-xl overflow-hidden ${sizeClasses} ${className}`}
        style={{ background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)", minWidth: "220px" }}
      >
        {/* Animated progress fill */}
        <div
          className="absolute inset-0 transition-all duration-500 ease-out origin-left"
          style={{ background: "rgba(0,0,0,0.25)", transform: `scaleX(${1 - progress / 100})`, transformOrigin: "right" }}
        />
        {/* Sweep shimmer */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
            animation: "shimmer 1.6s ease-in-out infinite",
            backgroundSize: "200% 100%",
          }}
        />
        <div className="relative flex items-center justify-center gap-2.5">
          {/* Spinning Claude icon */}
          <ClaudeIcon className="size-4 shrink-0 text-white animate-spin" style={{ animationDuration: "2s" } as React.CSSProperties} />
          <div className="flex flex-col items-start leading-none">
            <span className="font-bold text-white text-[11px] uppercase tracking-wide">Claude is working</span>
            <span className="text-white/70 text-[10px] truncate max-w-[180px]">
              {GENERATING_MESSAGES[msgIdx]}{"·".repeat(dots + 1)}
            </span>
          </div>
          <span className="ml-auto font-mono text-white/60 text-[10px] shrink-0">{Math.round(progress)}%</span>
        </div>
      </div>
    );
  }

  // ── IDLE STATE ────────────────────────────────────────────
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex items-center gap-2.5 rounded-xl font-bold text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden ${sizeClasses} ${className}`}
      style={{ background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)" }}
    >
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-150" />
      <ClaudeIcon className="relative size-4 shrink-0 text-white group-hover:scale-110 transition-transform duration-150" />
      <span className="relative">{label}</span>
    </button>
  );
}
