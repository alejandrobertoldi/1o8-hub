"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  LayoutGrid,
  MoreVertical,
  FileText,
  AlignLeft,
  Layers,
  MousePointerClick,
  Image as ImageIcon,
  Video as VideoIcon,
  PanelTop,
  Columns2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatusDot,
  getStatusMeta,
  DESIGN_STATUS_ORDER,
  STATUS_TRIGGER_CLASS,
  STATUS_MENU_ITEM_CLASS,
} from "@/lib/design-status";
import { STOREFRONT_FRAME_CLASS } from "@/lib/storefront/layout";
import {
  ADDABLE_MODULE_TYPES,
  STOREFRONT_MODULE_SPECS,
  type SectionLayout,
  type SplitDevice,
  type StorefrontModuleType,
} from "@/lib/storefront/module-specs";
import { StorefrontModuleConfig } from "./storefront-module-card";
import { StorefrontModulePreview } from "./storefront-module-preview";
import { StorefrontSectionOutline } from "./storefront-section-outline";
import { SplitDeviceToggle } from "./split-layout-tree";

// ── Wire types (match GET /api/storefront/[clientIdCode]/pages) ─────────

export type StorefrontTileDTO = {
  id: string;
  position: number;
  title: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  driveFileId: string | null;
  assetMimeType: string | null;
  assetFilename: string | null;
};

export type StorefrontModuleDTO = {
  id: string;
  position: number;
  moduleType: StorefrontModuleType;
  title: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  driveFileId: string | null;
  assetMimeType: string | null;
  assetFilename: string | null;
  containsAiPeople: boolean;
  sectionLayout: SectionLayout | string | null;
  posterDriveFileId: string | null;
  posterMimeType: string | null;
  posterFilename: string | null;
  tiles?: StorefrontTileDTO[];
};

export type StorefrontPageDTO = {
  id: string;
  name: string;
  slug: string;
  metaDescription: string | null;
  isHomepage: boolean;
  position: number;
  modules: StorefrontModuleDTO[];
};

async function fetchPages(clientIdCode: string, version: number): Promise<StorefrontPageDTO[]> {
  const res = await fetch(
    `/api/storefront/${encodeURIComponent(clientIdCode)}/pages?version=${version}`
  );
  if (!res.ok) throw new Error("Failed to load storefront");
  return res.json();
}

export function StorefrontPageEditor({ clientIdCode }: { clientIdCode: string }) {
  const qc = useQueryClient();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  // Meta-description dialog: which page is being edited + draft text.
  const [metaPage, setMetaPage] = useState<StorefrontPageDTO | null>(null);
  const [metaDraft, setMetaDraft] = useState("");
  const [pageNameDialog, setPageNameDialog] = useState(false);
  const [pageNameDraft, setPageNameDraft] = useState("");
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const cancelRenameRef = useRef(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [previewDevice, setPreviewDevice] = useState<SplitDevice>("desktop");

  const { data: versionData } = useQuery({
    queryKey: ["storefront-versions", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/storefront/${encodeURIComponent(clientIdCode)}/versions`
      );
      if (!res.ok) throw new Error("Failed to load versions");
      return (await res.json()) as {
        current: number;
        versions: { version: number; status: string; updatedAt: string; driveFolderUrl: string | null }[];
      };
    },
    enabled: !!clientIdCode,
  });

  // Default the selected version to current once loaded.
  useEffect(() => {
    if (selectedVersion === null && versionData?.current) setSelectedVersion(versionData.current);
  }, [versionData, selectedVersion]);

  const activeVersion = selectedVersion ?? versionData?.current ?? 1;
  const activeVersionRow = versionData?.versions.find((v) => v.version === activeVersion);
  const activeVersionStatus = activeVersionRow?.status ?? "not_started";
  const activeDriveFolderUrl = activeVersionRow?.driveFolderUrl ?? null;

  const { data: pages, isLoading, isError } = useQuery({
    queryKey: ["storefront", clientIdCode, activeVersion],
    queryFn: () => fetchPages(clientIdCode, activeVersion),
    enabled: !!clientIdCode && !!versionData,
  });

  // Resolve the active page: explicit selection, else Homepage, else first.
  const activePage = useMemo<StorefrontPageDTO | null>(() => {
    if (!pages || pages.length === 0) return null;
    if (selectedPageId) {
      const found = pages.find((p) => p.id === selectedPageId);
      if (found) return found;
    }
    return pages.find((p) => p.isHomepage) ?? pages[0];
  }, [pages, selectedPageId]);

  const modules = useMemo(() => activePage?.modules ?? [], [activePage]);

  // Auto-select the first module on load / page change; clear selection if the
  // selected module no longer exists (e.g. after delete or switching pages).
  useEffect(() => {
    if (modules.length === 0) {
      if (selectedModuleId !== null) setSelectedModuleId(null);
      return;
    }
    const stillThere = modules.some((m) => m.id === selectedModuleId);
    if (!stillThere) setSelectedModuleId(modules[0].id);
  }, [modules, selectedModuleId]);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["storefront", clientIdCode, activeVersion] });

  const addPageMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(
        `/api/storefront/${encodeURIComponent(clientIdCode)}/pages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, version: activeVersion }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to add page");
      return d as StorefrontPageDTO;
    },
    onSuccess: (page) => {
      if (page?.id) {
        setSelectedPageId(page.id);
        setSelectedModuleId(null);
      }
      setPageNameDialog(false);
      invalidate();
      toast.success("Page added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add page"),
  });

  const renamePageMut = useMutation({
    mutationFn: async ({ pageId, name }: { pageId: string; name: string }) => {
      const res = await fetch(`/api/storefront/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to rename page");
      return d;
    },
    onSuccess: () => {
      setRenamingPageId(null);
      invalidate();
      toast.success("Page renamed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to rename page"),
  });

  const newVersionMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/storefront/${encodeURIComponent(clientIdCode)}/versions`,
        { method: "POST" }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to create version");
      return d as { version: number };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["storefront-versions", clientIdCode] });
      setSelectedVersion(d.version);
      setSelectedModuleId(null);
      toast.success(`Version V${String(d.version).padStart(2, "0")} created`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to create version"),
  });

  const statusMut = useMutation({
    mutationFn: async (next: string) => {
      const res = await fetch(
        `/api/storefront/${encodeURIComponent(clientIdCode)}/versions/${activeVersion}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        }
      );
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storefront-versions", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["design-status"] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  function handleNewVersion() {
    const next = (versionData?.current ?? 0) + 1;
    if (
      confirm(
        `Create version V${String(next).padStart(2, "0")}? It copies the current version's pages, modules, and assets into a new version you can edit independently.`
      )
    ) {
      newVersionMut.mutate();
    }
  }

  const metaMut = useMutation({
    mutationFn: async ({ pageId, metaDescription }: { pageId: string; metaDescription: string }) => {
      const res = await fetch(`/api/storefront/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaDescription }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save meta description");
      return d;
    },
    onSuccess: () => {
      setMetaPage(null);
      invalidate();
      toast.success("Meta description saved");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to save meta description"),
  });

  const deletePageMut = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await fetch(`/api/storefront/pages/${pageId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to delete page");
      return d;
    },
    onSuccess: () => {
      setSelectedPageId(null);
      setSelectedModuleId(null);
      invalidate();
      toast.success("Page deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete page"),
  });

  const addModuleMut = useMutation({
    mutationFn: async ({ pageId, moduleType }: { pageId: string; moduleType: StorefrontModuleType }) => {
      const res = await fetch(`/api/storefront/pages/${pageId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleType }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to add module");
      return d as StorefrontModuleDTO;
    },
    onSuccess: (mod) => {
      if (mod?.id) setSelectedModuleId(mod.id);
      invalidate();
      toast.success("Module added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add module"),
  });

  function handleAddPage() {
    setPageNameDraft("");
    setPageNameDialog(true);
  }

  function handleRenamePage(page: StorefrontPageDTO) {
    setSelectedPageId(page.id);
    setPageNameDraft(page.name);
    setRenamingPageId(page.id);
  }

  function submitNewPage() {
    const name = pageNameDraft.trim();
    if (!name) return;
    addPageMut.mutate(name);
  }

  function commitRename(page: StorefrontPageDTO) {
    const name = pageNameDraft.trim();
    setRenamingPageId(null);
    if (!name || name === page.name) return;
    renamePageMut.mutate({ pageId: page.id, name });
  }

  function handleEditMeta(page: StorefrontPageDTO) {
    setMetaPage(page);
    setMetaDraft(page.metaDescription ?? "");
  }

  function handleDeletePage(page: StorefrontPageDTO) {
    if (page.isHomepage) {
      toast.error("The Homepage cannot be deleted.");
      return;
    }
    if (confirm(`Delete the "${page.name}" page and all its modules?`)) {
      deletePageMut.mutate(page.id);
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 h-[calc(100dvh-7.5rem)]">
        <Skeleton className="w-[220px] shrink-0 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="w-[340px] shrink-0 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
        <LayoutGrid className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Failed to load storefront. Please try again.
        </p>
      </div>
    );
  }

  const orderedPages = pages ?? [];

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] rounded-xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/30">
      {/* ── LEFT: Pages nav ─────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-stone-200 dark:border-zinc-800 bg-stone-50/60 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-2 px-4 py-2.5 border-b border-stone-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <Select
              value={String(activeVersion)}
              onValueChange={(v) => { setSelectedVersion(Number(v)); setSelectedModuleId(null); }}
            >
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="size-3.5 text-brand" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {(versionData?.versions ?? []).map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    V{String(v.version).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={handleNewVersion}
              disabled={newVersionMut.isPending}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-brand disabled:opacity-50"
              title="Create a new version (copies current content)"
            >
              {newVersionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              New
            </button>
          </div>
          <Select
            value={activeVersionStatus}
            onValueChange={(v) => statusMut.mutate(v)}
            disabled={statusMut.isPending}
          >
            <SelectTrigger className={cn(STATUS_TRIGGER_CLASS, "w-full border justify-start gap-1", getStatusMeta(activeVersionStatus).chipClass)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESIGN_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
                  <span className="flex items-center gap-2"><StatusDot status={s} />{getStatusMeta(s).label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeDriveFolderUrl && (
            <a
              href={activeDriveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
              title={`Open V${String(activeVersion).padStart(2, "0")} Drive folder`}
            >
              <ExternalLink className="size-3" />
              Drive folder
            </a>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Pages</h2>
          <button
            type="button"
            onClick={handleAddPage}
            disabled={addPageMut.isPending}
            className="shrink-0 inline-flex items-center justify-center size-6 rounded text-muted-foreground hover:text-brand hover:bg-stone-200/60 dark:hover:bg-zinc-700/60 disabled:opacity-50"
            aria-label="Add page"
            title="Add page"
          >
            {addPageMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {orderedPages.map((page) => {
            const active = activePage?.id === page.id;
            return (
              <div
                key={page.id}
                className={cn(
                  "group relative flex items-center rounded-lg border-l-2 transition-colors",
                  active
                    ? "border-brand bg-brand/10"
                    : "border-transparent hover:bg-stone-100 dark:hover:bg-zinc-800/40"
                )}
              >
                {renamingPageId === page.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1">
                    <FileText className="size-3.5 shrink-0 text-brand" />
                    <Input
                      value={pageNameDraft}
                      onChange={(e) => setPageNameDraft(e.target.value)}
                      onBlur={() => {
                        if (cancelRenameRef.current) {
                          cancelRenameRef.current = false;
                          return;
                        }
                        commitRename(page);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRenameRef.current = true;
                          setRenamingPageId(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 text-xs"
                      maxLength={80}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      aria-label="Page name"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPageId(page.id);
                      setSelectedModuleId(null);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      handleRenamePage(page);
                    }}
                    title="Double-click to rename"
                    className={cn(
                      "flex-1 flex items-center gap-2 min-w-0 px-2.5 py-2 text-left text-xs font-semibold",
                      active ? "text-brand" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{page.name}</span>
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 p-1.5 mr-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-stone-200/60 dark:hover:bg-zinc-700/60 data-[state=open]:opacity-100",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                      aria-label={`Options for ${page.name}`}
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => handleRenamePage(page)}>
                      <Pencil className="size-3.5 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleEditMeta(page)}>
                      <AlignLeft className="size-3.5 mr-2" />
                      Edit page meta description
                    </DropdownMenuItem>
                    {!page.isHomepage && (
                      <DropdownMenuItem
                        onSelect={() => handleDeletePage(page)}
                        className="text-red-600 focus:text-red-700"
                      >
                        <Trash2 className="size-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── CENTER: Store-page canvas ───────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-stone-200/80 dark:bg-zinc-950">
        {activePage && (
          <div className="flex min-h-full flex-col">
            <div className="sticky top-0 z-20 flex items-center justify-center border-b border-stone-200 bg-white/90 py-1.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
              <SplitDeviceToggle value={previewDevice} onChange={setPreviewDevice} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 py-6">
              {modules.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 border border-dashed border-stone-300 bg-white py-20 dark:border-zinc-700 dark:bg-zinc-900">
                  <LayoutGrid className="size-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    No modules yet — add your first module
                  </p>
                  <AddModuleButtons
                    disabled={addModuleMut.isPending}
                    pendingType={
                      addModuleMut.isPending ? addModuleMut.variables?.moduleType : undefined
                    }
                    onSelect={(moduleType) =>
                      addModuleMut.mutate({ pageId: activePage.id, moduleType })
                    }
                  />
                </div>
              ) : (
                <>
                  <div className={cn(STOREFRONT_FRAME_CLASS, "shadow-sm")}>
                    {modules.map((module, i) => (
                      <StorefrontModulePreview
                        key={module.id}
                        module={module}
                        index={i}
                        count={modules.length}
                        clientIdCode={clientIdCode}
                        selected={module.id === selectedModuleId}
                        device={previewDevice}
                        onSelect={() => setSelectedModuleId(module.id)}
                      />
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <AddModuleButtons
                      disabled={addModuleMut.isPending}
                      pendingType={
                        addModuleMut.isPending ? addModuleMut.variables?.moduleType : undefined
                      }
                      onSelect={(moduleType) =>
                        addModuleMut.mutate({ pageId: activePage.id, moduleType })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── RIGHT: Section outline + selected config ────────────────── */}
      <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-stone-200 bg-stone-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 dark:border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Sections</h2>
          {activePage && (
            <AddModuleMenu
              compact
              disabled={addModuleMut.isPending}
              pending={addModuleMut.isPending}
              onSelect={(moduleType) =>
                addModuleMut.mutate({ pageId: activePage.id, moduleType })
              }
            />
          )}
        </div>
        {modules.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <MousePointerClick className="size-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Add a module to start the page</p>
          </div>
        ) : (
          <>
            <div className="max-h-[46%] overflow-y-auto border-b border-stone-200 dark:border-zinc-800">
              <StorefrontSectionOutline
                modules={modules}
                selectedModuleId={selectedModuleId}
                clientIdCode={clientIdCode}
                onSelect={(id) => {
                  setSelectedModuleId(id);
                  document
                    .getElementById(`storefront-module-${id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }}
                onDeleted={(id) => {
                  if (selectedModuleId === id) setSelectedModuleId(null);
                }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {selectedModule ? (
                <StorefrontModuleConfig
                  key={selectedModule.id}
                  module={selectedModule}
                  clientIdCode={clientIdCode}
                  onDeleted={() => setSelectedModuleId(null)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <MousePointerClick className="size-7 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Select a section to edit</p>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Add page dialog ─────────────────────────────────────────── */}
      <Dialog open={pageNameDialog} onOpenChange={setPageNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add page</DialogTitle>
            <DialogDescription>
              Name the new storefront page. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={pageNameDraft}
            onChange={(e) => setPageNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNewPage();
              }
            }}
            placeholder="Page name"
            autoFocus
            maxLength={80}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPageNameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitNewPage}
              disabled={!pageNameDraft.trim() || addPageMut.isPending}
            >
              {addPageMut.isPending && (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              )}
              Add page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit page meta description dialog ────────────────────────── */}
      <Dialog open={!!metaPage} onOpenChange={(open) => !open && setMetaPage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Page meta description</DialogTitle>
            <DialogDescription>
              A short summary of “{metaPage?.name}” for search engines (recommended 150–160
              characters).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={metaDraft}
            onChange={(e) => setMetaDraft(e.target.value)}
            rows={4}
            maxLength={320}
            placeholder="Describe this page…"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaPage(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                metaPage && metaMut.mutate({ pageId: metaPage.id, metaDescription: metaDraft })
              }
              disabled={metaMut.isPending}
            >
              {metaMut.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ADDABLE_MODULE_ICONS: Record<(typeof ADDABLE_MODULE_TYPES)[number], typeof PanelTop> = {
  header: PanelTop,
  video: VideoIcon,
  image: ImageIcon,
  split_section: Columns2,
};

function AddModuleButtons({
  onSelect,
  disabled,
  pendingType,
}: {
  onSelect: (moduleType: StorefrontModuleType) => void;
  disabled: boolean;
  pendingType?: StorefrontModuleType;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ADDABLE_MODULE_TYPES.map((type) => {
        const Icon = ADDABLE_MODULE_ICONS[type];
        const pending = pendingType === type;
        return (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            disabled={disabled}
            onClick={() => onSelect(type)}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Icon className="size-3.5" />
            )}
            {STOREFRONT_MODULE_SPECS[type].label}
          </Button>
        );
      })}
    </div>
  );
}

function AddModuleMenu({
  onSelect,
  disabled,
  pending,
  compact = false,
}: {
  onSelect: (moduleType: StorefrontModuleType) => void;
  disabled: boolean;
  pending: boolean;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={compact ? "h-7 text-[11px] px-2" : "h-9 text-xs"} disabled={disabled}>
          {pending ? (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          ) : (
            <Plus className="size-3.5 mr-1" />
          )}
          {compact ? "Add" : "Add module"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {ADDABLE_MODULE_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onSelect(type)}>
            {STOREFRONT_MODULE_SPECS[type].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
