"use client";

import { useState } from "react";
import { clientLogoSrc } from "@/components/monthly-report/client-logo";

/** Client mark from /client-logos, falling back to the initial when no file exists. */
export function ClientMark({
  client,
  compact,
}: {
  client: { clientIdCode: string; clientName: string };
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = clientLogoSrc(client.clientIdCode);

  if (!src || failed) {
    return (
      <div className={`${compact ? "size-10 text-lg" : "size-16 text-2xl"} shrink-0 rounded-md bg-brand/10 flex items-center justify-center font-bold text-brand`}>
        {client.clientName.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className={`relative shrink-0 ${compact ? "h-10 w-20" : "h-16 w-full"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${client.clientName} logo`}
        className="absolute inset-0 h-full w-full object-contain invert dark:invert-0"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
