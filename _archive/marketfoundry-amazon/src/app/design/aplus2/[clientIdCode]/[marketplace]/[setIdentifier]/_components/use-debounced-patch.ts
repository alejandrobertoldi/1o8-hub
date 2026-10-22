"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Returns a `setField` that locally buffers a value, then PATCHes it via the
 * provided endpoint after `delay` ms of inactivity. Pending writes are
 * coalesced into one PATCH per field. */
export function useDebouncedPatch<T extends Record<string, unknown>>({
  endpoint, initial, delay = 600,
}: {
  endpoint: string;
  initial: T;
  delay?: number;
}) {
  const [values, setValues] = useState<T>(initial);
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    const payload = pending.current;
    pending.current = {};
    if (Object.keys(payload).length === 0) return;
    try {
      const r = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Save failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }, [endpoint]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); flush(); }, [flush]);

  return { values, setField, flush };
}
