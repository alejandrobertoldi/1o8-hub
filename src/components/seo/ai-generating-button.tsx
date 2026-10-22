/* eslint-disable react-doctor/no-long-transition-duration */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface AIGeneratingButtonProps {
  isGenerating: boolean;
  onClick: () => void;
  label: string;
  generatingLabel?: string;
  messages?: string[];
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

export default function AIGeneratingButton({
  isGenerating,
  onClick,
  label,
  messages,
  disabled = false,
  className = "",
  size = "md",
}: AIGeneratingButtonProps) {
  const activeMessages = messages || GENERATING_MESSAGES;
  // DESIGN.md pills: default h-9 / 13px; sm and lg keep their relative sizes
  const sizeClasses = size === "sm"
    ? "h-8 px-3 text-xs"
    : size === "lg"
    ? "h-11 px-6 text-sm"
    : "h-9 px-4 text-[13px]";

  if (isGenerating) {
    return <GeneratingState activeMessages={activeMessages} sizeClasses={sizeClasses} className={className} />;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative inline-flex items-center gap-2 rounded-full font-medium leading-none text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden ${sizeClasses} ${className}`}
      style={{ background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)" }}
    >
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-150" />
      <Sparkles className="relative size-3.5 shrink-0 text-white" strokeWidth={1.75} />
      <span className="relative">{label}</span>
    </button>
  );
}

function GeneratingState({
  activeMessages,
  sizeClasses,
  className,
}: {
  activeMessages: string[];
  sizeClasses: string;
  className: string;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % activeMessages.length), 2600);
    const progressTimer = setInterval(() => setProgress(p => Math.min(p + Math.random() * 2.5, 92)), 350);
    const dotsTimer = setInterval(() => setDots(d => (d + 1) % 4), 450);
    return () => { clearInterval(msgTimer); clearInterval(progressTimer); clearInterval(dotsTimer); };
  }, [activeMessages.length]);

  return (
    <div className={`relative inline-flex items-center rounded-full overflow-hidden ${sizeClasses} ${className}`}
      style={{ background: "linear-gradient(135deg, #c84b31 0%, #e8602a 50%, #d4522e 100%)", minWidth: "280px", maxWidth: "360px" }}
    >
      <div
        className="absolute inset-0 transition-all duration-500 ease-out origin-left"
        style={{ background: "rgba(0,0,0,0.25)", transform: `scaleX(${1 - progress / 100})`, transformOrigin: "right" }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          animation: "shimmer 1.6s ease-in-out infinite",
          backgroundSize: "200% 100%",
        }}
      />
      <div className="relative flex items-center justify-center gap-2.5">
        <Loader2 className="size-3.5 shrink-0 text-white animate-spin" />
        <div className="flex flex-col items-start leading-none">
          <span className="font-bold text-white text-[11px] uppercase tracking-wide">AI is working</span>
          <span className="text-white/70 text-[10px] truncate max-w-[180px]">
            {activeMessages[msgIdx]}{"·".repeat(dots + 1)}
          </span>
        </div>
        <span className="ml-auto font-mono text-white/60 text-[10px] shrink-0">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
