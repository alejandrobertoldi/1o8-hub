"use client";

import type { ReactNode } from "react";

let current: ReactNode = null;
const listeners = new Set<() => void>();

export function setPageSubnav(node: ReactNode) {
  current = node;
  listeners.forEach(fn => fn());
}

export function clearPageSubnav() {
  current = null;
  listeners.forEach(fn => fn());
}

export function subscribePageSubnav(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPageSubnav(): ReactNode {
  return current;
}
