export type TaskGroupKey = "overdue" | "today" | "week" | "later" | "nodate";

export interface DashTask {
  id: string;
  source: "asana" | "hub";
  title: string;
  clientIdCode: string | null;
  dueOn: string | null; // YYYY-MM-DD
  status: string | null;
  priority: string | null;
  url: string;
  goLiveDate?: string | null; // YYYY-MM-DD, Asana "Go Live Date" (1o8)
}

export interface DashAlert {
  // 1o8: golive, late, client, sow, blocked, nodate. ppc/stale are MarketFoundry (Amazon) leftovers, no longer produced.
  kind: "golive" | "late" | "client" | "sow" | "blocked" | "nodate" | "ppc" | "stale";
  severity: "critical" | "warning" | "info";
  clientIdCode: string | null;
  message: string;
  url: string;
  at: string | null; // ISO timestamp or YYYY-MM-DD, for tie-break ordering
}

export interface MyAccount {
  clientIdCode: string;
  clientName: string;
  clientLogoUrl: string | null;
  roles: string[];
}

export interface AccountCard extends MyAccount {
  salesLastWeek: number | null;
  salesWeekBefore: number | null;
  changePct: number | null;
  spark: number[]; // daily product_sales for last full week, oldest first
  sparkDates: string[]; // YYYY-MM-DD, parallel to spark
  openTasks: number;
  overdueTasks: number;
  alertCount: number;
  /** The client's Asana readiness across every assignee (null when it has no open tasks). */
  readiness: { open: number; dueToday: number; overdue: number; pct: number } | null;
}

export interface Section<T> { data: T | null; error: string | null }

/** A monthly report waiting on this person's review (or, for the CEO, on sending). */
export interface ReviewItem {
  id: string;
  clientIdCode: string;
  clientName: string;
  period: string; // YYYY-MM
  periodLabel: string;
  stageLabel: string;
  waitingDays: number;
  url: string;
}

export interface MyDashboardPayload {
  viewer: { id: string; canPickPerson: boolean };
  person: { id: string; name: string | null; email: string; image: string | null };
  today: string;
  sync: { lastSuccessAt: string | null; lastError: string | null; connected: boolean };
  tasks: Section<Record<TaskGroupKey, DashTask[]>>;
  dueStrip: Section<{ date: string; count: number }[]>;
  alerts: Section<DashAlert[]>;
  reviews: Section<ReviewItem[]>;
  reviewsAsanaUrl: string | null; // latest period's Asana parent task
  accounts: Section<{ cards: AccountCard[]; matchedName: string | null; salesWeek: { start: string; end: string } | null }>;
  staff: { id: string; name: string | null }[] | null; // only for admins
}
