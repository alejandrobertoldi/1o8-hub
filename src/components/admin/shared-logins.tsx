"use client";
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/prefer-useReducer */

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { hasAdminPowers } from "@/lib/roles";
import {
  SHARED_LOGIN_CATEGORIES,
  SHARED_LOGIN_CATEGORY_LABELS,
  type SharedLoginCategory,
  type SharedLoginPublic,
  type SharedLoginStaff,
  type SharedLoginSubscription,
} from "@/lib/shared-logins";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SubscriptionForm = {
  subscriptionId: string;
  plan: string;
  activationCode: string;
  userLimit: string;
  allowed: Record<string, boolean>;
};

type AccountForm = {
  username: string;
  password: string;
  hasSecret: boolean;
  subscriptions: SubscriptionForm[];
};

type FormState = {
  name: string;
  category: SharedLoginCategory;
  url: string;
  accounts: AccountForm[];
  notes: string;
};

function allEnabled(staff: SharedLoginStaff[]): Record<string, boolean> {
  return Object.fromEntries(staff.map((person) => [person.id, true]));
}

const EMPTY_SUBSCRIPTION: SubscriptionForm = {
  subscriptionId: "",
  plan: "",
  activationCode: "",
  userLimit: "",
  allowed: {},
};

const EMPTY_ACCOUNT: AccountForm = {
  username: "",
  password: "",
  hasSecret: false,
  subscriptions: [{ ...EMPTY_SUBSCRIPTION }],
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "other",
  url: "",
  accounts: [{ ...EMPTY_ACCOUNT, subscriptions: [{ ...EMPTY_SUBSCRIPTION }] }],
  notes: "",
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function initials(name: string | null, email: string) {
  const source = (name ?? "").trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function userLimitLabel(subscription: SharedLoginSubscription): string {
  if (subscription.userLimit == null) return "Not set";
  const used = subscription.assignedUsers.filter((user) => user.enabled).length;
  if (subscription.assignedUsers.length === 0) {
    return String(subscription.userLimit);
  }
  return `${used} of ${subscription.userLimit}`;
}

function toAccountForms(
  login: SharedLoginPublic,
  staff: SharedLoginStaff[]
): AccountForm[] {
  const accounts =
    login.accounts.length > 0
      ? login.accounts
      : [{ username: login.username ?? "", hasSecret: login.hasSecret, subscriptions: login.subscriptions }];
  return accounts.map((account) => ({
    username: account.username,
    password: "",
    hasSecret: account.hasSecret,
    subscriptions:
      account.subscriptions.length > 0
        ? account.subscriptions.map((subscription) => {
            const allowed = allEnabled(staff);
            if (subscription.assignedUsers.length > 0) {
              for (const person of staff) allowed[person.id] = false;
              for (const person of subscription.assignedUsers) {
                allowed[person.id] = person.enabled;
              }
            }
            return {
              subscriptionId: subscription.subscriptionId,
              plan: subscription.plan ?? "",
              activationCode: subscription.activationCode ?? "",
              userLimit:
                subscription.userLimit != null ? String(subscription.userLimit) : "",
              allowed,
            };
          })
        : [{ ...EMPTY_SUBSCRIPTION, allowed: allEnabled(staff) }],
  }));
}

export function SharedLogins() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isAdmin = hasAdminPowers(session?.user?.role);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SharedLoginCategory | "all">(
    "all"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SharedLoginPublic | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SharedLoginPublic | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string[]>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shared-logins"],
    queryFn: async () => {
      const res = await fetch("/api/admin/logins");
      if (!res.ok) throw new Error("Failed to load logins");
      return res.json() as Promise<{
        logins: SharedLoginPublic[];
        staff: SharedLoginStaff[];
      }>;
    },
  });

  const logins = data?.logins ?? [];
  const staff = data?.staff ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logins.filter((login) => {
      if (categoryFilter !== "all" && login.category !== categoryFilter) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        login.name,
        login.url,
        login.notes,
        ...login.accounts.flatMap((account) => [
          account.username,
          ...account.subscriptions.flatMap((subscription) => [
            subscription.subscriptionId,
            subscription.plan,
            subscription.activationCode,
            subscription.userLimit != null ? String(subscription.userLimit) : "",
          ]),
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [logins, query, categoryFilter]);

  const grouped = useMemo(() => {
    const byCategory = new Map<SharedLoginCategory, SharedLoginPublic[]>();
    for (const login of filtered) {
      const list = byCategory.get(login.category) ?? [];
      list.push(login);
      byCategory.set(login.category, list);
    }
    return SHARED_LOGIN_CATEGORIES.filter((category) =>
      byCategory.has(category)
    ).map((category) => ({
      category,
      label: SHARED_LOGIN_CATEGORY_LABELS[category],
      items: byCategory.get(category) ?? [],
    }));
  }, [filtered]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = editing
        ? `/api/admin/logins/${editing.id}`
        : "/api/admin/logins";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to save login");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-logins"] });
      toast.success(editing ? "Login updated" : "Login added");
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/logins/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to delete login");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-logins"] });
      toast.success("Login deleted");
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      accounts: [
        {
          ...EMPTY_ACCOUNT,
          subscriptions: [{ ...EMPTY_SUBSCRIPTION, allowed: allEnabled(staff) }],
        },
      ],
    });
    setDialogOpen(true);
  }

  function openEdit(login: SharedLoginPublic) {
    setEditing(login);
    setForm({
      name: login.name,
      category: login.category,
      url: login.url ?? "",
      accounts: toAccountForms(login, staff),
      notes: login.notes ?? "",
    });
    setDialogOpen(true);
  }

  function updateAccount(accountIndex: number, patch: Partial<AccountForm>) {
    setForm((prev) => ({
      ...prev,
      accounts: prev.accounts.map((account, index) =>
        index === accountIndex ? { ...account, ...patch } : account
      ),
    }));
  }

  function updateSubscription(
    accountIndex: number,
    subIndex: number,
    patch: Partial<SubscriptionForm>
  ) {
    setForm((prev) => ({
      ...prev,
      accounts: prev.accounts.map((account, index) =>
        index === accountIndex
          ? {
              ...account,
              subscriptions: account.subscriptions.map((subscription, inner) =>
                inner === subIndex ? { ...subscription, ...patch } : subscription
              ),
            }
          : account
      ),
    }));
  }

  async function reveal(id: string): Promise<string[] | null> {
    if (revealed[id] != null) return revealed[id] ?? null;
    const res = await fetch(`/api/admin/logins/${id}/reveal`, { method: "POST" });
    if (!res.ok) {
      toast.error("Could not reveal this login");
      return null;
    }
    const data = (await res.json()) as {
      password?: string;
      accounts?: { password?: string }[];
    };
    const passwords =
      data.accounts?.map((account) => account.password ?? "") ??
      (data.password != null ? [data.password] : []);
    setRevealed((prev) => ({ ...prev, [id]: passwords }));
    return passwords;
  }

  async function markCopied(key: string, value: string) {
    if (!value) return;
    await copyText(value);
    setCopied(key);
    toast.success("Copied");
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  }

  async function copyPassword(login: SharedLoginPublic, accountIndex: number) {
    const passwords = await reveal(login.id);
    const password = passwords?.[accountIndex] ?? "";
    if (password) {
      await markCopied(`${login.id}-password-${accountIndex}`, password);
    } else toast.error("No password stored");
  }

  function hidePasswords(id: string) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Shared Logins"
        >
          <span className="font-bold text-sidebar-foreground">Shared</span>
          <span className="font-normal text-brand">Logins</span>
        </h1>
      </PageMetaSlot>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground max-w-xl">
          Team credentials for shared tools — Helium 10, ExpressVPN, Claude, and
          the rest. Passwords stay encrypted until someone reveals or copies them.
        </p>
        {isAdmin && (
          <Button
            variant="brand"
            className="rounded-full self-start"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            Add login
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search services, emails, URLs"
            className="pl-9"
            aria-label="Search shared logins"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
          >
            All
          </FilterChip>
          {SHARED_LOGIN_CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              active={categoryFilter === category}
              onClick={() => setCategoryFilter(category)}
            >
              {SHARED_LOGIN_CATEGORY_LABELS[category]}
            </FilterChip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-[18px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[18px] border border-stone-200 bg-card p-10 text-center dark:border-zinc-800">
          <KeyRound className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No shared logins yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add Helium 10, ExpressVPN, Claude, or any other team account.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.category} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((login, index) => {
                  const showingPassword = revealed[login.id] != null;
                  const accounts =
                    login.accounts.length > 0
                      ? login.accounts
                      : [
                          {
                            username: login.username ?? "",
                            hasSecret: login.hasSecret,
                            subscriptions: login.subscriptions,
                          },
                        ];
                  return (
                    <article
                      key={login.id}
                      className="rounded-[18px] border border-stone-200 bg-card p-5 card-glow animate-card-enter hover:border-stone-300 hover:shadow-md transition-all dark:border-zinc-800 dark:hover:border-zinc-700"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {SHARED_LOGIN_CATEGORY_LABELS[login.category]}
                          </p>
                          <h3 className="mt-1 truncate text-sm font-bold">
                            {login.name}
                          </h3>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {login.url && (
                            <a
                              href={login.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 hover:text-foreground dark:hover:bg-zinc-800"
                              aria-label={`Open ${login.name}`}
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(login)}
                                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 hover:text-foreground dark:hover:bg-zinc-800"
                                aria-label={`Edit ${login.name}`}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(login)}
                                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-brand-red dark:hover:bg-red-500/10"
                                aria-label={`Delete ${login.name}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <dl className="mt-4 space-y-4">
                        {accounts.map((account, accountIndex) => {
                          const subscriptions =
                            account.subscriptions.length > 0
                              ? account.subscriptions
                              : [
                                  {
                                    subscriptionId: "",
                                    plan: null,
                                    activationCode: null,
                                    userLimit: null,
                                    assignedUsers: [],
                                  },
                                ];
                          return (
                            <div
                              key={`${login.id}-user-${accountIndex}`}
                              className="space-y-3"
                            >
                              {accounts.length > 1 ? (
                                <p className="text-[10px] font-bold uppercase tracking-wider text-brand">
                                  User {accountIndex + 1}
                                </p>
                              ) : null}
                              <FieldRow
                                label="Username"
                                value={account.username || "Not set"}
                                copyKey={`${login.id}-user-${accountIndex}`}
                                copied={copied}
                                onCopy={
                                  account.username
                                    ? () =>
                                        markCopied(
                                          `${login.id}-user-${accountIndex}`,
                                          account.username
                                        )
                                    : undefined
                                }
                              />
                              <FieldRow
                                label="Password"
                                value={
                                  showingPassword
                                    ? revealed[login.id]?.[accountIndex] || "Not set"
                                    : account.hasSecret
                                      ? "••••••••"
                                      : "Not set"
                                }
                                copyKey={`${login.id}-password-${accountIndex}`}
                                copied={copied}
                                onCopy={
                                  account.hasSecret
                                    ? () => copyPassword(login, accountIndex)
                                    : undefined
                                }
                                extra={
                                  account.hasSecret ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        showingPassword
                                          ? hidePasswords(login.id)
                                          : void reveal(login.id)
                                      }
                                      className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 dark:hover:bg-zinc-800"
                                      aria-label={
                                        showingPassword
                                          ? "Hide password"
                                          : "Show password"
                                      }
                                    >
                                      {showingPassword ? (
                                        <EyeOff className="size-3.5" />
                                      ) : (
                                        <Eye className="size-3.5" />
                                      )}
                                    </button>
                                  ) : undefined
                                }
                              />
                              {subscriptions.map((subscription, subIndex) => {
                                const assigned = subscription.assignedUsers.filter(
                                  (person) => person.enabled
                                );
                                const unrestricted =
                                  subscription.assignedUsers.length === 0;
                                return (
                                  <div
                                    key={`${login.id}-sub-${accountIndex}-${subIndex}`}
                                    className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-zinc-800"
                                  >
                                    {subscriptions.length > 1 ? (
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Subscription {subIndex + 1}
                                      </p>
                                    ) : (
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Subscription
                                      </p>
                                    )}
                                    <FieldRow
                                      label="Subscription ID"
                                      value={subscription.subscriptionId || "Not set"}
                                      copyKey={`${login.id}-sub-${accountIndex}-${subIndex}`}
                                      copied={copied}
                                      onCopy={
                                        subscription.subscriptionId
                                          ? () =>
                                              markCopied(
                                                `${login.id}-sub-${accountIndex}-${subIndex}`,
                                                subscription.subscriptionId
                                              )
                                          : undefined
                                      }
                                    />
                                    <FieldRow
                                      label="Plan"
                                      value={subscription.plan || "Not set"}
                                      copyKey={`${login.id}-plan-${accountIndex}-${subIndex}`}
                                      copied={copied}
                                      onCopy={
                                        subscription.plan
                                          ? () =>
                                              markCopied(
                                                `${login.id}-plan-${accountIndex}-${subIndex}`,
                                                subscription.plan!
                                              )
                                          : undefined
                                      }
                                    />
                                    <FieldRow
                                      label="Activation code"
                                      value={subscription.activationCode || "Not set"}
                                      copyKey={`${login.id}-activation-${accountIndex}-${subIndex}`}
                                      copied={copied}
                                      onCopy={
                                        subscription.activationCode
                                          ? () =>
                                              markCopied(
                                                `${login.id}-activation-${accountIndex}-${subIndex}`,
                                                subscription.activationCode!
                                              )
                                          : undefined
                                      }
                                    />
                                    <FieldRow
                                      label="User limit"
                                      value={userLimitLabel(subscription)}
                                      copyKey={`${login.id}-limit-${accountIndex}-${subIndex}`}
                                      copied={copied}
                                    />
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Assigned users
                                      </p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        {unrestricted
                                          ? "Everyone"
                                          : `${assigned.length} assigned`}
                                      </p>
                                      {!unrestricted && assigned.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {assigned.map((person) => (
                                            <Avatar
                                              key={person.id}
                                              size="sm"
                                              title={person.name || person.email}
                                            >
                                              {person.image ? (
                                                <AvatarImage src={person.image} alt="" />
                                              ) : null}
                                              <AvatarFallback>
                                                {initials(person.name, person.email)}
                                              </AvatarFallback>
                                            </Avatar>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                        {login.notes ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Notes
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm">
                              {login.notes}
                            </p>
                          </div>
                        ) : (
                          <FieldRow
                            label="Notes"
                            value="Not set"
                            copyKey={`${login.id}-notes`}
                            copied={copied}
                          />
                        )}
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit login" : "Add login"}</DialogTitle>
            <DialogDescription>
              Username and password first, then each subscription ID, plan,
              activation code, and user limit, then the people assigned to that
              seat.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate({
                name: form.name,
                category: form.category,
                url: form.url,
                accounts: form.accounts.map((account) => ({
                  username: account.username,
                  password: account.password,
                  subscriptions: account.subscriptions.map((subscription) => ({
                    subscriptionId: subscription.subscriptionId,
                    plan: subscription.plan,
                    activationCode: subscription.activationCode,
                    userLimit:
                      subscription.userLimit.trim() === ""
                        ? null
                        : subscription.userLimit,
                    assignedUsers: staff.map((person) => ({
                      userId: person.id,
                      enabled: subscription.allowed[person.id] !== false,
                    })),
                  })),
                })),
                notes: form.notes,
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="login-name">Service name</Label>
                <Input
                  id="login-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Helium 10"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      category: value as SharedLoginCategory,
                    }))
                  }
                >
                  <SelectTrigger id="login-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARED_LOGIN_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {SHARED_LOGIN_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-url">Login URL</Label>
                <Input
                  id="login-url"
                  value={form.url}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, url: event.target.value }))
                  }
                  placeholder="members.helium10.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-3 sm:col-span-2">
                <p className="text-sm font-medium">Users</p>
                <p className="text-xs text-muted-foreground">
                  Each login has a username and password. Subscriptions and
                  assigned people nest underneath. Leave a password blank to keep
                  the current one.
                </p>
                {form.accounts.map((account, accountIndex) => (
                  <div
                    key={accountIndex}
                    className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        User {accountIndex + 1}
                      </p>
                      {form.accounts.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              accounts: prev.accounts.filter(
                                (_, index) => index !== accountIndex
                              ),
                            }))
                          }
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 dark:hover:bg-zinc-800"
                          aria-label={`Remove user ${accountIndex + 1}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`login-username-${accountIndex}`}>
                        Username / email
                      </Label>
                      <Input
                        id={`login-username-${accountIndex}`}
                        value={account.username}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            username: event.target.value,
                          })
                        }
                        placeholder="amazon@marketfoundry.agency"
                        autoComplete="off"
                        data-1p-ignore
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`login-password-${accountIndex}`}>
                        Password
                      </Label>
                      <Input
                        id={`login-password-${accountIndex}`}
                        type="password"
                        value={account.password}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            password: event.target.value,
                          })
                        }
                        placeholder={
                          editing && account.hasSecret
                            ? "Leave blank to keep the current password"
                            : "••••••••"
                        }
                        autoComplete="new-password"
                        data-1p-ignore
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Subscriptions</p>
                      {account.subscriptions.map((subscription, subIndex) => (
                        <div
                          key={subIndex}
                          className="space-y-3 rounded-md border border-stone-200 p-3 dark:border-zinc-800"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Subscription {subIndex + 1}
                            </p>
                            {account.subscriptions.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateAccount(accountIndex, {
                                    subscriptions: account.subscriptions.filter(
                                      (_, index) => index !== subIndex
                                    ),
                                  })
                                }
                                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 dark:hover:bg-zinc-800"
                                aria-label={`Remove subscription ${subIndex + 1} from user ${accountIndex + 1}`}
                              >
                                <Minus className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor={`login-subscription-${accountIndex}-${subIndex}`}
                            >
                              Subscription ID
                            </Label>
                            <Input
                              id={`login-subscription-${accountIndex}-${subIndex}`}
                              value={subscription.subscriptionId}
                              onChange={(event) =>
                                updateSubscription(accountIndex, subIndex, {
                                  subscriptionId: event.target.value,
                                })
                              }
                              placeholder="sub_123"
                              autoComplete="off"
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`login-plan-${accountIndex}-${subIndex}`}
                              >
                                Plan
                              </Label>
                              <Input
                                id={`login-plan-${accountIndex}-${subIndex}`}
                                value={subscription.plan}
                                onChange={(event) =>
                                  updateSubscription(accountIndex, subIndex, {
                                    plan: event.target.value,
                                  })
                                }
                                placeholder="Platinum"
                                autoComplete="off"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`login-activation-${accountIndex}-${subIndex}`}
                              >
                                Activation code
                              </Label>
                              <Input
                                id={`login-activation-${accountIndex}-${subIndex}`}
                                value={subscription.activationCode}
                                onChange={(event) =>
                                  updateSubscription(accountIndex, subIndex, {
                                    activationCode: event.target.value,
                                  })
                                }
                                autoComplete="off"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor={`login-user-limit-${accountIndex}-${subIndex}`}
                            >
                              User limit
                            </Label>
                            <Input
                              id={`login-user-limit-${accountIndex}-${subIndex}`}
                              type="number"
                              min={1}
                              max={9999}
                              inputMode="numeric"
                              value={subscription.userLimit}
                              onChange={(event) =>
                                updateSubscription(accountIndex, subIndex, {
                                  userLimit: event.target.value,
                                })
                              }
                              placeholder="e.g. 5 seats"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Assigned users</p>
                            <p className="text-xs text-muted-foreground">
                              Disable someone to hide this seat from them. Admins
                              can always see every login.
                            </p>
                            <div className="space-y-1 rounded-lg border border-stone-200 p-2 dark:border-zinc-800">
                              {staff.map((person) => {
                                const enabled =
                                  subscription.allowed[person.id] !== false;
                                return (
                                  <label
                                    key={person.id}
                                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-800/60"
                                  >
                                    <Avatar size="sm">
                                      {person.image ? (
                                        <AvatarImage src={person.image} alt="" />
                                      ) : null}
                                      <AvatarFallback>
                                        {initials(person.name, person.email)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm">
                                        {person.name || person.email}
                                      </span>
                                      {person.name ? (
                                        <span className="block truncate text-xs text-muted-foreground">
                                          {person.email}
                                        </span>
                                      ) : null}
                                    </span>
                                    <Switch
                                      checked={enabled}
                                      onCheckedChange={(checked) =>
                                        updateSubscription(accountIndex, subIndex, {
                                          allowed: {
                                            ...subscription.allowed,
                                            [person.id]: checked,
                                          },
                                        })
                                      }
                                      className="data-[state=checked]:bg-brand-solid"
                                      aria-label={`Assign ${person.name || person.email}`}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          updateAccount(accountIndex, {
                            subscriptions: [
                              ...account.subscriptions,
                              { ...EMPTY_SUBSCRIPTION, allowed: allEnabled(staff) },
                            ],
                          })
                        }
                      >
                        <Plus className="size-4" />
                        Add subscription ID
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      accounts: [
                        ...prev.accounts,
                        {
                          ...EMPTY_ACCOUNT,
                          subscriptions: [
                            { ...EMPTY_SUBSCRIPTION, allowed: allEnabled(staff) },
                          ],
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4" />
                  Add user
                </Button>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="login-notes">Notes</Label>
                <Textarea
                  id="login-notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="2FA mailbox, recovery codes…"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={closeDialog}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="brand"
                className="rounded-full"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {editing ? "Save" : "Add login"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this login?"
        description={
          deleteTarget
            ? `This removes ${deleteTarget.name} from the shared vault. Type delete to confirm.`
            : ""
        }
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-brand-solid px-3 h-9 text-[13px] font-medium leading-none text-white"
          : "rounded-full border border-stone-300 px-3 h-9 text-[13px] font-medium leading-none text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }
    >
      {children}
    </button>
  );
}

function FieldRow({
  label,
  value,
  copyKey,
  copied,
  onCopy,
  extra,
}: {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums">
          {value}
        </p>
        {extra}
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-stone-100 dark:hover:bg-zinc-800"
            aria-label={`Copy ${label.toLowerCase()}`}
          >
            {copied === copyKey ? (
              <Check className="size-3.5 text-brand-green" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
