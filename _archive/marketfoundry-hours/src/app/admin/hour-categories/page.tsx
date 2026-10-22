/* eslint-disable jsx-a11y/label-has-associated-control */
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface Category {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

interface CategoriesResponse {
  categories: Category[];
}

interface AddInput {
  name: string;
  sortOrder?: number;
}

interface UpdateInput {
  id: string;
  name?: string;
  active?: boolean;
  sortOrder?: number;
}

/** Reads `{ error }` off a non-ok JSON response, falling back if the body isn't parseable. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return fallback;
}

export default function AdminHourCategoriesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CategoriesResponse>({
    queryKey: ["admin-hour-categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/hour-categories");
      if (!res.ok) throw new Error("Failed to load hour categories");
      return res.json();
    },
  });

  const categories = data?.categories ?? [];

  const [newName, setNewName] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-hour-categories"] });
  }

  const addMutation = useMutation<{ category: Category }, Error, AddInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/hour-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to add category"));
      return res.json();
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewName("");
      setNewSortOrder("");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation<{ category: Category }, Error, UpdateInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/hour-categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update category"));
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  function handleAdd() {
    if (addMutation.isPending) return;
    const name = newName.trim();
    if (!name) return;
    const trimmedOrder = newSortOrder.trim();
    const sortOrder = trimmedOrder ? Number(trimmedOrder) : undefined;
    addMutation.mutate({ name, sortOrder });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-destructive">
        Failed to load hour categories. Make sure you have admin access.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Hour Categories"
        >
          <span className="font-bold text-sidebar-foreground">Hour</span>
          <span className="font-normal text-brand">Categories</span>
        </h1>
      </PageMetaSlot>

      <p className="mb-6 text-xs text-muted-foreground">
        Manage the categories loggers choose from when logging hours. Deactivating a category
        hides it from the logger without touching past entries.
      </p>

      <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-20 text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                onUpdate={updateMutation.mutate}
              />
            ))}

            {/* Add row */}
            <TableRow>
              <TableCell>
                <Input
                  type="number"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                  placeholder="0"
                  className="h-8 w-16 text-sm"
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                    placeholder="New category name…"
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={handleAdd}
                    disabled={!newName.trim() || addMutation.isPending}
                  >
                    {addMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add
                  </Button>
                </div>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  onUpdate,
}: {
  category: Category;
  onUpdate: (input: UpdateInput) => void;
}) {
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const nameFocused = useRef(false);
  const sortOrderFocused = useRef(false);

  // Resync local state from the server value on refetch — but never while the
  // user is actively editing that field, so an in-progress edit in one field
  // survives a refetch triggered by a mutation committed from another field.
  useEffect(() => {
    if (!nameFocused.current) setName(category.name);
  }, [category.name]);

  useEffect(() => {
    if (!sortOrderFocused.current) setSortOrder(String(category.sortOrder));
  }, [category.sortOrder]);

  function commitName() {
    nameFocused.current = false;
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setName(category.name);
      return;
    }
    onUpdate({ id: category.id, name: trimmed });
  }

  function commitSortOrder() {
    sortOrderFocused.current = false;
    const trimmed = sortOrder.trim();
    if (!trimmed) {
      setSortOrder(String(category.sortOrder));
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num === category.sortOrder) {
      setSortOrder(String(category.sortOrder));
      return;
    }
    onUpdate({ id: category.id, sortOrder: num });
  }

  return (
    <TableRow className={!category.active ? "opacity-50" : undefined}>
      <TableCell>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          onFocus={() => {
            sortOrderFocused.current = true;
          }}
          onBlur={commitSortOrder}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-16 text-sm"
        />
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => {
            nameFocused.current = true;
          }}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell className="text-right">
        <Switch
          checked={category.active}
          onCheckedChange={(checked) => onUpdate({ id: category.id, active: checked })}
        />
      </TableCell>
    </TableRow>
  );
}
