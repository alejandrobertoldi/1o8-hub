export const SHARED_LOGIN_CATEGORIES = [
  "ai",
  "seo",
  "vpn",
  "amazon",
  "design",
  "comms",
  "other",
] as const;

export type SharedLoginCategory = (typeof SHARED_LOGIN_CATEGORIES)[number];

export const SHARED_LOGIN_CATEGORY_LABELS: Record<SharedLoginCategory, string> = {
  ai: "AI",
  seo: "SEO",
  vpn: "VPN",
  amazon: "Amazon",
  design: "Design",
  comms: "Comms",
  other: "Other",
};

export function isSharedLoginCategory(
  value: unknown
): value is SharedLoginCategory {
  return (
    typeof value === "string" &&
    (SHARED_LOGIN_CATEGORIES as readonly string[]).includes(value)
  );
}

export type SharedLoginStaff = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

export type SharedLoginAccess = SharedLoginStaff & {
  enabled: boolean;
};

export type SharedLoginSubscription = {
  subscriptionId: string;
  plan: string | null;
  activationCode: string | null;
  userLimit: number | null;
  assignedUsers: SharedLoginAccess[];
};

export type SharedLoginAccount = {
  username: string;
  hasSecret: boolean;
  subscriptions: SharedLoginSubscription[];
};

export type StoredAssignedUser = {
  userId: string;
  enabled: boolean;
};

export type StoredSharedLoginSubscription = {
  subscriptionId: string;
  plan: string | null;
  activationCode: string | null;
  userLimit: number | null;
  assignedUsers: StoredAssignedUser[];
};

export type StoredSharedLoginAccount = {
  username: string;
  subscriptions: StoredSharedLoginSubscription[];
};

export type SharedLoginPublic = {
  id: string;
  name: string;
  category: SharedLoginCategory;
  url: string | null;
  username: string | null;
  usernames: string[];
  accounts: SharedLoginAccount[];
  subscriptions: SharedLoginSubscription[];
  activationCode: string | null;
  subscriptionId: string | null;
  subscriptionIds: string[];
  userLimit: number | null;
  notes: string | null;
  hasSecret: boolean;
  accessRestricted: boolean;
  allowedUsers: SharedLoginAccess[];
  createdAt: string;
  updatedAt: string;
};

export type SharedLoginAccessWrite = {
  userId: string;
  enabled: boolean;
};

export type SharedLoginSubscriptionWrite = {
  subscriptionId: string;
  plan: string | null;
  activationCode: string | null;
  userLimit: number | null;
  assignedUsers: SharedLoginAccessWrite[];
};

export type SharedLoginAccountWrite = {
  username: string;
  password: string | null;
  subscriptions: SharedLoginSubscriptionWrite[];
};

export type SharedLoginWrite = {
  name: string;
  category: SharedLoginCategory;
  url: string | null;
  username: string | null;
  accounts: SharedLoginAccountWrite[];
  subscriptions: SharedLoginSubscriptionWrite[];
  activationCode: string | null;
  subscriptionId: string | null;
  subscriptionIds: string[];
  userLimit: number | null;
  password: string | null;
  notes: string | null;
  allowedUsers: SharedLoginAccessWrite[] | null;
};

const NAME_MAX = 120;
const USERNAME_MAX = 255;
const CODE_MAX = 255;
const PLAN_MAX = 120;
const URL_MAX = 500;
const PASSWORD_MAX = 500;
const NOTES_MAX = 4000;
const LIST_MAX = 20;
const USER_LIMIT_MAX = 9999;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asTrimmed(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function normalizeLoginUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function parseStringList(
  raw: unknown,
  maxLen: number,
  maxItems = LIST_MAX
): string[] {
  const source = Array.isArray(raw) ? raw : raw != null && raw !== "" ? [raw] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const value = asTrimmed(item, maxLen);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseUserLimit(
  raw: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;
  if (!Number.isInteger(n) || n < 1 || n > USER_LIMIT_MAX) {
    return {
      ok: false,
      error: "User limit must be a whole number between 1 and 9999.",
    };
  }
  return { ok: true, value: n };
}

export function parseAllowedUsers(
  raw: unknown
): SharedLoginAccessWrite[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const users: SharedLoginAccessWrite[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const userId = typeof row.userId === "string" ? row.userId : "";
    if (!UUID_RE.test(userId) || seen.has(userId)) continue;
    seen.add(userId);
    users.push({ userId, enabled: row.enabled !== false });
  }
  return users;
}

function parseSubscriptionMeta(
  row: Record<string, unknown>,
  fallbackAssigned: SharedLoginAccessWrite[]
):
  | { ok: true; value: SharedLoginSubscriptionWrite | null }
  | { ok: false; error: string } {
  if (row.assignedUsers != null && !Array.isArray(row.assignedUsers)) {
    return { ok: false, error: "Assigned users must be a list." };
  }
  const userLimit = parseUserLimit(row.userLimit);
  if (!userLimit.ok) return userLimit;
  const subscriptionId = asTrimmed(row.subscriptionId, CODE_MAX) ?? "";
  const plan = asTrimmed(row.plan, PLAN_MAX);
  const activationCode = asTrimmed(row.activationCode, CODE_MAX);
  const assignedUsers =
    parseAllowedUsers(row.assignedUsers) ?? fallbackAssigned;
  if (
    !subscriptionId &&
    !plan &&
    !activationCode &&
    userLimit.value == null &&
    assignedUsers.length === 0
  ) {
    return { ok: true, value: null };
  }
  return {
    ok: true,
    value: {
      subscriptionId,
      plan,
      activationCode,
      userLimit: userLimit.value,
      assignedUsers,
    },
  };
}

function parseNestedSubscriptions(
  raw: unknown,
  fallbackAssigned: SharedLoginAccessWrite[]
):
  | { ok: true; value: SharedLoginSubscriptionWrite[] }
  | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Subscriptions must be a list." };
  }
  const subscriptions: SharedLoginSubscriptionWrite[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const parsed = parseSubscriptionMeta(
      entry as Record<string, unknown>,
      fallbackAssigned
    );
    if (!parsed.ok) return parsed;
    if (!parsed.value) continue;
    subscriptions.push(parsed.value);
    if (subscriptions.length >= LIST_MAX) break;
  }
  return { ok: true, value: subscriptions };
}

function accountPassword(row: Record<string, unknown>): string | null {
  return typeof row.password === "string"
    ? row.password.slice(0, PASSWORD_MAX)
    : null;
}

function looksLikeAccountTree(accounts: unknown[]): boolean {
  return accounts.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      Array.isArray((entry as { subscriptions?: unknown }).subscriptions)
  );
}

function invertLegacySubscriptions(
  subscriptions: {
    meta: SharedLoginSubscriptionWrite;
    accounts: { username: string; password: string | null }[];
  }[]
): SharedLoginAccountWrite[] {
  const accounts: SharedLoginAccountWrite[] = [];
  const indexByKey = new Map<string, number>();

  for (const subscription of subscriptions) {
    const rows =
      subscription.accounts.length > 0
        ? subscription.accounts
        : [{ username: "", password: null }];
    for (const row of rows) {
      const key = row.username.trim().toLowerCase() || `__blank_${accounts.length}`;
      let index = indexByKey.get(key);
      if (index == null) {
        index = accounts.length;
        indexByKey.set(key, index);
        accounts.push({
          username: row.username,
          password: row.password,
          subscriptions: [],
        });
      } else if (!accounts[index]!.password && row.password) {
        accounts[index]!.password = row.password;
      }
      accounts[index]!.subscriptions.push(subscription.meta);
      if (accounts.length >= LIST_MAX) break;
    }
    if (accounts.length >= LIST_MAX) break;
  }

  return accounts;
}

export function parseLoginAccounts(
  input: Record<string, unknown>
):
  | { ok: true; value: SharedLoginAccountWrite[] }
  | { ok: false; error: string } {
  const fallbackAssigned = parseAllowedUsers(input.allowedUsers) ?? [];

  if (input.accounts != null && !Array.isArray(input.accounts)) {
    return { ok: false, error: "Users must be a list." };
  }
  if (input.subscriptions != null && !Array.isArray(input.subscriptions)) {
    return { ok: false, error: "Subscriptions must be a list." };
  }

  if (Array.isArray(input.accounts) && looksLikeAccountTree(input.accounts)) {
    const accounts: SharedLoginAccountWrite[] = [];
    for (const entry of input.accounts) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const subscriptions = parseNestedSubscriptions(
        row.subscriptions,
        parseAllowedUsers(row.assignedUsers) ?? fallbackAssigned
      );
      if (!subscriptions.ok) return subscriptions;
      const username = asTrimmed(row.username, USERNAME_MAX) ?? "";
      const password = accountPassword(row);
      if (!username && !password && subscriptions.value.length === 0) continue;
      accounts.push({
        username,
        password,
        subscriptions: subscriptions.value,
      });
      if (accounts.length >= LIST_MAX) break;
    }
    return { ok: true, value: accounts };
  }

  if (Array.isArray(input.subscriptions)) {
    const legacy: {
      meta: SharedLoginSubscriptionWrite;
      accounts: { username: string; password: string | null }[];
    }[] = [];
    for (const entry of input.subscriptions) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (row.accounts != null && !Array.isArray(row.accounts)) {
        return { ok: false, error: "Users must be a list." };
      }
      const meta = parseSubscriptionMeta(row, fallbackAssigned);
      if (!meta.ok) return meta;
      const nestedAccounts: { username: string; password: string | null }[] = [];
      if (Array.isArray(row.accounts)) {
        for (const account of row.accounts) {
          if (!account || typeof account !== "object") continue;
          const accountRow = account as Record<string, unknown>;
          const username = asTrimmed(accountRow.username, USERNAME_MAX) ?? "";
          const password = accountPassword(accountRow);
          if (!username && !password) continue;
          nestedAccounts.push({ username, password });
        }
      }
      if (!meta.value && nestedAccounts.length === 0) continue;
      legacy.push({
        meta: meta.value ?? {
          subscriptionId: "",
          plan: null,
          activationCode: null,
          userLimit: null,
          assignedUsers: fallbackAssigned,
        },
        accounts: nestedAccounts,
      });
    }
    if (legacy.length > 0) {
      return { ok: true, value: invertLegacySubscriptions(legacy) };
    }
  }

  const username = asTrimmed(input.username, USERNAME_MAX) ?? "";
  const password = accountPassword(input);
  const subscriptions = parseNestedSubscriptions(
    input.subscriptions,
    fallbackAssigned
  );
  if (!subscriptions.ok) return subscriptions;

  if (
    subscriptions.value.length === 0 &&
    (asTrimmed(input.subscriptionId, CODE_MAX) ||
      asTrimmed(input.plan, PLAN_MAX) ||
      asTrimmed(input.activationCode, CODE_MAX) ||
      input.userLimit != null)
  ) {
    const meta = parseSubscriptionMeta(input, fallbackAssigned);
    if (!meta.ok) return meta;
    if (meta.value) subscriptions.value.push(meta.value);
  }

  if (!username && !password && subscriptions.value.length === 0) {
    return { ok: true, value: [] };
  }

  return {
    ok: true,
    value: [
      {
        username,
        password,
        subscriptions: subscriptions.value,
      },
    ],
  };
}

export function canAccessSharedLogin(
  login: Pick<SharedLoginPublic, "accounts" | "accessRestricted" | "allowedUsers">,
  userId: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  const subscriptions = login.accounts.flatMap(
    (account) => account.subscriptions
  );
  if (subscriptions.length === 0) {
    if (!login.accessRestricted) return true;
    return login.allowedUsers.some((user) => user.id === userId && user.enabled);
  }
  if (subscriptions.some((subscription) => subscription.assignedUsers.length === 0)) {
    return true;
  }
  return subscriptions.some((subscription) =>
    subscription.assignedUsers.some((user) => user.id === userId && user.enabled)
  );
}

export function parseSharedLoginWrite(
  body: unknown
): { ok: true; data: SharedLoginWrite } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required." };
  }
  const input = body as Record<string, unknown>;
  const name = asTrimmed(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "A service name is required." };

  const categoryRaw = input.category ?? "other";
  if (!isSharedLoginCategory(categoryRaw)) {
    return { ok: false, error: "Pick a valid category." };
  }

  const urlRaw = asTrimmed(input.url, URL_MAX);
  const url = normalizeLoginUrl(urlRaw);
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "Login URL must be a valid http(s) address." };
  }

  if (input.allowedUsers != null && !Array.isArray(input.allowedUsers)) {
    return { ok: false, error: "Allowed users must be a list." };
  }

  const parsedAccounts = parseLoginAccounts(input);
  if (!parsedAccounts.ok) return parsedAccounts;

  const accounts = parsedAccounts.value;
  const firstAccount = accounts[0];
  const subscriptions = accounts.flatMap((account) => account.subscriptions);
  const firstSub = firstAccount?.subscriptions[0] ?? subscriptions[0];
  const notes =
    typeof input.notes === "string" ? input.notes.slice(0, NOTES_MAX) : null;
  const allowedUsers =
    parseAllowedUsers(input.allowedUsers) ??
    subscriptions.flatMap((subscription) => subscription.assignedUsers);

  return {
    ok: true,
    data: {
      name,
      category: categoryRaw,
      url,
      username: firstAccount?.username || null,
      accounts,
      subscriptions,
      activationCode: firstSub?.activationCode ?? null,
      subscriptionId: firstSub?.subscriptionId || null,
      subscriptionIds: subscriptions
        .map((subscription) => subscription.subscriptionId)
        .filter(Boolean),
      userLimit: firstSub?.userLimit ?? null,
      password: firstAccount?.password ?? null,
      notes,
      allowedUsers: allowedUsers.length > 0 ? allowedUsers : parseAllowedUsers(input.allowedUsers),
    },
  };
}
