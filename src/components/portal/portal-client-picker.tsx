"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalVisibleClients } from "@/components/portal/portal-visible-clients";
import { formatPortalClientBadge } from "@/lib/client-codes";

type AssignedClient = {
  clientIdCode: string;
  clientName: string;
  allowedSections: string[];
};

export function PortalClientPicker() {
  const { assigned, visible, setClientEnabled, showPicker } = usePortalVisibleClients();
  const { data } = useQuery<{ clients: AssignedClient[] }>({
    queryKey: ["portal-me-clients", "self"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
    enabled: showPicker,
    staleTime: 120_000,
  });

  if (!showPicker) return null;

  const byCode = new Map((data?.clients ?? []).map((c) => [c.clientIdCode, c]));
  const rows = assigned.map(
    (code) =>
      byCode.get(code) ?? {
        clientIdCode: code,
        clientName: code,
        allowedSections: [],
      },
  );
  const names = Object.fromEntries(rows.map((c) => [c.clientIdCode, c.clientName]));
  const label = formatPortalClientBadge(visible, names);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full max-w-sm justify-between gap-2 bg-card font-normal"
          aria-label={`Visible clients: ${label}`}
        >
          <span className="min-w-0 truncate text-left">
            <span className="mr-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Clients
            </span>
            {label}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
      >
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Show in portal
        </DropdownMenuLabel>
        {rows.map((c) => {
          const on = visible.includes(c.clientIdCode);
          const lastOn = on && visible.length === 1;
          return (
            <DropdownMenuCheckboxItem
              key={c.clientIdCode}
              checked={on}
              disabled={lastOn}
              className="items-start py-2"
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(next) => {
                if (!next && lastOn) {
                  toast.error("Keep at least one client visible");
                  return;
                }
                setClientEnabled(c.clientIdCode, Boolean(next));
              }}
            >
              <span className="min-w-0">
                <span className="block truncate">{c.clientName}</span>
                <span className="block font-mono text-[10px] font-bold text-muted-foreground">
                  {c.clientIdCode}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
