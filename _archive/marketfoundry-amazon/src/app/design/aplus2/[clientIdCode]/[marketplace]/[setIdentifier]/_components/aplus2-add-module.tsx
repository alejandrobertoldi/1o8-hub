"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { APLUS2_MODULE_SPECS, carouselPanelOptions, isCarouselModule, moduleTypesForTier, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";

export function Aplus2AddModule({ versionId, contentType, disabled }: { versionId: string; contentType: "PA+" | "BA+"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pendingCarousel, setPendingCarousel] = useState<Aplus2ModuleType | null>(null);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async ({ moduleType, itemCount }: { moduleType: Aplus2ModuleType; itemCount?: number }) => {
      const r = await fetch(`/api/aplus2/versions/${versionId}/modules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleType, ...(itemCount != null ? { itemCount } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aplus2-set"] }); setOpen(false); setPendingCarousel(null); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setPendingCarousel(null);
  }

  function handleSelect(t: Aplus2ModuleType) {
    if (isCarouselModule(t)) {
      setPendingCarousel(t);
      return;
    }
    mut.mutate({ moduleType: t });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full h-8 rounded-full text-xs" disabled={disabled || mut.isPending}>
          <Plus className="size-3 mr-1" /> Add module
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        {pendingCarousel ? (
          <div className="p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">How many panels</p>
            <div className="flex flex-wrap gap-1.5">
              {carouselPanelOptions(pendingCarousel).map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-8 rounded-full text-xs"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ moduleType: pendingCarousel, itemCount: n })}
                >
                  {n}
                </Button>
              ))}
            </div>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
              onClick={() => setPendingCarousel(null)}
            >
              Back
            </button>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search modules…" />
            <CommandList>
              <CommandEmpty>No module matches.</CommandEmpty>
              <CommandGroup>
                {moduleTypesForTier(contentType).map((t) => (
                  <CommandItem key={t} value={t} onSelect={() => handleSelect(t)}>
                    <div>
                      <div className="text-xs font-semibold">{APLUS2_MODULE_SPECS[t].label}</div>
                      <div className="text-[10px] text-muted-foreground">{APLUS2_MODULE_SPECS[t].description}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
