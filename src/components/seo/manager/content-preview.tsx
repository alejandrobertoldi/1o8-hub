"use client";

interface ContentPreviewProps {
  preview: { title: string; bullet1: string; description: string } | null;
  phase: string;
}

export function ContentPreview({ preview, phase }: ContentPreviewProps) {
  if (!preview) {
    const phaseNum = parseInt(phase.replace("S", ""), 10);
    if (phaseNum < 6) {
      return (
        <div className="mt-3 text-[10px] text-muted-foreground/60 italic">
          No content yet &mdash; complete S6 to generate
        </div>
      );
    }
    return (
      <div className="mt-3">
        <div className="size-3/4 rounded bg-stone-100 dark:bg-zinc-800 animate-pulse mb-1.5" />
        <div className="h-3 w-1/2 rounded bg-stone-100 dark:bg-zinc-800 animate-pulse mb-1.5" />
        <div className="h-3 w-2/3 rounded bg-stone-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1">
      {preview.title && (
        <p className="text-xs text-foreground leading-snug">
          <span className="text-[10px] font-bold text-muted-foreground mr-1.5">Title:</span>
          <span className="line-clamp-1">{preview.title}</span>
        </p>
      )}
      {preview.bullet1 && (
        <p className="text-xs text-foreground/80 leading-snug">
          <span className="text-[10px] font-bold text-muted-foreground mr-1.5">B1:</span>
          <span className="line-clamp-1">{preview.bullet1}</span>
        </p>
      )}
      {preview.description && (
        <p className="text-xs text-foreground/70 leading-snug">
          <span className="text-[10px] font-bold text-muted-foreground mr-1.5">Desc:</span>
          <span className="line-clamp-1">{preview.description}</span>
        </p>
      )}
    </div>
  );
}
