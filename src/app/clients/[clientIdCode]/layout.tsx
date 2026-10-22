"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

// Top-level client tabs. "Client Settings" groups the per-client configuration
// pages (SETTINGS_TABS) behind one tab with its own sub-navigation.
const TABS = [
  { label: "Overview", href: "" },
  { label: "Client Settings", href: "/settings" },
  { label: "Case Study", href: "/case-study" },
] as const;

const SETTINGS_TABS = [
  { label: "Website & Social", href: "/web-social" },
  { label: "Brand Voice", href: "/brand-voice" },
  { label: "Brand Guidelines", href: "/brand-guidelines" },
] as const;

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { clientIdCode } = useParams<{ clientIdCode: string }>();
  const pathname = usePathname();
  const base = `/clients/${clientIdCode}`;

  // Timeline pins its controls + Gantt header and scrolls only the task rows,
  // so it needs the full-height chain from <main> to stay unbroken here.
  const isTimeline = pathname.startsWith(`${base}/timeline`);
  // Hide tabs on pages that have their own navigation
  const hideTabs = pathname.startsWith(`${base}/onboarding`) || isTimeline;
  const inSettings =
    pathname.startsWith(`${base}/settings`) || SETTINGS_TABS.some((t) => pathname.startsWith(`${base}${t.href}`));

  return (
    <div className={`flex flex-col gap-0 ${isTimeline ? "h-full min-h-0" : ""}`}>
      {!hideTabs && <nav className="border-b flex gap-1 px-4">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const isActive =
            tab.href === ""
              ? pathname === base || pathname === `${base}/`
              : tab.href === "/settings"
                ? inSettings
                : pathname.startsWith(href);

          return (
            <Link
              key={tab.href}
              href={href}
              className={`px-4 py-2 text-sm rounded-t transition-colors ${
                isActive
                  ? "bg-card text-foreground border-b-2 border-brand font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>}
      {!hideTabs && inSettings && (
        <nav className="flex gap-2 px-4 pt-3" aria-label="Client settings">
          {SETTINGS_TABS.map((tab) => {
            const href = `${base}${tab.href}`;
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={tab.href}
                href={href}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-brand text-brand-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
