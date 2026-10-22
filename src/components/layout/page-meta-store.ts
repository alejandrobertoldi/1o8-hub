"use client";

import type { ReactNode } from "react";

let current: ReactNode = null;
const listeners = new Set<() => void>();

export function setPageMeta(node: ReactNode) {
  current = node;
  listeners.forEach(fn => fn());
}

export function clearPageMeta() {
  current = null;
  listeners.forEach(fn => fn());
}

export function subscribePageMeta(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPageMeta(): ReactNode {
  return current;
}
