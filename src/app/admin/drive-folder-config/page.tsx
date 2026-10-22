/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, ChevronDown, ChevronRight, RotateCcw, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

interface FolderNode {
  name: string;
  type: string;
  children?: FolderNode[];
}

interface ConfigResponse {
  tree: FolderNode[];
  source: "db" | "default";
  updatedAt: string | null;
  updatedBy: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Apply an immutable update at a deep path. path is an array of child indices. */
function updateAtPath(tree: FolderNode[], path: number[], updater: (n: FolderNode) => FolderNode): FolderNode[] {
  if (path.length === 0) return tree;
  const [head, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return updater(node);
    return { ...node, children: updateAtPath(node.children ?? [], rest, updater) };
  });
}

/** Insert a new node at the end of the children array at the given parent path. Empty path = root. */
function insertAtPath(tree: FolderNode[], parentPath: number[], newNode: FolderNode): FolderNode[] {
  if (parentPath.length === 0) return [...tree, newNode];
  const [head, ...rest] = parentPath;
  return tree.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return { ...node, children: [...(node.children ?? []), newNode] };
    return { ...node, children: insertAtPath(node.children ?? [], rest, newNode) };
  });
}

/** Remove the node at the given path. */
function removeAtPath(tree: FolderNode[], path: number[]): FolderNode[] {
  if (path.length === 0) return tree;
  if (path.length === 1) return tree.filter((_, i) => i !== path[0]);
  const [head, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== head) return node;
    return { ...node, children: removeAtPath(node.children ?? [], rest) };
  });
}

function slugifyType(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function flattenTypes(tree: FolderNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      out.push(n.type);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

// ─── Tree Editor ──────────────────────────────────────────────────

function NodeRow({
  node,
  path,
  onChange,
  onAddChild,
  onRemove,
  expanded,
  onToggleExpand,
}: {
  node: FolderNode;
  path: number[];
  onChange: (path: number[], next: FolderNode) => void;
  onAddChild: (parentPath: number[]) => void;
  onRemove: (path: number[], name: string) => void;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
}) {
  const depth = path.length - 1;
  const pathKey = path.join(".");
  const hasChildren = !!node.children && node.children.length > 0;
  const isOpen = expanded.has(pathKey);

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 hover:bg-muted/30 rounded px-1"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(pathKey)}
          className={`shrink-0 ${hasChildren ? "text-muted-foreground hover:text-foreground" : "opacity-30"}`}
          disabled={!hasChildren}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen
            ? <ChevronDown className="size-3.5" />
            : <ChevronRight className="size-3.5" />}
        </button>

        {/* Name */}
        <input
          type="text"
          value={node.name}
          onChange={(e) => {
            const newName = e.target.value;
            // Auto-derive type from name if type was previously the slug of name
            const prevSlug = slugifyType(node.name);
            const next: FolderNode = node.type === prevSlug || !node.type
              ? { ...node, name: newName, type: slugifyType(newName) }
              : { ...node, name: newName };
            onChange(path, next);
          }}
          placeholder="Folder name"
          className="flex-1 min-w-0 bg-background border border-border/50 rounded px-2 py-1 text-xs font-medium focus:border-brand focus:outline-none"
        />

        {/* Type */}
        <input
          type="text"
          value={node.type}
          onChange={(e) => onChange(path, { ...node, type: e.target.value })}
          placeholder="type_key"
          className="w-44 shrink-0 bg-background border border-border/50 rounded px-2 py-1 text-xs font-mono text-muted-foreground focus:border-brand focus:outline-none"
        />

        {/* Add child */}
        <button
          type="button"
          onClick={() => onAddChild(path)}
          title="Add child folder"
          className="shrink-0 text-muted-foreground hover:text-brand p-1"
        >
          <Plus className="size-3.5" />
        </button>

        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(path, node.name)}
          title="Remove folder"
          className="shrink-0 text-muted-foreground hover:text-red-500 p-1"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Children */}
      {hasChildren && isOpen && node.children!.map((child, i) => (
        <NodeRow
          key={`${pathKey}.${i}`}
          node={child}
          path={[...path, i]}
          onChange={onChange}
          onAddChild={onAddChild}
          onRemove={onRemove}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function DriveFolderConfigPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<ConfigResponse>({
    queryKey: ["folder-tree-config"],
    queryFn: () => fetch("/api/admin/folder-tree").then(r => r.json()),
    staleTime: 30_000,
  });

  const [tree, setTree] = useState<FolderNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<{ path: number[]; name: string } | null>(null);

  // Initialize local state from server data
  useEffect(() => {
    if (data?.tree && tree.length === 0) {
      setTree(data.tree);
      // Auto-expand top-level nodes that have children
      const ks: string[] = [];
      data.tree.forEach((n, i) => { if (n.children?.length) ks.push(String(i)); });
      setExpanded(new Set(ks));
    }
  }, [data, tree.length]);

  const saveMutation = useMutation({
    mutationFn: async (next: FolderNode[]) => {
      const res = await fetch("/api/admin/folder-tree", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      return j;
    },
    onSuccess: () => {
      toast.success("Folder tree saved");
      queryClient.invalidateQueries({ queryKey: ["folder-tree-config"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  function handleNodeChange(path: number[], next: FolderNode) {
    setTree(prev => updateAtPath(prev, path, () => next));
  }

  function handleAddChild(parentPath: number[]) {
    const newNode: FolderNode = { name: "New Folder", type: `new_${Date.now()}` };
    setTree(prev => insertAtPath(prev, parentPath, newNode));
    // Auto-expand the parent so the new node is visible
    setExpanded(prev => new Set(prev).add(parentPath.join(".")));
  }

  function handleAddRoot() {
    handleAddChild([]);
  }

  function handleRemove(path: number[], name: string) {
    setRemoveTarget({ path, name });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    setTree(prev => removeAtPath(prev, removeTarget.path));
    setRemoveTarget(null);
  }

  function handleToggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleReset() {
    if (data?.tree && confirm("Discard local changes and reload from server?")) {
      setTree(data.tree);
    }
  }

  // Validation: surface duplicate types inline
  const allTypes = flattenTypes(tree);
  const duplicates = [...new Set(allTypes.filter((t, i) => allTypes.indexOf(t) !== i))];
  const hasErrors = duplicates.length > 0 || tree.some(function check(n: FolderNode): boolean {
    if (!n.name.trim() || !n.type.trim()) return true;
    return (n.children ?? []).some(check);
  });

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <FolderTree className="size-7 text-brand shrink-0" />
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">Folder</span><span className="font-normal text-brand">Tree</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={isLoading || saveMutation.isPending}>
            <RotateCcw className="size-3.5 mr-1" /> Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate(tree)}
            disabled={isLoading || saveMutation.isPending || hasErrors}
          >
            {saveMutation.isPending
              ? <><Loader2 className="size-3.5 mr-1 animate-spin" /> Saving…</>
              : <><Save className="size-3.5 mr-1" /> Save</>}
          </Button>
        </div>
      </PageMetaSlot>

      <div className="rounded-xl border bg-card p-4 max-w-5xl space-y-3">
        <div className="text-xs text-muted-foreground">
          {data?.source === "default"
            ? "Showing default folder tree from folder-tree.ts. Save to persist your changes to the database."
            : data?.updatedAt
              ? `Last updated ${new Date(data.updatedAt).toLocaleString()} by ${data.updatedBy ?? "—"}`
              : "Loading…"}
        </div>

        {duplicates.length > 0 && (
          <div className="rounded border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2 text-xs">
            Duplicate folder types: <span className="font-mono">{duplicates.join(", ")}</span>. Each <code>type</code> must be unique.
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center gap-2 px-1 pb-1 border-b border-border/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className="w-3.5 shrink-0" />
          <span className="flex-1">Name</span>
          <span className="w-44 shrink-0">Type</span>
          <span className="w-14 shrink-0 text-right">Actions</span>
        </div>

        {/* Tree */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node, i) => (
              <NodeRow
                key={i}
                node={node}
                path={[i]}
                onChange={handleNodeChange}
                onAddChild={handleAddChild}
                onRemove={handleRemove}
                expanded={expanded}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-border/50">
          <Button type="button" variant="ghost" size="sm" onClick={handleAddRoot}>
            <Plus className="size-3.5 mr-1" /> Add root folder
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/50">
          <p className="font-medium mb-1">Notes</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><span className="font-mono">type</span> is used as the lookup key in <span className="font-mono">drive_folders.folder_type</span> — must be unique across the whole tree.</li>
            <li>Existing clients are not auto-updated. Re-run the <span className="font-mono">drive_folders</span> onboarding step per client to apply the new structure (idempotent — existing folders are skipped).</li>
            <li>Removing a node here does <strong>not</strong> delete folders already created in Drive. Cleanup is manual.</li>
          </ul>
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
        onConfirm={confirmRemove}
        title="Remove folder?"
        description={removeTarget ? (
          <>
            This will remove <strong className="text-foreground">{removeTarget.name}</strong> and all of its children from the configuration. Existing Drive folders are not affected — cleanup is manual.
          </>
        ) : null}
        confirmLabel="Remove folder"
      />
    </div>
  );
}
