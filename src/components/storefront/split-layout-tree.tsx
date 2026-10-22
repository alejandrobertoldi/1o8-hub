"use client";

import type { ReactNode } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { STOREFRONT_GUTTER_GAP_CLASS } from "@/lib/storefront/layout";
import {
  isSplitTile,
  splitLayoutAspect,
  splitLayoutTree,
  type SplitDevice,
  type SplitNode,
} from "@/lib/storefront/module-specs";

export function SplitLayoutFrame({
  layoutKey,
  className,
  gapClassName = STOREFRONT_GUTTER_GAP_CLASS,
  compact = false,
  intrinsic = false,
  device = "desktop",
  children,
}: {
  layoutKey: string | null | undefined;
  className?: string;
  gapClassName?: string;
  /** Fixed short height for the layout picker wireframes. */
  compact?: boolean;
  /**
   * Size the frame from tile images instead of a CSS aspect-ratio.
   * Used for Amazon-style 2-up (and other single-axis) tiles.
   */
  intrinsic?: boolean;
  device?: SplitDevice;
  children: (tileIndex: number) => ReactNode;
}) {
  const tree = splitLayoutTree(layoutKey, device);
  const lockAspect = !compact && !intrinsic;
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full",
        compact && (device === "mobile" ? "h-32" : "h-14"),
        className
      )}
      style={lockAspect ? { aspectRatio: splitLayoutAspect(layoutKey, device) } : undefined}
    >
      <SplitNodeView
        node={tree}
        gapClassName={gapClassName}
        intrinsic={intrinsic}
        renderTile={children}
      />
    </div>
  );
}

export function SplitDeviceToggle({
  value,
  onChange,
  disabled,
}: {
  value: SplitDevice;
  onChange: (device: SplitDevice) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-stone-200 dark:border-zinc-800 p-0.5 bg-card">
      {(["desktop", "mobile"] as const).map((device) => {
        const active = value === device;
        const Icon = device === "desktop" ? Monitor : Smartphone;
        return (
          <button
            key={device}
            type="button"
            disabled={disabled}
            onClick={() => onChange(device)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50",
              active
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3" />
            {device === "desktop" ? "Desktop" : "Mobile"}
          </button>
        );
      })}
    </div>
  );
}

function SplitNodeView({
  node,
  gapClassName,
  intrinsic,
  renderTile,
}: {
  node: SplitNode;
  gapClassName: string;
  intrinsic: boolean;
  renderTile: (tileIndex: number) => ReactNode;
}) {
  if (isSplitTile(node)) {
    return (
      <div className={cn("min-w-0 w-full", intrinsic ? "" : "h-full min-h-0")}>
        {renderTile(node.t)}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 w-full",
        intrinsic ? "items-stretch" : "min-h-0 h-full",
        node.dir === "col" ? "flex-row" : "flex-col",
        gapClassName
      )}
    >
      {node.children.map((child, i) => (
        <div
          key={i}
          className={cn("flex min-w-0", intrinsic ? "w-full" : "min-h-0")}
          style={{ flex: `${node.sizes[i]} 1 0` }}
        >
          <SplitNodeView
            node={child}
            gapClassName={gapClassName}
            intrinsic={intrinsic}
            renderTile={renderTile}
          />
        </div>
      ))}
    </div>
  );
}
