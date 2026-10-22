import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sharedLogins,
  sharedLoginUsers,
  users,
  type SharedLoginRow,
} from "@/lib/db/schema";
import {
  sealSharedLoginSecret,
  unsealSharedLoginSecret,
  emptySharedLoginSecret,
  type SharedLoginSecret,
} from "@/lib/crypto/shared-logins";
import {
  canAccessSharedLogin,
  isSharedLoginCategory,
  parseStringList,
  type SharedLoginAccess,
  type SharedLoginAccessWrite,
  type SharedLoginAccount,
  type SharedLoginCategory,
  type SharedLoginPublic,
  type SharedLoginStaff,
  type SharedLoginSubscription,
  type SharedLoginWrite,
  type StoredAssignedUser,
  type StoredSharedLoginAccount,
  type StoredSharedLoginSubscription,
} from "@/lib/shared-logins";
import { isHubStaff } from "@/lib/roles";

function asStoredList(raw: unknown, fallback: string | null): string[] {
  if (Array.isArray(raw)) {
    return parseStringList(raw, 255);
  }
  return fallback ? [fallback] : [];
}

function groupsFromSecret(secret: SharedLoginSecret): string[][] {
  if (secret.subscriptionPasswords.length > 0) return secret.subscriptionPasswords;
  if (secret.accountPasswords.length > 0) return [secret.accountPasswords];
  return secret.password ? [[secret.password]] : [];
}

function groupsFromCiphertext(ciphertext: string | null): string[][] {
  if (!ciphertext) return [];
  try {
    return groupsFromSecret(unsealSharedLoginSecret(ciphertext));
  } catch {
    return [[""]];
  }
}

function notesFromRow(row: SharedLoginRow): string | null {
  if (row.notes) return row.notes;
  if (!row.secretCiphertext) return null;
  try {
    const notes = unsealSharedLoginSecret(row.secretCiphertext).notes;
    return notes || null;
  } catch {
    return null;
  }
}

function asAssigned(raw: unknown): StoredAssignedUser[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const users: StoredAssignedUser[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const userId = typeof row.userId === "string" ? row.userId : "";
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    users.push({ userId, enabled: row.enabled !== false });
  }
  return users;
}

function asSubscription(row: Record<string, unknown>): StoredSharedLoginSubscription | null {
  const subscriptionId =
    typeof row.subscriptionId === "string" ? row.subscriptionId.trim() : "";
  const plan =
    typeof row.plan === "string" && row.plan.trim() ? row.plan.trim() : null;
  const activationCode =
    typeof row.activationCode === "string" && row.activationCode.trim()
      ? row.activationCode.trim()
      : null;
  const userLimit =
    typeof row.userLimit === "number" && Number.isInteger(row.userLimit)
      ? row.userLimit
      : null;
  const assignedUsers = asAssigned(row.assignedUsers);
  if (
    !subscriptionId &&
    !plan &&
    !activationCode &&
    userLimit == null &&
    assignedUsers.length === 0
  ) {
    return null;
  }
  return { subscriptionId, plan, activationCode, userLimit, assignedUsers };
}

function coalesceBlankAccounts(
  accounts: StoredSharedLoginAccount[]
): StoredSharedLoginAccount[] {
  const named: StoredSharedLoginAccount[] = [];
  for (const account of accounts) {
    if (account.username) {
      named.push({
        username: account.username,
        subscriptions: [...account.subscriptions],
      });
    } else if (named.length > 0) {
      named[named.length - 1]!.subscriptions.push(...account.subscriptions);
    } else {
      named.push({
        username: "",
        subscriptions: [...account.subscriptions],
      });
    }
  }
  return named;
}

function storedAccounts(raw: unknown): StoredSharedLoginAccount[] {
  if (!Array.isArray(raw)) return [];
  if (
    raw.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        Array.isArray((entry as { subscriptions?: unknown }).subscriptions)
    )
  ) {
    return coalesceBlankAccounts(
      raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as Record<string, unknown>;
        const username =
          typeof row.username === "string" ? row.username.trim() : "";
        const subscriptions = Array.isArray(row.subscriptions)
          ? row.subscriptions.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const subscription = asSubscription(
                item as Record<string, unknown>
              );
              return subscription ? [subscription] : [];
            })
          : [];
        if (!username && subscriptions.length === 0) return [];
        return [{ username, subscriptions }];
      })
    );
  }

  const legacy = raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const subscription = asSubscription(row);
    const usernames = asStoredList(row.usernames, null);
    if (!subscription && usernames.length === 0) return [];
    return [
      {
        subscription: subscription ?? {
          subscriptionId: "",
          plan: null,
          activationCode: null,
          userLimit: null,
          assignedUsers: [],
        },
        usernames,
      },
    ];
  });

  const accounts: StoredSharedLoginAccount[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of legacy) {
    if (item.usernames.length === 0) {
      if (accounts.length === 0) {
        accounts.push({ username: "", subscriptions: [] });
      }
      accounts[0]!.subscriptions.push(item.subscription);
      continue;
    }
    for (const username of item.usernames) {
      const key = username.toLowerCase();
      let index = indexByKey.get(key);
      if (index == null) {
        index = accounts.length;
        indexByKey.set(key, index);
        accounts.push({ username, subscriptions: [] });
      }
      accounts[index]!.subscriptions.push(item.subscription);
    }
  }
  return coalesceBlankAccounts(accounts);
}

function resolveAssigned(
  assigned: StoredAssignedUser[],
  fallback: SharedLoginAccess[],
  staffById: Map<string, SharedLoginStaff>
): SharedLoginAccess[] {
  const source = assigned.length > 0 ? assigned : fallback.map((user) => ({
    userId: user.id,
    enabled: user.enabled,
  }));
  return source.flatMap((user) => {
    const person = staffById.get(user.userId);
    if (!person) return [];
    return [{ ...person, enabled: user.enabled }];
  });
}

function subscriptionsFromRow(
  row: SharedLoginRow,
  fallbackAccess: SharedLoginAccess[],
  staffById: Map<string, SharedLoginStaff>
): SharedLoginAccount[] {
  const groups = groupsFromCiphertext(row.secretCiphertext);
  const stored = storedAccounts(row.subscriptions);
  const accountPasswords =
    groups.length === 1 && (stored.length <= 1 || groups[0]!.length === stored.length)
      ? groups[0] ?? []
      : groups.map((group) => group.find(Boolean) || group[0] || "");

  if (stored.length > 0) {
    return stored.map((account, index) => ({
      username: account.username,
      hasSecret: Boolean(accountPasswords[index] || groups[index]?.[0]),
      subscriptions: account.subscriptions.map((subscription) => ({
        subscriptionId: subscription.subscriptionId,
        plan: subscription.plan,
        activationCode: subscription.activationCode,
        userLimit: subscription.userLimit,
        assignedUsers: resolveAssigned(
          subscription.assignedUsers,
          fallbackAccess,
          staffById
        ),
      })),
    }));
  }

  const usernames = asStoredList(row.usernames, row.username);
  const passwords = groups[0] ?? [];
  const subscriptionIds = asStoredList(row.subscriptionIds, row.subscriptionId);
  const subscriptions: SharedLoginSubscription[] =
    subscriptionIds.length === 0 &&
    !row.activationCode &&
    row.userLimit == null
      ? []
      : [
          {
            subscriptionId: subscriptionIds[0] ?? "",
            plan: null,
            activationCode: row.activationCode,
            userLimit: row.userLimit,
            assignedUsers: fallbackAccess,
          },
          ...subscriptionIds.slice(1).map((subscriptionId) => ({
            subscriptionId,
            plan: null,
            activationCode: null,
            userLimit: null,
            assignedUsers: fallbackAccess,
          })),
        ];

  if (usernames.length === 0 && passwords.every((value) => !value) && subscriptions.length === 0) {
    return [];
  }

  const names = usernames.length > 0 ? usernames : [""];
  return names.map((username, index) => ({
    username,
    hasSecret: Boolean(passwords[index]),
    subscriptions: index === 0 ? subscriptions : [],
  }));
}

function flattenAssigned(accounts: SharedLoginAccount[]): SharedLoginAccess[] {
  const seen = new Map<string, SharedLoginAccess>();
  for (const account of accounts) {
    for (const subscription of account.subscriptions) {
      for (const user of subscription.assignedUsers) {
        const current = seen.get(user.id);
        if (!current) {
          seen.set(user.id, user);
        } else if (user.enabled) {
          seen.set(user.id, { ...current, enabled: true });
        }
      }
    }
  }
  return [...seen.values()];
}

function toPublic(
  row: SharedLoginRow,
  allowedUsers: SharedLoginAccess[],
  staff: SharedLoginStaff[]
): SharedLoginPublic {
  const staffById = new Map(staff.map((person) => [person.id, person]));
  const accounts = subscriptionsFromRow(row, allowedUsers, staffById);
  const usernames = accounts.map((account) => account.username).filter(Boolean);
  const subscriptions = accounts.flatMap((account) => account.subscriptions);
  const subscriptionIds = subscriptions
    .map((subscription) => subscription.subscriptionId)
    .filter(Boolean);
  const assigned = flattenAssigned(accounts);
  const first = subscriptions[0];
  return {
    id: row.id,
    name: row.name,
    category: isSharedLoginCategory(row.category) ? row.category : "other",
    url: row.url,
    username: usernames[0] ?? null,
    usernames,
    accounts,
    subscriptions,
    activationCode: first?.activationCode ?? null,
    subscriptionId: subscriptionIds[0] ?? null,
    subscriptionIds,
    userLimit: first?.userLimit ?? null,
    notes: notesFromRow(row),
    hasSecret: accounts.some((account) => account.hasSecret),
    accessRestricted: assigned.length > 0,
    allowedUsers: assigned.length > 0 ? assigned : allowedUsers,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function secretFromWrite(
  data: SharedLoginWrite,
  existing?: SharedLoginSecret
): string | null {
  const existingPasswords =
    existing?.accountPasswords?.length
      ? existing.accountPasswords
      : existing
        ? groupsFromSecret(existing).map((group) => group.find(Boolean) || "")
        : [];
  const accountPasswords = data.accounts.map((account, index) => {
    if (account.password && account.password.length > 0) return account.password;
    return existingPasswords[index] ?? "";
  });
  const password = accountPasswords[0] ?? "";
  if (!password && accountPasswords.every((value) => !value)) return null;
  return sealSharedLoginSecret({
    password,
    notes: "",
    accountPasswords,
    subscriptionPasswords: accountPasswords.map((value) => [value]),
  });
}

export async function listHubStaff(): Promise<SharedLoginStaff[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
    })
    .from(users)
    .orderBy(asc(users.name), asc(users.email));
  return rows
    .filter((row) => isHubStaff(row.role))
    .map(({ id, name, email, image }) => ({ id, name, email, image }));
}

async function accessByLogin(
  loginIds: string[],
  staff: SharedLoginStaff[]
): Promise<Map<string, SharedLoginAccess[]>> {
  const map = new Map<string, SharedLoginAccess[]>();
  if (loginIds.length === 0) return map;
  const rows = await db
    .select()
    .from(sharedLoginUsers)
    .where(inArray(sharedLoginUsers.loginId, loginIds));
  const staffById = new Map(staff.map((person) => [person.id, person]));
  for (const row of rows) {
    const person = staffById.get(row.userId);
    if (!person) continue;
    const list = map.get(row.loginId) ?? [];
    list.push({ ...person, enabled: row.enabled });
    map.set(row.loginId, list);
  }
  return map;
}

function flattenWriteAccess(
  data: SharedLoginWrite
): SharedLoginAccessWrite[] | null {
  const assigned = data.accounts.flatMap((account) =>
    account.subscriptions.flatMap((subscription) => subscription.assignedUsers)
  );
  if (assigned.length > 0) return assigned;
  return data.allowedUsers;
}

async function replaceAccess(
  loginId: string,
  allowedUsers: SharedLoginAccessWrite[] | null
): Promise<void> {
  if (allowedUsers == null) return;
  await db
    .delete(sharedLoginUsers)
    .where(eq(sharedLoginUsers.loginId, loginId));
  const allEnabled =
    allowedUsers.length === 0 || allowedUsers.every((user) => user.enabled);
  if (allEnabled) return;
  const unique = new Map<string, SharedLoginAccessWrite>();
  for (const user of allowedUsers) {
    const current = unique.get(user.userId);
    if (!current) unique.set(user.userId, user);
    else if (user.enabled) unique.set(user.userId, { ...current, enabled: true });
  }
  await db.insert(sharedLoginUsers).values(
    [...unique.values()].map((user) => ({
      loginId,
      userId: user.userId,
      enabled: user.enabled,
    }))
  );
}

export async function listSharedLogins(opts: {
  userId: string;
  isAdmin: boolean;
}): Promise<{ logins: SharedLoginPublic[]; staff: SharedLoginStaff[] }> {
  const staff = await listHubStaff();
  const rows = await db
    .select()
    .from(sharedLogins)
    .orderBy(asc(sharedLogins.category), asc(sharedLogins.name));
  const access = await accessByLogin(
    rows.map((row) => row.id),
    staff
  );
  const logins = rows
    .map((row) => toPublic(row, access.get(row.id) ?? [], staff))
    .filter((login) =>
      canAccessSharedLogin(login, opts.userId, opts.isAdmin)
    );
  return { logins, staff };
}

function loginValues(
  data: SharedLoginWrite,
  existingNotes?: string | null
) {
  const stored: StoredSharedLoginAccount[] = data.accounts.map((account) => ({
    username: account.username,
    subscriptions: account.subscriptions.map((subscription) => ({
      subscriptionId: subscription.subscriptionId,
      plan: subscription.plan,
      activationCode: subscription.activationCode,
      userLimit: subscription.userLimit,
      assignedUsers: subscription.assignedUsers,
    })),
  }));
  const usernames = stored.map((account) => account.username).filter(Boolean);
  const storedSubs = stored.flatMap((account) => account.subscriptions);
  const subscriptionIds = storedSubs
    .map((subscription) => subscription.subscriptionId)
    .filter(Boolean);
  const first = storedSubs[0];
  return {
    name: data.name,
    category: data.category as SharedLoginCategory,
    url: data.url,
    username: usernames[0] ?? null,
    usernames,
    activationCode: first?.activationCode ?? null,
    subscriptionId: subscriptionIds[0] ?? null,
    subscriptionIds,
    userLimit: first?.userLimit ?? null,
    subscriptions: stored,
    notes: data.notes != null ? data.notes : existingNotes,
  };
}

export async function createSharedLogin(
  data: SharedLoginWrite,
  userId: string
): Promise<SharedLoginPublic> {
  const [row] = await db
    .insert(sharedLogins)
    .values({
      ...loginValues(data),
      secretCiphertext: secretFromWrite(data),
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  if (!row) throw new Error("Failed to create shared login");
  await replaceAccess(row.id, flattenWriteAccess(data));
  const staff = await listHubStaff();
  const access = await accessByLogin([row.id], staff);
  return toPublic(row, access.get(row.id) ?? [], staff);
}

export async function updateSharedLogin(
  id: string,
  data: SharedLoginWrite,
  userId: string
): Promise<SharedLoginPublic | null> {
  const [existing] = await db
    .select()
    .from(sharedLogins)
    .where(eq(sharedLogins.id, id))
    .limit(1);
  if (!existing) return null;

  const prior = existing.secretCiphertext
    ? unsealSharedLoginSecret(existing.secretCiphertext)
    : emptySharedLoginSecret();

  const [row] = await db
    .update(sharedLogins)
    .set({
      ...loginValues(data, existing.notes),
      secretCiphertext: secretFromWrite(data, prior),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(sharedLogins.id, id))
    .returning();
  if (!row) return null;
  await replaceAccess(id, flattenWriteAccess(data));
  const staff = await listHubStaff();
  const access = await accessByLogin([id], staff);
  return toPublic(row, access.get(id) ?? [], staff);
}

export async function deleteSharedLogin(id: string): Promise<boolean> {
  const deleted = await db
    .delete(sharedLogins)
    .where(eq(sharedLogins.id, id))
    .returning({ id: sharedLogins.id });
  return deleted.length > 0;
}

export async function revealSharedLogin(
  id: string,
  opts: { userId: string; isAdmin: boolean }
): Promise<{ public: SharedLoginPublic; secret: SharedLoginSecret } | "forbidden" | null> {
  const [row] = await db
    .select()
    .from(sharedLogins)
    .where(eq(sharedLogins.id, id))
    .limit(1);
  if (!row) return null;
  const staff = await listHubStaff();
  const access = await accessByLogin([id], staff);
  const pub = toPublic(row, access.get(id) ?? [], staff);
  if (!canAccessSharedLogin(pub, opts.userId, opts.isAdmin)) return "forbidden";
  const secret = row.secretCiphertext
    ? unsealSharedLoginSecret(row.secretCiphertext)
    : emptySharedLoginSecret();
  return { public: pub, secret };
}
