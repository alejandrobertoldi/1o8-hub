import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onOutsideClick` when a mousedown occurs outside `ref`.
 * Pass `enabled = false` to suspend listening.
 *
 * `extraRef` covers content rendered via `createPortal` elsewhere in the DOM
 * (e.g. `document.body`) that should still count as "inside" for this
 * purpose — a portal isn't a descendant of `ref`'s element, so `ref.contains`
 * alone would treat clicks in it as outside clicks.
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  onOutsideClick: () => void,
  enabled = true,
  extraRef?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (extraRef?.current && extraRef.current.contains(target)) return;
      onOutsideClick();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onOutsideClick, enabled, extraRef]);

  return ref;
}
