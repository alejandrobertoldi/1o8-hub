"use client";

import { useEffect } from "react";

export function AutoPrint() {
  useEffect(() => {
    const target = document.querySelector("[data-report-ready]");
    if (!target) { window.print(); return; }
    // Wait for fonts/images to settle before printing
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
