import type { ReactNode } from "react";
import type { CountryCode } from "@/lib/constants";
import { isCountryCode } from "@/lib/constants";

const FRAME =
  "h-[14px] w-[20px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-inset ring-black/15 dark:ring-white/20";

/** Plain rectangular SVG flags for the holiday calendars — no emoji. */
const FLAGS: Record<CountryCode, ReactNode> = {
  US: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="14" fill="#B22234" />
      <rect y="1.08" width="20" height="1.08" fill="#fff" />
      <rect y="3.23" width="20" height="1.08" fill="#fff" />
      <rect y="5.38" width="20" height="1.08" fill="#fff" />
      <rect y="7.54" width="20" height="1.08" fill="#fff" />
      <rect y="9.69" width="20" height="1.08" fill="#fff" />
      <rect y="11.85" width="20" height="1.08" fill="#fff" />
      <rect width="8" height="7.54" fill="#3C3B6E" />
    </svg>
  ),
  MX: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="14" fill="#fff" />
      <rect width="6.67" height="14" fill="#006847" />
      <rect x="13.33" width="6.67" height="14" fill="#CE1126" />
      <circle cx="10" cy="7" r="1.8" fill="#8C5A2B" />
      <path d="M8.3 8.2 Q10 9.6 11.7 8.2" stroke="#006847" strokeWidth="0.6" fill="none" />
    </svg>
  ),
  BO: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="4.67" fill="#D52B1E" />
      <rect y="4.67" width="20" height="4.67" fill="#F9E300" />
      <rect y="9.33" width="20" height="4.67" fill="#007934" />
    </svg>
  ),
  BR: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="14" fill="#009C3B" />
      <polygon points="10,1.6 18.2,7 10,12.4 1.8,7" fill="#FFDF00" />
      <circle cx="10" cy="7" r="3" fill="#002776" />
      <path d="M7.2 6.4 Q10 5.6 12.8 7.4" stroke="#fff" strokeWidth="0.5" fill="none" />
    </svg>
  ),
  PE: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="14" fill="#fff" />
      <rect width="6.67" height="14" fill="#D91023" />
      <rect x="13.33" width="6.67" height="14" fill="#D91023" />
    </svg>
  ),
  PH: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="7" fill="#0038A8" />
      <rect y="7" width="20" height="7" fill="#CE1126" />
      <polygon points="0,0 10,7 0,14" fill="#fff" />
      <circle cx="3.6" cy="7" r="1.1" fill="#FCD116" />
    </svg>
  ),
  TN: (
    <svg viewBox="0 0 20 14" className="size-full" aria-hidden="true">
      <rect width="20" height="14" fill="#E70013" />
      <circle cx="10" cy="7" r="3.6" fill="#fff" />
      <circle cx="10.4" cy="7" r="2.5" fill="#E70013" />
      <circle cx="11.1" cy="7" r="2" fill="#fff" />
      <polygon points="11.3,5.9 11.6,6.8 12.6,6.8 11.8,7.3 12.1,8.2 11.3,7.7 10.5,8.2 10.8,7.3 10,6.8 11,6.8" fill="#E70013" />
    </svg>
  ),
};

export function CountryFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  if (!isCountryCode(code)) return null;
  return (
    <span className={`${FRAME}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {FLAGS[code]}
    </span>
  );
}
