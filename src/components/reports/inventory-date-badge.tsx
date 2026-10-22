/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
"use client";

import { useEffect, useState } from "react";
import { accentFor } from "./v2/primitives/chart-colors";
import { type Surface as SurfaceKind } from "./v2/primitives/palette";

interface ApiResponse {
  maxDate: string | null;
}

// Concrete hex, not CSS var() or Tailwind arbitrary values, so the pairing is
// unit-testable and the whole badge flips together. The portal renders on the
// light ghost canvas, so it needs a light pill with dark text; the hub keeps its
// dark pill with light text.
export function inventoryBadgeColors(surface: SurfaceKind): {
  accent: string;
  background: string;
  text: string;
} {
  return surface === "portal"
    ? { accent: accentFor("portal"), background: "#FEFEFE", text: "#2C2B35" }
    : { accent: accentFor("hub"), background: "#3C4043", text: "#FEFEFE" };
}

export function InventoryDateBadge({
  surface,
  accountId,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  refreshKey?: number;
}) {
  const [maxDate, setMaxDate] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;

    fetch(`/api/reports/inventory?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => setMaxDate(d.maxDate))
      .catch(() => {});
  }, [accountId, refreshKey]);

  if (!maxDate) return null;

  const colors = inventoryBadgeColors(surface);

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md border"
      style={{ borderColor: colors.accent, background: colors.background }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ color: colors.accent }}
      >
        Inventory Date Max
      </span>
      <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: colors.text }}>
        {maxDate}
      </span>
    </div>
  );
}
