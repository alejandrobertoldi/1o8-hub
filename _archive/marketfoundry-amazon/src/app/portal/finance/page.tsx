"use client";
/* eslint-disable react-doctor/react-compiler-destructure-method */

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Wallet, Calculator } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";

const FINANCE_SECTIONS = [
  {
    id: "finance-reports",
    title: "Finance Reports",
    description: "Track revenue, fees, ad spend pacing, and net proceeds.",
    icon: Wallet,
    href: "/portal/finance/reports",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    borderColor: "hover:border-cyan-500/30",
  },
  {
    id: "rev-calculator",
    title: "Rev Calculator",
    description: "Estimate revenue, margins, and profitability for your products.",
    icon: Calculator,
    href: "/portal/tools/rev-calculator",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    borderColor: "hover:border-emerald-500/30",
  },
] as const;

function FinanceLandingContent() {
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-8 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Finance Center"
          >
            <span className="font-bold text-sidebar-foreground">Finance</span>
            <span className="font-normal text-portal-accent">Center</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Financial reports, revenue tracking, and profitability tools.
          </p>
        </div>
      </PageMetaSlot>

      <Link
        href={`/portal${clientParam}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to portal
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {FINANCE_SECTIONS.map((section) => (
          <Link
            key={section.id}
            href={`${section.href}${clientParam}`}
            className={`group rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 ${section.borderColor}`}
          >
            <div className={`inline-flex items-center justify-center rounded-lg p-2.5 ${section.color}`}>
              <section.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {section.title}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              {section.description}
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
              View
              <ArrowRight className="size-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PortalFinance() {
  return (
    <Suspense>
      <FinanceLandingContent />
    </Suspense>
  );
}
