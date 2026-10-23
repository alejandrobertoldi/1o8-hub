/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { Suspense, useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  DollarSign,
  Activity,
  ArrowRight,
  BarChart3,
  Download,
  Upload,
  FileSpreadsheet,
  LayoutTemplate,
  CalendarDays,
  Cloud,
  GitCompareArrows,
  Search,
  Building2,
  X,
  ChevronDown,
  TrendingUp,
  Palette,
  Package,
  ShoppingBag,
  Users as UsersIcon,
  Contact,
  UserPlus,
  Pencil,
  Check,
  Clock,
  BookOpen,
  ImageIcon,
  Store,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HUB_CONFIGURABLE_SECTIONS as CONFIGURABLE_SECTIONS } from "@/lib/permissions";
import { INTERNAL_TEAMS } from "@/lib/constants";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_SORT_ORDER,
  canAssignRole,
  hasAdminPowers,
  type UserRole,
} from "@/lib/roles";

const ALL_ROLES = ASSIGNABLE_ROLES;

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-rose-500/15 text-rose-500 border-rose-500/25",
  super_admin: "bg-brand/15 text-brand border-brand/25",
  admin: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  editor: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  viewer: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  client: "bg-purple-500/15 text-purple-500 border-purple-500/25",
  pending: "bg-orange-500/15 text-orange-500 border-orange-500/25",
  prospect: "bg-teal-500/15 text-teal-500 border-teal-500/25",
};

const SECTION_ICONS: Record<string, LucideIcon> = {
  seo: Search,
  design: Palette,
  ppc: TrendingUp,
  catalog: Package,
  finances: DollarSign,
  clients: UsersIcon,
  // `Users` is already taken by Clients above, so the Team row uses Contact.
  team: Contact,
  calendar: CalendarDays,
  activity: Activity,
  import: Download,
  publish: Upload,
  export: FileSpreadsheet,
  sales: DollarSign,
  reports: BarChart3,
  aplus: LayoutTemplate,
  files: Cloud,
  sync: GitCompareArrows,
  products: ShoppingBag,
  timeline: Clock,
  brandstory: BookOpen,
  "listing-images": ImageIcon,
  storefront: Store,
};

type User = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  isSuperAdmin: boolean;
  allowedSections: string[];
  clientIdCode: string | null;
  asanaEmail: string | null;
  countryCode: string | null;
  residenceTimezone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

function EditableName({ user, isSelf, onSave, href }: { user: User; isSelf: boolean; onSave: (name: string | null) => void; href?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setValue(user.name ?? "");
  }, [user.name]);

  function commit() {
    const trimmed = value.trim();
    const newName = trimmed || null;
    if (newName !== (user.name ?? null)) {
      onSave(newName);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setValue(user.name ?? ""); setEditing(false); }
          }}
          className="w-32 rounded border border-border bg-background px-2 py-0.5 text-sm font-medium focus:border-brand focus:outline-none"
          placeholder="Name…"
        />
        <button type="button" onClick={commit} className="text-muted-foreground hover:text-foreground">
          <Check className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <span className="group flex items-center gap-1.5 font-medium">
      {href ? (
        <Link
          href={href}
          className="hover:text-brand hover:underline focus:text-brand focus:outline-none"
        >
          {user.name ?? "—"}
        </Link>
      ) : (
        user.name ?? "—"
      )}
      {isSelf && (
        <Badge variant="outline" className="text-xs">You</Badge>
      )}
      {!isSelf && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </span>
  );
}

function EditableAsanaEmail({ user, onSave }: { user: User; onSave: (email: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.asanaEmail ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);
  useEffect(() => { setValue(user.asanaEmail ?? ""); }, [user.asanaEmail]);

  function commit() {
    const trimmed = value.trim().toLowerCase() || null;
    if (trimmed !== (user.asanaEmail ?? null)) onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setValue(user.asanaEmail ?? ""); setEditing(false); }
          }}
          placeholder="asana@email.com"
          className="h-7 w-40 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
    );
  }

  return (
    <span className="group flex items-center gap-1.5 text-xs text-muted-foreground">
      {user.asanaEmail ?? <span className="text-muted-foreground/40">—</span>}
      <button type="button" onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
        <Pencil className="size-3" />
      </button>
    </span>
  );
}

function UsersPageInner() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const actorRole = session?.user?.role ?? "viewer";

  const { data: allUsers, isLoading } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const users = allUsers;

  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [clientDropdownUserId, setClientDropdownUserId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const openDropdown = useCallback((userId: string, buttonEl: HTMLButtonElement) => {
    const rect = buttonEl.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setClientDropdownUserId(userId);
  }, []);

  const { data: clients } = useQuery<{ clientIdCode: string; clientName: string }[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch("/api/clients/list");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const clientMutation = useMutation({
    mutationFn: async ({ userId, clientIdCode }: { userId: string; clientIdCode: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientIdCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update client");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Client assignment updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function parseClientCodes(val: string | null): string[] {
    if (!val) return [];
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function toggleClientCode(userId: string, currentVal: string | null, code: string) {
    const codes = parseClientCodes(currentVal);
    const next = codes.includes(code)
      ? codes.filter((c) => c !== code)
      : [...codes, code];
    clientMutation.mutate({
      userId,
      clientIdCode: next.length > 0 ? next.join(",") : null,
    });
  }

  function renderUserRow(user: User) {
    const initials = (user.name ?? user.email)
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const isSelf = user.id === session?.user?.id;
    const isUserAdmin = hasAdminPowers(user.role);

    return (
      <TableRow key={user.id} className={selectedIds.has(user.id) ? "bg-brand/5" : ""}>
        <TableCell>
          {isSelf ? <div className="size-4" /> : (
            <Checkbox checked={selectedIds.has(user.id)} onCheckedChange={() => toggleSelect(user.id)} />
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <EditableName user={user} isSelf={isSelf} onSave={(name) => nameMutation.mutate({ userId: user.id, name })} href={`/team/${user.id}`} />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 text-muted-foreground text-sm"><img src="/Google_Drive.svg" alt="" className="h-3.5 opacity-60" />{user.email}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <img src="/Asana-Logo.png" alt="" className="h-3 opacity-50" />
            <EditableAsanaEmail
              user={user}
              onSave={(asanaEmail) => asanaEmailMutation.mutate({ userId: user.id, asanaEmail })}
            />
          </div>
        </TableCell>
        {ALL_ROLES.map((r) => {
          const canSet = canAssignRole(actorRole, r);
          return (
            <TableCell key={r} className="text-center">
              <input
                type="radio"
                name={`role-${user.id}`}
                checked={user.role === r}
                disabled={isSelf || roleMutation.isPending || !canSet}
                onChange={() => roleMutation.mutate({ userId: user.id, role: r })}
                title={
                  !canSet
                    ? `You cannot assign ${ROLE_LABELS[r]}`
                    : ROLE_LABELS[r]
                }
                className="size-4 accent-brand cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
            </TableCell>
          );
        })}
        <TableCell>
          {(user.role === "client" || user.role === "prospect") ? (() => {
            const codes = parseClientCodes(user.clientIdCode);
            const isOpen = clientDropdownUserId === user.id;
            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => isOpen ? setClientDropdownUserId(null) : openDropdown(user.id, e.currentTarget)}
                  className="flex w-full max-w-[180px] items-center justify-between gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted/50 transition-colors"
                >
                  <span className={codes.length === 0 ? "text-muted-foreground" : "truncate"}>
                    {codes.length === 0
                      ? "Assign client(s)…"
                      : codes.length === 1
                        ? (clients?.find((c) => c.clientIdCode === codes[0])?.clientName || codes[0])
                        : `${codes.length} clients`}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
                {isOpen && createPortal(
                  <>
                    <div className="fixed inset-0 z-[998]" onClick={() => setClientDropdownUserId(null)} />
                    <div className="fixed z-[999] w-56 rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                      {(clients ?? []).map((c) => {
                        const selected = codes.includes(c.clientIdCode);
                        return (
                          <button
                            key={c.clientIdCode}
                            type="button"
                            onClick={() => toggleClientCode(user.id, user.clientIdCode, c.clientIdCode)}
                            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors ${selected ? "bg-muted/30" : ""}`}
                          >
                            <Checkbox checked={selected} className="size-3.5" tabIndex={-1} />
                            <span className="truncate">{c.clientName || c.clientIdCode}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">{c.clientIdCode}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>,
                  document.body
                )}
                {codes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 max-w-[180px]">
                    {codes.map((code) => (
                      <Badge key={code} variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 bg-purple-500/10 text-purple-400 border-purple-500/25">
                        {clients?.find((c) => c.clientIdCode === code)?.clientName || code}
                        <button type="button" onClick={() => toggleClientCode(user.id, user.clientIdCode, code)} className="hover:text-destructive">
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })() : (
            <select
              value={user.clientIdCode ?? ""}
              disabled={clientMutation.isPending}
              onChange={(e) => clientMutation.mutate({ userId: user.id, clientIdCode: e.target.value || null })}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none disabled:opacity-50 cursor-pointer"
            >
              <option value="">—</option>
              {INTERNAL_TEAMS.map((team) => (
                <option key={team.value} value={team.value}>{team.label}</option>
              ))}
            </select>
          )}
        </TableCell>
        {user.role === "client" || user.role === "prospect" ? (
          <TableCell colSpan={1 + CONFIGURABLE_SECTIONS.length} className="text-center text-xs text-muted-foreground py-3">
            <Link href="/portal" className="text-portal-accent hover:underline inline-flex items-center gap-1">
              Managed in Client Portal
              <ArrowRight className="size-3" />
            </Link>
          </TableCell>
        ) : (
          <>
            <TableCell className="text-center">
              {(() => {
                const allIds = CONFIGURABLE_SECTIONS.map((s) => s.id);
                const allChecked = isUserAdmin || allIds.every((id) => (user.allowedSections ?? []).includes(id));
                return (
                  <Checkbox
                    checked={allChecked}
                    disabled={isUserAdmin || sectionMutation.isPending}
                    onCheckedChange={() => {
                      // Only the visible (1o8) sections change; hidden grants are kept as they are.
                      const current = user.allowedSections ?? [];
                      const next = allChecked
                        ? current.filter((id) => !allIds.includes(id))
                        : [...new Set([...current, ...allIds])];
                      sectionMutation.mutate({ userId: user.id, allowedSections: next });
                    }}
                  />
                );
              })()}
            </TableCell>
            {CONFIGURABLE_SECTIONS.map((section) => (
              <TableCell key={section.id} className="text-center">
                <Checkbox
                  checked={isUserAdmin || (user.allowedSections ?? []).includes(section.id)}
                  disabled={isUserAdmin || sectionMutation.isPending}
                  onCheckedChange={() => toggleSection(user, section.id)}
                />
              </TableCell>
            ))}
          </>
        )}
        <TableCell className="text-muted-foreground text-sm">
          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {new Date(user.createdAt).toLocaleDateString("en-US")}
        </TableCell>
        <TableCell>
          {!isSelf && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTargetUser(user)}
            >
              Remove
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  }

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update role");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const sectionMutation = useMutation({
    mutationFn: async ({
      userId,
      allowedSections,
    }: {
      userId: string;
      allowedSections: string[];
    }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, allowedSections }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update sections");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Section access updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User removed");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const nameMutation = useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update name");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Name updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const asanaEmailMutation = useMutation({
    mutationFn: async ({ userId, asanaEmail }: { userId: string; asanaEmail: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, asanaEmail }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update Asana email");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Asana email updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ── Add User ──────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<typeof ALL_ROLES[number]>("viewer");
  const [newSections, setNewSections] = useState<string[]>([]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          role: newRole,
          allowedSections: newSections,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User added");
      setAddOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("viewer");
      setNewSections([]);
      // users will re-sort automatically by role/client grouping
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleSection(user: User, sectionId: string) {
    const current = user.allowedSections ?? [];
    const next = current.includes(sectionId)
      ? current.filter((s) => s !== sectionId)
      : [...current, sectionId];
    sectionMutation.mutate({ userId: user.id, allowedSections: next });
  }

  // ── Bulk Selection ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectableUsers = (users ?? []).filter((u) => u.id !== session?.user?.id);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedIds.has(u.id));
  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(selectableUsers.map((u) => u.id)));

  const bulkMutation = useMutation({
    mutationFn: async (updates: { userId: string; role?: string; allowedSections?: string[]; clientIdCode?: string | null }[]) => {
      const results = await Promise.allSettled(
        updates.map((u) =>
          fetch("/api/admin/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          }).then((res) => {
            if (!res.ok) throw new Error("Failed");
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} update(s) failed`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Updated ${variables.length} user(s)`);
      if (selectedIds.size > 0) setSelectedIds(new Set());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function bulkSetRole(role: string) {
    bulkMutation.mutate([...selectedIds].map((userId) => ({ userId, role })));
  }
  function bulkSetTeam(clientIdCode: string | null) {
    bulkMutation.mutate([...selectedIds].map((userId) => ({ userId, clientIdCode })));
  }
  function bulkSetSections(sectionIds: string[]) {
    bulkMutation.mutate([...selectedIds].map((userId) => ({ userId, allowedSections: sectionIds })));
  }

  // ── Bulk action bar state ──────────────────────────────────
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);
  const [bulkTeamOpen, setBulkTeamOpen] = useState(false);
  const [bulkSectionsOpen, setBulkSectionsOpen] = useState(false);
  const [bulkSectionsPick, setBulkSectionsPick] = useState<string[]>([]);
  const [bulkBarHeight, setBulkBarHeight] = useState(0);
  const bulkBarRef = useCallback((el: HTMLDivElement | null) => {
    setBulkBarHeight(el ? el.offsetHeight : 0);
  }, []);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="User Management"
          >
            <span className="font-bold text-sidebar-foreground">User</span>
            <span className="font-normal text-brand">Management</span>
          </h1>
        </div>
        <Button size="sm" className="text-xs gap-1.5" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-3.5" /> Add User
        </Button>
      </PageMetaSlot>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
              </DialogHeader>
              <div className="min-w-0 space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email *</label>
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@marketfoundry.agency"
                    type="email"
                    className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.filter((r) => canAssignRole(actorRole, r)).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          newRole === r
                            ? ROLE_COLORS[r] + " border-current"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Sections</label>
                    <button
                      type="button"
                      onClick={() =>
                        setNewSections((prev) =>
                          prev.length === CONFIGURABLE_SECTIONS.length
                            ? []
                            : CONFIGURABLE_SECTIONS.map((s) => s.id)
                        )
                      }
                      className="text-[10px] text-brand hover:underline"
                    >
                      {newSections.length === CONFIGURABLE_SECTIONS.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CONFIGURABLE_SECTIONS.map((s) => {
                      const Icon = SECTION_ICONS[s.id];
                      const checked = newSections.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setNewSections((prev) =>
                              checked ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                            )
                          }
                          className={`flex min-w-0 items-center gap-1.5 rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                            checked
                              ? "border-brand/40 bg-brand/10 text-brand"
                              : "border-border text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          {Icon && <Icon className="size-3 shrink-0" />}
                          <span className="min-w-0 break-words">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!newEmail.trim() || addMutation.isPending}
                    onClick={() => addMutation.mutate()}
                  >
                    {addMutation.isPending ? "Adding…" : "Add User"}
                  </Button>
                </div>
              </div>
            </DialogContent>
      </Dialog>

      {selectedIds.size > 0 && (
        <div ref={bulkBarRef} className="sticky top-0 z-[25] bg-background flex items-center gap-3 rounded-md border border-brand/30 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />

          {/* Bulk Role */}
          <div className="relative">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => { setBulkRoleOpen(!bulkRoleOpen); setBulkTeamOpen(false); setBulkSectionsOpen(false); }}>
              Set Role <ChevronDown className="size-3" />
            </Button>
            {bulkRoleOpen && (
              <>
                <div className="fixed inset-0 z-[48]" onClick={() => setBulkRoleOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-[49] w-40 rounded-md border border-border bg-background shadow-lg">
                  {ALL_ROLES.filter((r) => canAssignRole(actorRole, r)).map((r) => (
                    <button key={r} type="button" onClick={() => { bulkSetRole(r); setBulkRoleOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50">
                      <Badge variant="outline" className={`${ROLE_COLORS[r]} text-[10px]`}>{ROLE_LABELS[r]}</Badge>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bulk Team */}
          <div className="relative">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => { setBulkTeamOpen(!bulkTeamOpen); setBulkRoleOpen(false); setBulkSectionsOpen(false); }}>
              Set Team <ChevronDown className="size-3" />
            </Button>
            {bulkTeamOpen && (
              <>
                <div className="fixed inset-0 z-[48]" onClick={() => setBulkTeamOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-[49] w-44 rounded-md border border-border bg-background shadow-lg">
                  <button type="button" onClick={() => { bulkSetTeam(null); setBulkTeamOpen(false); }} className="flex w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50">None</button>
                  {INTERNAL_TEAMS.map((t) => (
                    <button key={t.value} type="button" onClick={() => { bulkSetTeam(t.value); setBulkTeamOpen(false); }} className="flex w-full px-3 py-1.5 text-xs hover:bg-muted/50">{t.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bulk Sections */}
          <div className="relative">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => {
              setBulkSectionsOpen(!bulkSectionsOpen);
              setBulkRoleOpen(false);
              setBulkTeamOpen(false);
              if (!bulkSectionsOpen) setBulkSectionsPick([]);
            }}>
              Set Sections <ChevronDown className="size-3" />
            </Button>
            {bulkSectionsOpen && (
              <>
                <div className="fixed inset-0 z-[48]" onClick={() => setBulkSectionsOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-[49] w-52 rounded-md border border-border bg-background shadow-lg p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Pick sections</span>
                    <button type="button" onClick={() => setBulkSectionsPick((p) => p.length === CONFIGURABLE_SECTIONS.length ? [] : CONFIGURABLE_SECTIONS.map((s) => s.id))} className="text-[10px] text-brand hover:underline">
                      {bulkSectionsPick.length === CONFIGURABLE_SECTIONS.length ? "None" : "All"}
                    </button>
                  </div>
                  {CONFIGURABLE_SECTIONS.map((s) => {
                    const Icon = SECTION_ICONS[s.id];
                    const checked = bulkSectionsPick.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => setBulkSectionsPick((p) => checked ? p.filter((x) => x !== s.id) : [...p, s.id])} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50 ${checked ? "text-brand" : "text-muted-foreground"}`}>
                        <Checkbox checked={checked} className="size-3" tabIndex={-1} />
                        {Icon && <Icon className="size-3" />}
                        {s.label}
                      </button>
                    );
                  })}
                  <Button size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => { bulkSetSections(bulkSectionsPick); setBulkSectionsOpen(false); }}>
                    Apply to {selectedIds.size} user(s)
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="ml-auto">
            <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : (
        <TooltipProvider delayDuration={200}>
        <div className="rounded-md border relative">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky z-20 bg-background [&_tr]:border-b" style={{ top: bulkBarHeight }}>
              <tr className="border-b transition-colors">
                <th className="text-foreground/80 size-10 px-2 text-left align-middle font-medium whitespace-nowrap"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap">User</th>
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Email</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="text-foreground/80 h-10 px-1 text-center align-middle font-medium whitespace-nowrap w-16">
                    <Badge variant="outline" className={`${ROLE_COLORS[r]} text-[9px] whitespace-normal leading-tight`}>
                      {ROLE_LABELS[r]}
                    </Badge>
                  </th>
                ))}
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-44">
                  <div className="flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" /><span>Client</span></div>
                </th>
                <th className="text-foreground/80 h-10 px-2 text-center align-middle font-medium whitespace-nowrap w-16">All</th>
                {CONFIGURABLE_SECTIONS.map((s) => {
                  const Icon = SECTION_ICONS[s.id];
                  const isSub = s.type === "subsection";
                  return (
                    <th key={s.id} className={`text-foreground/80 h-12 px-1 text-center align-middle font-medium whitespace-nowrap ${isSub ? "w-12" : "w-14"}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            {Icon && <Icon className={`${isSub ? "size-3 text-foreground/60" : "size-3.5 text-foreground"}`} />}
                            <span className={`text-[8px] leading-tight ${isSub ? "text-foreground/50" : "text-foreground/70"}`}>{s.label}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>{isSub ? `↳ ${s.label}` : s.label}</p></TooltipContent>
                      </Tooltip>
                    </th>
                  );
                })}
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Last Login</th>
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Joined</th>
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-20"></th>
              </tr>
            </thead>
            <TableBody>
              {(() => {
                const roleOrder = [...ROLE_SORT_ORDER];
                const sorted = (users ?? []).toSorted((a, b) => {
                  const ra = roleOrder.indexOf(a.role);
                  const rb = roleOrder.indexOf(b.role);
                  if (ra !== rb) return ra - rb;
                  // Within client/prospect, group by clientIdCode
                  if ((a.role === "client" || a.role === "prospect") && a.clientIdCode && b.clientIdCode) {
                    const cmp = a.clientIdCode.localeCompare(b.clientIdCode);
                    if (cmp !== 0) return cmp;
                  }
                  return (a.name ?? a.email).localeCompare(b.name ?? b.email);
                });

                // Track group headers
                let lastRole = "";
                const rows: React.ReactNode[] = [];
                const totalCols = 7 + ALL_ROLES.length + 1 + 1 + CONFIGURABLE_SECTIONS.length + 2 + 1;

                for (const user of sorted) {
                  // Role group header
                  if (user.role !== lastRole) {
                    lastRole = user.role;
                    const count = sorted.filter((u) => u.role === user.role).length;
                    rows.push(
                      <TableRow key={`role-${user.role}`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={totalCols} className="py-1.5 px-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`${ROLE_COLORS[user.role]} text-[10px]`}>
                              {ROLE_LABELS[user.role] ?? user.role}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{count} user{count !== 1 ? "s" : ""}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  rows.push(renderUserRow(user));
                }

                return rows;
              })()}
            </TableBody>
          </table>
        </div>
        </TooltipProvider>
      )}

      <DeleteConfirmDialog
        open={!!deleteTargetUser}
        onOpenChange={(o) => { if (!o) setDeleteTargetUser(null); }}
        onConfirm={() => {
          if (deleteTargetUser) {
            deleteMutation.mutate(deleteTargetUser.id, {
              onSuccess: () => setDeleteTargetUser(null),
            });
          }
        }}
        title="Remove user?"
        description={deleteTargetUser ? (
          <>
            This will permanently remove{" "}
            <strong className="text-foreground">{deleteTargetUser.name ?? deleteTargetUser.email}</strong>{" "}
            from the system. Their access is revoked immediately. This action cannot be undone.
          </>
        ) : null}
        pending={deleteMutation.isPending}
        confirmLabel="Remove user"
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}
