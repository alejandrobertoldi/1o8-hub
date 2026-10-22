"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Holiday {
  id: string;
  countryCode: string;
  holidayDate: string;
  name: string;
}

/** "Thu 2026-01-01" — local parse so UTC offset can't shift the weekday. */
export function formatHolidayDate(dateIso: string): string {
  const d = parse(dateIso, "yyyy-MM-dd", new Date());
  return `${format(d, "EEE")} ${dateIso}`;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return fallback;
}

export function HolidayCountryTab({ country, year }: { country: string; year: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["holidays", country, year];

  const { data: holidays = [], isLoading, isError } = useQuery<Holiday[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/holidays?country=${country}&year=${year}`);
      if (!res.ok) throw new Error("Failed to load holidays");
      return res.json();
    },
  });

  const [date, setDate] = useState(`${year}-01-01`);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editName, setEditName] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: country, holidayDate: date, name: name.trim() }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to add holiday"));
      return res.json();
    },
    onSuccess: () => {
      toast.success("Holiday added");
      setName("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      holidayDate,
      name: nextName,
    }: {
      id: string;
      holidayDate: string;
      name: string;
    }) => {
      const res = await fetch(`/api/holidays/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidayDate, name: nextName.trim() }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update holiday"));
      return res.json();
    },
    onSuccess: () => {
      toast.success("Holiday updated");
      setEditingId(null);
      setEditDate("");
      setEditName("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to delete holiday"));
      return res.json();
    },
    onSuccess: () => {
      toast.success("Holiday deleted");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startEdit = (h: Holiday) => {
    setEditingId(h.id);
    setEditDate(h.holidayDate);
    setEditName(h.name);
    updateMutation.reset();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditName("");
    updateMutation.reset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 py-10 text-center text-xs text-muted-foreground">
        Couldn&rsquo;t load holidays. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Date</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {holidays.map((h) => {
            const isEditing = editingId === h.id;
            return (
              <TableRow key={h.id}>
                <TableCell className="tabular-nums">
                  {isEditing ? (
                    <DatePicker
                      value={editDate}
                      onChange={setEditDate}
                      className="h-8 w-full text-xs"
                    />
                  ) : (
                    formatHolidayDate(h.holidayDate)
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="space-y-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm"
                        aria-label="Holiday name"
                      />
                      {updateMutation.isError && updateMutation.variables?.id === h.id && (
                        <p className="text-[10px] text-destructive">
                          {updateMutation.error.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    h.name
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-brand hover:bg-brand/10"
                        aria-label="Save holiday"
                        disabled={!editName.trim() || updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            id: h.id,
                            holidayDate: editDate,
                            name: editName,
                          })
                        }
                      >
                        {updateMutation.isPending && updateMutation.variables?.id === h.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground"
                        aria-label="Cancel edit"
                        disabled={updateMutation.isPending}
                        onClick={cancelEdit}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${h.name}`}
                        onClick={() => startEdit(h)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:bg-red-500/10 h-8 px-2"
                            aria-label={`Delete ${h.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this holiday?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{h.name}&quot; ({h.holidayDate}) will be removed. This cannot be
                              undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(h.id)}
                              className="bg-red-500 hover:bg-red-600 text-white"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}

          <TableRow>
            <TableCell>
              <DatePicker value={date} onChange={setDate} className="h-8 w-full text-xs" />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Holiday name…"
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => addMutation.mutate()}
                  disabled={!name.trim() || addMutation.isPending}
                >
                  {addMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Add
                </Button>
              </div>
              {addMutation.isError && (
                <p className="text-[10px] text-destructive mt-1">{addMutation.error.message}</p>
              )}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
