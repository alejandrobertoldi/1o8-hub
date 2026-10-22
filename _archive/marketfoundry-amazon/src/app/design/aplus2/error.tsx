"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[aplus2] error:", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-6">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">A+2 failed to load</p>
      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Something went wrong. Please try again.</p>
      <Button onClick={reset} variant="outline" size="sm" className="mt-4">
        Try again
      </Button>
    </div>
  );
}
