"use client";

import * as React from "react";
import { originFromRects, type MotionRect } from "@/lib/motion/fluid";

type TriggerOrigin = {
  setTriggerNode: (node: HTMLElement | null) => void;
  setContentNode: (node: HTMLElement | null) => void;
};

const TriggerOriginContext = React.createContext<TriggerOrigin | null>(null);

let lastPointer: { x: number; y: number } | null = null;

function rememberPointer(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY };
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", rememberPointer, true);
}

function pointerAsRect(): MotionRect | null {
  if (!lastPointer) return null;
  return { left: lastPointer.x, top: lastPointer.y, width: 0, height: 0 };
}

export function TriggerOriginProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const value = React.useMemo<TriggerOrigin>(
    () => ({
      setTriggerNode: (node) => {
        triggerRef.current = node;
      },
      setContentNode: (node) => {
        if (!node) return;
        node.style.transformOrigin = originFromRects(
          triggerRef.current?.getBoundingClientRect() ?? pointerAsRect(),
          node.getBoundingClientRect(),
        );
      },
    }),
    [],
  );

  return React.createElement(
    TriggerOriginContext.Provider,
    { value },
    children,
  );
}

function mergeNodeRef<T>(
  ours: ((node: T | null) => void) | undefined,
  theirs: React.Ref<T> | undefined,
) {
  return (node: T | null) => {
    ours?.(node);
    if (typeof theirs === "function") theirs(node);
    else if (theirs) (theirs as React.MutableRefObject<T | null>).current = node;
  };
}

export function useTriggerRef<T = HTMLElement>(
  ref?: React.Ref<T> | null,
): React.RefCallback<T> {
  const origin = React.useContext(TriggerOriginContext);
  return React.useMemo(
    () =>
      mergeNodeRef((node) => {
        origin?.setTriggerNode((node as HTMLElement | null) ?? null);
      }, ref ?? undefined),
    [origin, ref],
  );
}

export function useContentOriginRef<T = HTMLElement>(
  ref?: React.Ref<T> | null,
): React.RefCallback<T> {
  const origin = React.useContext(TriggerOriginContext);
  return React.useMemo(
    () =>
      mergeNodeRef((node) => {
        origin?.setContentNode((node as HTMLElement | null) ?? null);
      }, ref ?? undefined),
    [origin, ref],
  );
}
