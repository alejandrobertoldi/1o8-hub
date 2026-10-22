/* eslint-disable react-doctor/rerender-defer-reads-hook */
/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/no-prevent-default */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageSquareText, UserPlus, ImagePlus, X as XIcon, Search, Rocket } from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { hasAdminPowers } from "@/lib/roles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SECTION_OPTIONS = [
  "Products",
  "A+ Content",
  "SEO Manager",
  "Amazon Sync",
  "Publishing",
  "Portal",
  "Reports / Export",
  "Admin",
  "Other",
];

function guessSection(pathname: string): string {
  if (pathname.startsWith("/products")) return "Products";
  if (pathname.startsWith("/aplus") || pathname.startsWith("/design/aplus2")) return "A+ Content";
  if (pathname.startsWith("/seo")) return "SEO Manager";
  if (pathname.startsWith("/amazon-sync")) return "Amazon Sync";
  if (pathname.startsWith("/publish")) return "Publishing";
  if (pathname.startsWith("/portal")) return "Portal";
  if (pathname.startsWith("/reports") || pathname.startsWith("/export")) return "Reports / Export";
  if (pathname.startsWith("/admin")) return "Admin";
  return "Other";
}

export function Header() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const pathname = usePathname();

  const [reportOpen, setReportOpen] = useState(false);
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const { data: pendingData } = useQuery({
    queryKey: ["pending-users-count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pending-users");
      return res.json() as Promise<{ count: number }>;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const pendingCount = pendingData?.count ?? 0;

  const { data: issuesData } = useQuery({
    queryKey: ["open-issues-count"],
    queryFn: async () => {
      const res = await fetch("/api/support?count=open");
      return res.json() as Promise<{ count: number }>;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const openIssues = issuesData?.count ?? 0;

  const reportMutation = useMutation({
    mutationFn: async (data: { section: string; description: string; screenshotUrl?: string }) => {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit report");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Feedback submitted — thank you!");
      setDescription("");
      setSection("");
      setScreenshot(null);
      setReportOpen(false);
    },
    onError: () => toast.error("Failed to submit feedback"),
  });

  return (
    <header className="shrink-0 z-40 flex h-14 items-center justify-between px-5 bg-background text-foreground">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="hidden md:flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Search className="size-3.5" />
          <span>Search…</span>
          <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && (
          <div
            className="hidden md:flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground bg-muted/50 text-xs font-mono"
            title={`Deploy: ${process.env.NEXT_PUBLIC_DEPLOY_URL_SLUG}\nCommit: ${process.env.NEXT_PUBLIC_DEPLOY_COMMIT}\nBuilt: ${process.env.NEXT_PUBLIC_BUILD_TIME}`}
          >
            <Rocket className="size-3" />
            <span className="text-muted-foreground/50">deploy</span>
            <span>{process.env.NEXT_PUBLIC_DEPLOY_URL_SLUG === "local" ? "local" : process.env.NEXT_PUBLIC_DEPLOY_URL_SLUG?.slice(0, 9)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/50">commit</span>
            <span>{process.env.NEXT_PUBLIC_DEPLOY_COMMIT}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/70">
              {process.env.NEXT_PUBLIC_BUILD_TIME
                ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : "—"}
            </span>
          </div>
        )}
        {isAdmin && openIssues > 0 && (
          <Link
            href="/admin/issues"
            className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors text-xs font-medium"
            title={`${openIssues} open feedback item${openIssues > 1 ? "s" : ""}`}
          >
            <MessageSquareText className="size-3.5" />
            <span>{openIssues} open</span>
          </Link>
        )}
        {isAdmin && pendingCount > 0 && (
          <Link
            href="/admin/users"
            className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-xs font-medium"
            title={`${pendingCount} pending access request${pendingCount > 1 ? "s" : ""}`}
          >
            <UserPlus className="size-3.5" />
            <span>{pendingCount} pending</span>
          </Link>
        )}
        <Dialog
          open={reportOpen}
          onOpenChange={(open) => {
            setReportOpen(open);
            if (open) setSection(guessSection(pathname));
          }}
        >
          <DialogTrigger asChild>
            <button
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Send feedback"
              aria-label="Send feedback"
            >
              <MessageSquareText className="size-4" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-brand" />
                Send Feedback
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!section || !description.trim()) return;
                reportMutation.mutate({
                  section,
                  description: description.trim(),
                  ...(screenshot ? { screenshotUrl: screenshot } : {}),
                });
              }}
              className="space-y-4 pt-2"
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Section
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <option value="">Select section…</option>
                  {SECTION_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Share your feedback, report a bug, or suggest an improvement…"
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
                />
              </div>
              {/* Screenshot */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Screenshot <span className="text-muted-foreground/60 font-normal">(optional — paste or upload)</span>
                </label>
                {screenshot ? (
                  <div className="relative rounded-md border border-border overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot} alt="Screenshot preview" className="w-full max-h-40 object-contain bg-muted/30" />
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      className="absolute top-1.5 right-1.5 rounded-full bg-background/80 p-1 hover:bg-background transition-colors"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onPaste={(e) => {
                      const file = Array.from(e.clipboardData.items)
                        .find((item) => item.type.startsWith("image/"))
                        ?.getAsFile();
                      if (file) handleFile(file);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFile(file);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    tabIndex={0}
                    className="flex items-center justify-center gap-2 h-20 rounded-md border border-dashed border-border text-muted-foreground hover:border-brand/50 hover:text-foreground cursor-pointer transition-colors text-xs"
                  >
                    <ImagePlus className="size-4" />
                    <span>Click, drag, or paste (Ctrl+V)</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!section || !description.trim() || reportMutation.isPending}
                  className="bg-brand-solid text-white hover:bg-brand-solid-hover"
                >
                  {reportMutation.isPending ? "Submitting…" : "Submit Report"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
