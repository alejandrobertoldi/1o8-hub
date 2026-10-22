"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { setPageMeta, clearPageMeta } from "./page-meta-store";
import { setPageSubnav, clearPageSubnav } from "./page-subnav-store";

export const PAGE_HEADER_SLOT_ID = "page-header-slot";
export const PAGE_META_SLOT_ID = "page-meta-slot";

function Slot({ slotId, children }: { slotId: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const target = document.getElementById(slotId);
  if (!target) return null;
  return createPortal(children, target);
}

export function PageHeaderSlot({ children }: { children: React.ReactNode }) {
  return <Slot slotId={PAGE_HEADER_SLOT_ID}>{children}</Slot>;
}

// No portal — publishes to the store; TopNav reads and renders directly.
// This avoids the React hydration mismatch that portals into #page-meta-slot trigger.
export function PageMetaSlot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setPageMeta(children);
    return () => clearPageMeta();
  }, [children]);
  return null;
}

/** Row 4 of TopNav — used by the monthly report TOC in place of the v2 report tabs. */
export function PageSubnavSlot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setPageSubnav(children);
    return () => clearPageSubnav();
  }, [children]);
  return null;
}
