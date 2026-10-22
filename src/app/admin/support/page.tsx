/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasAdminPowers } from "@/lib/roles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Headset,
  Plus,
  CircleDot,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Calendar,
  Tag,
  MessageSquare,
  X,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

type Ticket = {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  reportedBy: string;
  reportedByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  screenshotUrl: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount?: number;
};

type Stats = {
  open: number;
  in_progress: number;
  waiting: number;
  resolved: number;
  total: number;
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: "bg-orange-500/15 text-orange-500 border-orange-500/25",
  in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  waiting: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  closed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  medium: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  urgent: "bg-red-500/15 text-red-400 border-red-500/25",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const ROW_BG: Record<TicketStatus, string> = {
  open: "bg-orange-500/5",
  in_progress: "bg-blue-500/5",
  waiting: "bg-amber-500/5",
  resolved: "bg-emerald-500/10",
  closed: "bg-zinc-500/5 opacity-60",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name: string | null | undefined, email?: string) {
  const src = name || email || "?";
  return src
    .split(/[\s@]/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── New Ticket Dialog ──────────────────────────────────────────────────────

function NewTicketDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [category, setCategory] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority, category: category || null }),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Ticket created");
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setCategory("");
      onCreated();
    },
    onError: () => toast.error("Failed to create ticket"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand-solid text-white hover:bg-brand-solid/90 gap-1.5 h-8 text-xs">
          <Plus className="size-3.5" />
          New Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Create Support Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of the issue"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail…"
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[val as TicketPriority]}`}>
                        {label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. billing, bug"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand-solid text-white hover:bg-brand-solid/90"
              onClick={() => mutation.mutate()}
              disabled={!title.trim() || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              Create Ticket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ticket Detail Sheet ─────────────────────────────────────────────────────

function TicketSheet({
  ticket,
  adminUsers,
  isAdmin,
  onClose,
}: {
  ticket: Ticket | null;
  adminUsers: AdminUser[];
  isAdmin: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Ticket> & { id: number }) => {
      const res = await fetch("/api/support", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success("Ticket updated");
    },
    onError: () => toast.error("Failed to update ticket"),
  });

  if (!ticket) return null;

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold leading-snug line-clamp-2">
                #{ticket.id} — {ticket.title}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDateTime(ticket.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[ticket.priority]}`}>
              {PRIORITY_LABELS[ticket.priority]}
            </Badge>
            {ticket.category && (
              <Badge variant="outline" className="text-[10px] bg-zinc-500/10 text-zinc-400 border-zinc-500/25">
                <Tag className="size-2.5 mr-1" />
                {ticket.category}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* Reporter */}
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Submitted by</span>
            <div className="flex items-center gap-1.5">
              <Avatar className="size-5">
                <AvatarFallback className="text-[9px]">
                  {initials(ticket.reportedByName, ticket.reportedBy)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">
                {ticket.reportedByName ?? ticket.reportedBy}
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
            <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3 leading-relaxed">
              {ticket.description || <span className="italic opacity-50">No description provided.</span>}
            </p>
          </div>

          {/* Screenshot */}
          {ticket.screenshotUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Screenshot</p>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="block w-full text-left">
                    <img
                      src={ticket.screenshotUrl}
                      alt="Ticket screenshot"
                      className="rounded-md border border-border max-h-64 object-contain w-full bg-muted/30 hover:opacity-80 transition-opacity cursor-zoom-in"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-2">
                  <img
                    src={ticket.screenshotUrl}
                    alt="Ticket screenshot"
                    className="max-w-full max-h-[85vh] object-contain rounded mx-auto"
                  />
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Admin controls */}
          {isAdmin && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Admin Controls</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Status</label>
                  <Select
                    value={ticket.status}
                    onValueChange={(val) =>
                      updateMutation.mutate({ id: ticket.id, status: val as TicketStatus })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs !bg-background !text-foreground border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[val as TicketStatus]}`}>
                            {label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Priority</label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(val) =>
                      updateMutation.mutate({ id: ticket.id, priority: val as TicketPriority })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs !bg-background !text-foreground border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[val as TicketPriority]}`}>
                            {label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Assign to</label>
                <Select
                  value={ticket.assignedTo ?? "unassigned"}
                  onValueChange={(val) =>
                    updateMutation.mutate({
                      id: ticket.id,
                      assignedTo: val === "unassigned" ? null : val,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs w-full min-w-[200px] !bg-background !text-foreground border-border/50">
                    <SelectValue placeholder="Unassigned" className="text-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {adminUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add internal notes visible only to staff…"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
                />
                <div className="flex justify-end mt-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-brand-solid text-white hover:bg-brand-solid/90"
                    disabled={updateMutation.isPending || !notes.trim()}
                    onClick={() =>
                      updateMutation.mutate({ id: ticket.id, adminNotes: notes } as Parameters<typeof updateMutation.mutate>[0])
                    }
                  >
                    Save Notes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
            <div className="flex items-center gap-1">
              <Calendar className="size-3" />
              Created {formatDate(ticket.createdAt)}
            </div>
            {ticket.updatedAt !== ticket.createdAt && (
              <div className="flex items-center gap-1">
                <Clock className="size-3" />
                Updated {formatDate(ticket.updatedAt)}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Stats Bar ───────────────────────────────────────────────────────────────

function StatsBar({ stats, isLoading }: { stats: Stats | undefined; isLoading: boolean }) {
  const items = [
    { label: "Open", key: "open" as const, icon: CircleDot, color: "text-orange-400" },
    { label: "In Progress", key: "in_progress" as const, icon: Loader2, color: "text-blue-400" },
    { label: "Waiting", key: "waiting" as const, icon: AlertCircle, color: "text-amber-400" },
    { label: "Resolved", key: "resolved" as const, icon: CheckCircle2, color: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, key, icon: Icon, color }) => (
        <div
          key={key}
          className="rounded-xl border border-border bg-background/60 px-4 py-3 flex items-center gap-3"
        >
          <Icon className={`size-4 ${color} shrink-0`} />
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-5 w-8 mt-0.5" />
            ) : (
              <p className="text-lg font-semibold leading-none mt-0.5">{stats?.[key] ?? 0}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const isAdmin = hasAdminPowers(session?.user?.role) || session?.user?.role === "editor";

  // Fetch tickets
  const { data: tickets, isLoading } = useQuery<Ticket[]>({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const res = await fetch("/api/support");
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["support-stats"],
    queryFn: async () => {
      const res = await fetch("/api/support/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  // Fetch team users for assignee dropdown (exclude client/pending/prospect roles)
  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["admin-users-support"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return [];
      const all: AdminUser[] = await res.json();
      return all.filter((u) => u.role !== "client" && u.role !== "pending" && u.role !== "prospect");
    },
    enabled: isAdmin,
  });

  // Derive selected ticket from fresh query data
  const selectedTicket = selectedTicketId !== null
    ? tickets?.find((t) => t.id === selectedTicketId) ?? null
    : null;

  // Filter tickets
  const filtered = tickets?.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAssignee === "me" && t.assignedTo !== session?.user?.id) return false;
    if (filterAssignee === "unassigned" && t.assignedTo !== null) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Support Center"
        >
          <span className="font-bold text-sidebar-foreground">Support</span>
          <span className="font-normal text-brand">Center</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            <Headset className="size-4 text-muted-foreground" />
            <NewTicketDialog
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
                queryClient.invalidateQueries({ queryKey: ["support-stats"] });
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats} isLoading={statsLoading} />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter:</span>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        )}

        {(filterStatus !== "all" || filterPriority !== "all" || filterAssignee !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1 text-muted-foreground"
            onClick={() => {
              setFilterStatus("all");
              setFilterPriority("all");
              setFilterAssignee("all");
            }}
          >
            <X className="size-3" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {isLoading ? "—" : `${filtered?.length ?? 0} ticket${(filtered?.length ?? 0) !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-background/50">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px]">Priority</TableHead>
              <TableHead className="w-[160px]">Submitted By</TableHead>
              <TableHead className="w-[160px]">Assigned To</TableHead>
              <TableHead className="w-[100px]">Created</TableHead>
              <TableHead className="w-[50px] text-center">
                <MessageSquare className="size-3.5 mx-auto text-muted-foreground" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && (!filtered || filtered.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <Headset className="size-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No tickets found</p>
                  <p className="text-xs mt-0.5 opacity-60">
                    {filterStatus !== "all" || filterPriority !== "all"
                      ? "Try adjusting your filters"
                      : "Create the first ticket to get started"}
                  </p>
                </TableCell>
              </TableRow>
            )}

            {filtered?.map((ticket) => (
              <TableRow
                key={ticket.id}
                className={`cursor-pointer hover:bg-muted/20 transition-colors ${ROW_BG[ticket.status]}`}
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {ticket.id}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium line-clamp-1">{ticket.title}</span>
                  {ticket.category && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      [{ticket.category}]
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[ticket.priority]}`}>
                    {PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[9px]">
                        {initials(ticket.reportedByName, ticket.reportedBy)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate max-w-[110px]">
                      {ticket.reportedByName ?? ticket.reportedBy}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {ticket.assignedTo ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="size-5">
                        <AvatarFallback className="text-[9px]">
                          {initials(ticket.assignedToName, ticket.assignedTo)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs truncate max-w-[110px]">
                        {ticket.assignedToName ?? ticket.assignedTo}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(ticket.createdAt)}
                </TableCell>
                <TableCell className="text-center">
                  {(ticket.commentCount ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground">{ticket.commentCount}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Ticket detail slide-over */}
      <TicketSheet
        ticket={selectedTicket}
        adminUsers={adminUsers}
        isAdmin={isAdmin}
        onClose={() => setSelectedTicketId(null)}
      />
    </div>
  );
}
