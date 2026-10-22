"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
import { useState } from "react";
import { isHttpUrl } from "@/lib/avatars/url";

export function AvatarCircle({ name, image, size = 24 }: { name: string | null; image: string | null; size?: number }) {
  // Remember which URL failed so a new image prop gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return isHttpUrl(image) && failedSrc !== image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name ?? ""}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(image)}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-stone-300 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-white"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}
