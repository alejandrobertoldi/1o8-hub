/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/js-combine-iterations */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { hasAdminPowers } from "@/lib/roles";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Package,
  Users,
  Search,
  LayoutTemplate,
  DollarSign,
  GitCompare,
  BarChart3,
  CalendarDays,
  Activity,
  Shield,
  Sparkles,
  FileSpreadsheet,
  Clock,
  Tags,
  KeyRound,
  Percent,
  type LucideIcon,
  Handshake,
} from "lucide-react";

type SearchResults = {
  products: Array<{
    id: string;
    asin: string | null;
    sku: string | null;
    itemName: string | null;
    summarizedTitle: string | null;
    clientIdCode: string | null;
    mainImageUrl: string | null;
  }>;
  clients: Array<{
    id: number;
    clientIdCode: string;
    clientName: string | null;
    clientStatus: string;
  }>;
  seoProjects: Array<{
    id: string;
    name: string;
    status: string;
    currentPhase: string;
    clientIdCode: string | null;
  }>;
};

type NavCmd = { label: string; href: string; icon: LucideIcon; admin?: boolean; superAdmin?: boolean };

const NAV_ITEMS: NavCmd[] = [
  { label: "Client Summary", href: "/clients", icon: Users },
  { label: "Team", href: "/team", icon: Users },
  { label: "Team assignments", href: "/team/assignments", icon: Users },
  { label: "Team readiness", href: "/team/readiness", icon: Users },
  { label: "Blog Writer", href: "/seo/blog-writer", icon: Search },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Email send dates", href: "/email/send-dates", icon: CalendarDays },
  { label: "Paid media campaign calendar", href: "/paid-media/campaigns", icon: CalendarDays },
  { label: "Web launch calendar", href: "/web/launches", icon: CalendarDays },
  { label: "My timesheet", href: "/hours", icon: Clock },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Shared Logins", href: "/admin/logins", icon: KeyRound },
  { label: "Service providers", href: "/admin/service-providers", icon: Handshake, admin: true },
  { label: "AAC sheet sync", href: "/admin/aac-sync", icon: Handshake, admin: true },
  { label: "AI Config", href: "/admin/ai", icon: Sparkles, admin: true },
  { label: "Team Management", href: "/admin/users", icon: Shield, admin: true },
  { label: "Hours insights", href: "/hours/insights", icon: BarChart3, admin: true },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setResults(await res.json());
        }
      } catch {
        // silently fail — user sees empty state
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setResults(null);
      router.push(href);
    },
    [router]
  );

  const hasResults =
    results &&
    (results.products.length > 0 ||
      results.clients.length > 0 ||
      results.seoProjects.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery("");
          setResults(null);
        }
      }}
      title="Search 1o8 Hub"
      description="Search products, clients, SEO projects, or navigate to a page."
    >
      <CommandInput
        placeholder="Search products, clients, pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching…
          </div>
        )}

        {!loading && query.length >= 2 && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {/* Search results */}
        {results && results.products.length > 0 && (
          <CommandGroup heading="Products">
            {results.products.map((p) => (
              <CommandItem
                key={p.id}
                value={`product-${p.asin}-${p.sku}-${p.itemName}`}
                onSelect={() => navigate(`/products/${p.id}`)}
              >
                {p.mainImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.mainImageUrl}
                    alt=""
                    className="size-6 rounded object-cover shrink-0"
                  />
                ) : (
                  <Package className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">
                    {p.summarizedTitle || p.itemName || p.asin || "Untitled"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {[p.asin, p.sku, p.clientIdCode].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.clients.length > 0 && (
          <CommandGroup heading="Clients">
            {results.clients.map((c) => (
              <CommandItem
                key={c.id}
                value={`client-${c.clientIdCode}-${c.clientName}`}
                onSelect={() => navigate(`/clients/${c.clientIdCode}`)}
              >
                <Users className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">
                    {c.clientName || c.clientIdCode}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.clientIdCode} · {c.clientStatus}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.seoProjects.length > 0 && (
          <CommandGroup heading="SEO Projects">
            {results.seoProjects.map((s) => (
              <CommandItem
                key={s.id}
                value={`seo-${s.name}-${s.clientIdCode}`}
                onSelect={() => navigate(`/seo/${s.id}`)}
              >
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.currentPhase} · {s.status}
                    {s.clientIdCode ? ` · ${s.clientIdCode}` : ""}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Navigation — always shown */}
        {(!query || query.length < 2) && (
          <>
            <CommandGroup heading="Navigate">
              {NAV_ITEMS.filter((item) => (!item.admin || isAdmin) && (!item.superAdmin || isSuperAdmin)).map(
                (item) => (
                  <CommandItem
                    key={item.href}
                    value={`nav-${item.label}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
