export type Summary = {
  byMember: { userId: string; name: string | null; email: string; totalHours: number; clients: { clientIdCode: string; hours: number }[] }[];
  byClient: { clientIdCode: string; totalHours: number; members: { userId: string; name: string | null; hours: number }[] }[];
  categories: string[];
};
export type Kpis = { totalHours: number; activeMembers: number; activeClients: number; avgHoursPerMember: number };
export type Bar = { key: string; label: string; hours: number };
export type Heatmap = {
  members: { userId: string; label: string }[];
  clients: { code: string; label: string }[];
  cell: (userId: string, code: string) => number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function clientLabel(code: string): string {
  return code === "INTERNAL" ? "1o8" : code;
}

export function computeKpis(s: Summary): Kpis {
  const totalHours = round2(s.byMember.reduce((a, m) => a + m.totalHours, 0));
  const activeMembers = s.byMember.length;
  const activeClients = s.byClient.length;
  const avgHoursPerMember = activeMembers === 0 ? 0 : round2(totalHours / activeMembers);
  return { totalHours, activeMembers, activeClients, avgHoursPerMember };
}

export function topMembers(s: Summary, n: number): Bar[] {
  return s.byMember
    .map((m) => ({ key: m.userId, label: m.name ?? m.email, hours: m.totalHours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export function topClients(s: Summary, n: number): Bar[] {
  return s.byClient
    .map((c) => ({ key: c.clientIdCode, label: clientLabel(c.clientIdCode), hours: c.totalHours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export function buildHeatmap(s: Summary): Heatmap {
  const members = s.byMember.map((m) => ({ userId: m.userId, label: m.name ?? m.email }));
  const clients = s.byClient.map((c) => ({ code: c.clientIdCode, label: clientLabel(c.clientIdCode) }));
  const map = new Map<string, number>();
  for (const m of s.byMember) {
    for (const c of m.clients) map.set(`${m.userId}|${c.clientIdCode}`, c.hours);
  }
  return { members, clients, cell: (userId, code) => map.get(`${userId}|${code}`) ?? 0 };
}

type Row = { userId: string; name: string | null; email: string; clientCode: string; hours: number };

function flatten(s: Summary): Row[] {
  const rows: Row[] = [];
  for (const m of s.byMember) {
    for (const c of m.clients) {
      rows.push({ userId: m.userId, name: m.name, email: m.email, clientCode: c.clientIdCode, hours: c.hours });
    }
  }
  return rows;
}

function pivot(rows: Row[]): Summary {
  const byMemberMap = new Map<string, Summary["byMember"][number]>();
  const byClientMap = new Map<string, Summary["byClient"][number]>();
  for (const r of rows) {
    let m = byMemberMap.get(r.userId);
    if (!m) { m = { userId: r.userId, name: r.name, email: r.email, totalHours: 0, clients: [] }; byMemberMap.set(r.userId, m); }
    m.totalHours = round2(m.totalHours + r.hours);
    m.clients.push({ clientIdCode: r.clientCode, hours: r.hours });

    let c = byClientMap.get(r.clientCode);
    if (!c) { c = { clientIdCode: r.clientCode, totalHours: 0, members: [] }; byClientMap.set(r.clientCode, c); }
    c.totalHours = round2(c.totalHours + r.hours);
    c.members.push({ userId: r.userId, name: r.name, hours: r.hours });
  }
  const byMember = [...byMemberMap.values()].map((m) => ({ ...m, clients: m.clients.sort((a, b) => b.hours - a.hours) })).sort((a, b) => b.totalHours - a.totalHours);
  const byClient = [...byClientMap.values()].map((c) => ({ ...c, members: c.members.sort((a, b) => b.hours - a.hours) })).sort((a, b) => b.totalHours - a.totalHours);
  return { byMember, byClient, categories: [] };
}

export function filterSummary(s: Summary, memberIds: string[], clientCodes: string[]): Summary {
  const mSet = new Set(memberIds);
  const cSet = new Set(clientCodes);
  const rows = flatten(s).filter((r) => (mSet.size === 0 || mSet.has(r.userId)) && (cSet.size === 0 || cSet.has(r.clientCode)));
  return { ...pivot(rows), categories: s.categories };
}

export type DrillDay = { entryDate: string; hours: number };

/**
 * Parse a YYYY-MM-DD string as a LOCAL calendar date (not UTC). Avoids the
 * off-by-one where `new Date("2026-07-21")` is UTC midnight and renders as the
 * previous day in negative-offset timezones.
 */
export function parseLocalDate(entryDate: string): Date {
  const [y, m, d] = entryDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Compact day label in the viewer's locale, e.g. "Mon, Jul 21". */
export function formatDayLabel(entryDate: string): string {
  return parseLocalDate(entryDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Short weekday alone, e.g. "Sat". For the admin heatmap's weekday header row, which
 * carries a label in every column and so — unlike the month row — cannot overflow into
 * a blank neighbour. Locale is pinned to en-US for the same reason formatDayRowLabel
 * pins it: the app ships English-only, and a locale-dependent abbreviation length is
 * the one thing that could silently blow the column's ~8-character budget.
 */
export function formatWeekdayLabel(entryDate: string): string {
  return parseLocalDate(entryDate).toLocaleDateString("en-US", { weekday: "short" });
}

/** "07/01/2026 Wed" — MM/DD/YYYY + short weekday, parsed as a local date. */
export function formatDayRowLabel(entryDate: string): string {
  const d = parseLocalDate(entryDate);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${mm}/${dd}/${d.getFullYear()} ${dow}`;
}

/** "9:00 AM – 12:30 PM" from two "HH:MM(:SS)" 24h time strings. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/** "7:30 AM" from "HH:MM(:SS)". */
export function formatClock(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = mStr ?? "00";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

/** Repeated `&category=<enc>` query-string suffix for the given category labels; "" for none. */
export function buildCategoryQuery(categories: string[]): string {
  return categories.map((c) => `&category=${encodeURIComponent(c)}`).join("");
}

/** Convert a Date to ISO 8601 date string (YYYY-MM-DD). */
function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive list of YYYY-MM-DD strings from `from` to `to` (local dates). Returns [] if from > to. */
export function enumerateDays(from: string, to: string): string[] {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  const out: string[] = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toIso(d));
  }
  return out;
}

/**
 * Decimal hours → "H:MM" / "HH:MM" (e.g. 26.73 → "26:44", 3358.77 → "3,358:46").
 * Hours use grouping separators above 999; both parts stay zero-padded to at least
 * two digits so heatmap tabular-nums columns align on the colon. A duration, not a
 * clock time: 26:44 means 26 hours 44 minutes, never wrapped into a day.
 */
export function fmtHM(hours: number): string {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hStr = h.toLocaleString("en-US", { minimumIntegerDigits: 2, useGrouping: true });
  return `${hStr}:${String(m).padStart(2, "0")}`;
}

export type DayRow = { key: string; keyName: string | null; entryDate: string; totalHours: string };
export type DayHeatmap = {
  keys: { key: string; keyName: string | null }[]; // sorted by row total desc
  cell: (key: string, date: string) => number;
  dayTotal: (date: string) => number;
  maxCell: number; // max single cell, floored at 1
  maxDayTotal: number; // max per-day total, floored at 1
};

/** Pivot flat (key, entryDate, totalHours) rows into a day-by-key heatmap over `days`. */
export function buildDayHeatmap(rows: DayRow[], days: string[]): DayHeatmap {
  const dayset = new Set(days);
  const byKey = new Map<string, { keyName: string | null; total: number; cells: Map<string, number> }>();
  const dayTotals = new Map<string, number>();
  let maxCell = 0;

  for (const r of rows) {
    if (!dayset.has(r.entryDate)) continue;
    const hours = Number(r.totalHours);
    let entry = byKey.get(r.key);
    if (!entry) {
      entry = { keyName: r.keyName, total: 0, cells: new Map() };
      byKey.set(r.key, entry);
    }
    entry.total += hours;
    entry.cells.set(r.entryDate, (entry.cells.get(r.entryDate) ?? 0) + hours);
    dayTotals.set(r.entryDate, (dayTotals.get(r.entryDate) ?? 0) + hours);
    if (entry.cells.get(r.entryDate)! > maxCell) maxCell = entry.cells.get(r.entryDate)!;
  }

  const keys = [...byKey.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, v]) => ({ key, keyName: v.keyName }));
  const maxDayTotal = Math.max(1, ...[...dayTotals.values()]);

  return {
    keys,
    cell: (key, date) => byKey.get(key)?.cells.get(date) ?? 0,
    dayTotal: (date) => dayTotals.get(date) ?? 0,
    maxCell: Math.max(1, maxCell),
    maxDayTotal,
  };
}

/**
 * Traffic-light day signal against a workday target (default 8h per person;
 * pass 40 for the team "All" row).
 * - empty: no hours logged
 * - under: below target (scaled yellow)
 * - target: exactly the target (solid company green)
 * - over: above target (scaled red)
 *
 * Compared in whole minutes so float noise cannot flip the exact-target band.
 */
export type TrafficLight = "empty" | "under" | "target" | "over";

/** Per-person standard workday. */
export const PERSON_DAY_TARGET_HOURS = 8;
/** Team daily total target used by the admin heatmap "All" row. */
export const TEAM_DAY_TARGET_HOURS = 40;

export function trafficLight(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): TrafficLight {
  const mins = Math.round((hours || 0) * 60);
  const targetMins = Math.round(targetHours * 60);
  if (!(mins > 0)) return "empty";
  if (mins < targetMins) return "under";
  if (mins === targetMins) return "target";
  return "over";
}

/** Yellow intensity for under-target days: four equal bands from faint → full. */
const UNDER_YELLOW_PCT = [25, 50, 75, 100] as const;

function underYellowPct(hours: number, targetHours: number): number {
  const q = targetHours / 4;
  if (hours < q) return UNDER_YELLOW_PCT[0];
  if (hours < q * 2) return UNDER_YELLOW_PCT[1];
  if (hours < q * 3) return UNDER_YELLOW_PCT[2];
  return UNDER_YELLOW_PCT[3];
}

/**
 * Discrete overtime band for the red background scale relative to `targetHours`.
 * Stages 1-4 = (T, T+4) / [T+4, T+8) / [T+8, T+12) / T+12+.
 */
export function overtimeStage(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): 0 | 1 | 2 | 3 | 4 {
  if (!(hours > targetHours)) return 0;
  if (hours < targetHours + 4) return 1;
  if (hours < targetHours + 8) return 2;
  if (hours < targetHours + 12) return 3;
  return 4;
}

const OVERTIME_STAGE_PCT: Record<0 | 1 | 2 | 3 | 4, number> = { 0: 0, 1: 30, 2: 55, 3: 80, 4: 100 };

export function overtimeStageFill(stage: 0 | 1 | 2 | 3 | 4): string {
  const pct = OVERTIME_STAGE_PCT[stage];
  if (pct === 0) return "var(--card)";
  if (pct === 100) return "var(--overtime-blue)";
  return `color-mix(in srgb, var(--overtime-blue) ${pct}%, var(--card) ${100 - pct}%)`;
}

export function overtimeStageText(stage: 0 | 1 | 2 | 3 | 4): string {
  return stage >= 3 ? "text-overtime-blue-foreground" : "text-foreground/80";
}

/**
 * Traffic-light cell fill. Under and over are intensity-scaled; exact target is
 * solid company green. Pass hours so the yellow/red ramps can resolve.
 */
export function trafficLightFill(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): string {
  const signal = trafficLight(hours, targetHours);
  if (signal === "empty") return "var(--card)";
  if (signal === "target") return "#34C759"; // 1o8 company green
  if (signal === "under") {
    const pct = underYellowPct(hours, targetHours);
    if (pct === 100) return "var(--brand-yellow)";
    return `color-mix(in srgb, var(--brand-yellow) ${pct}%, var(--card))`;
  }
  return overtimeStageFill(overtimeStage(hours, targetHours));
}

/** Text class paired with trafficLightFill for contrast on each band. */
export function trafficLightText(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): string {
  const signal = trafficLight(hours, targetHours);
  if (signal === "empty") return "text-muted-foreground";
  if (signal === "target") return "text-white";
  if (signal === "under") return "text-foreground";
  return overtimeStageText(overtimeStage(hours, targetHours));
}

/**
 * Bucket 0 = faint empty; 1-4 ramp brand orange. Index by hoursBucket().
 * Kept for continuous intensity scales (aggregated totals) that are not the
 * per-person 8h traffic light.
 *
 * Mix against `--card` (not transparent) so cells stay opaque on glass/ambient
 * backgrounds and consecutive buckets read as distinct steps.
 */
export const BUCKET_PCT = [12, 32, 55, 78, 100];

export const bucketFill = (level: number) =>
  `color-mix(in srgb, var(--brand) ${BUCKET_PCT[level]}%, var(--card))`;

/**
 * Buckets 3-4 are saturated brand orange — use white text for clearer contrast on
 * the dense heatmap (preferred over brand-foreground / Off Black on full orange).
 * Fainter buckets keep the theme foreground.
 */
export const bucketText = (level: number) =>
  level >= 3 ? "text-white" : "text-foreground/80";

/** True once a day's total exceeds the workday target (default 8h). */
export function isOvertime(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): boolean {
  return trafficLight(hours, targetHours) === "over";
}

/**
 * Cell border for the traffic-light heatmap. Over keeps a heavier pure-red edge;
 * under/target/empty use the default hairline.
 */
export function overtimeBorderClass(
  hours: number,
  targetHours: number = PERSON_DAY_TARGET_HOURS,
): string {
  return trafficLight(hours, targetHours) === "over"
    ? "border-4 border-[#FF0000]"
    : "border border-stone-200 dark:border-zinc-800";
}

/** A header label owning the day-column at `index`. */
export type ColumnGroup = { index: number; label: string };

/**
 * Year header labels ("2026") for a flat days-as-columns grid: one at index 0, then one
 * at every column starting a new calendar year.
 *
 * Sibling of monthColumnGroups/weekColumnGroups and read the same way by the header —
 * label only on the column where the group starts. A year change is always also a month
 * change, so this row's group boundaries are a subset of the month row's and the two
 * dividers stay aligned.
 */
export function yearColumnGroups(days: string[]): ColumnGroup[] {
  const out: ColumnGroup[] = [];
  let prev: number | null = null;
  days.forEach((day, index) => {
    const year = parseLocalDate(day).getFullYear();
    if (year !== prev) {
      out.push({ index, label: String(year) });
      prev = year;
    }
  });
  return out;
}

/**
 * Month header labels ("August") for a flat days-as-columns grid: one at index 0, then
 * one at every column whose month differs from the column before it. The year is
 * deliberately absent — yearColumnGroups owns its own header row, so including it here
 * would print it twice. The year stays in the grouping key regardless, so the same month
 * in two different years can never collapse into one group.
 *
 * Deliberately NOT buildCalendarWeeks() — that util groups days into week columns
 * (weekdays-as-rows), which is the log-hours calendar's layout. The admin grid keeps
 * one column per day, so boundaries are a simple pass over the flat array.
 */
export function monthColumnGroups(days: string[]): ColumnGroup[] {
  const out: ColumnGroup[] = [];
  let prev: string | null = null;
  days.forEach((day, index) => {
    const d = parseLocalDate(day);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== prev) {
      out.push({ index, label: d.toLocaleDateString(undefined, { month: "long" }) });
      prev = key;
    }
  });
  return out;
}

/**
 * ISO week header labels ("W32") for a flat days-as-columns grid: one at index 0, then
 * one at every column starting a new ISO week. Keyed by year+week so the turn of the
 * year cannot collapse two different week 1s into one group.
 */
export function weekColumnGroups(days: string[]): ColumnGroup[] {
  const out: ColumnGroup[] = [];
  let prev: string | null = null;
  days.forEach((day, index) => {
    const week = isoWeekNumber(day);
    const key = `${parseLocalDate(day).getFullYear()}-${week}`;
    if (key !== prev) {
      out.push({ index, label: `W${String(week).padStart(2, "0")}` });
      prev = key;
    }
  });
  return out;
}

/** Workday-anchored bucket: 0h→0, (0,2)→1, [2,4)→2, [4,6)→3, [6,∞)→4. Non-positive/NaN→0. */
export function hoursBucket(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (!(hours > 0)) return 0; // handles 0, negatives, NaN
  if (hours < 2) return 1;
  if (hours < 4) return 2;
  if (hours < 6) return 3;
  return 4;
}

/** Sum hours per entryDate. Rows need only { entryDate, hours }. */
export function sumHoursByDay(rows: { entryDate: string; hours: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.entryDate, round2((m.get(r.entryDate) ?? 0) + (Number(r.hours) || 0)));
  }
  return m;
}

/**
 * Trailing window ending at `todayIso` (inclusive). `from` is the same day-of-month
 * `months` calendar months earlier, clamped to that month's last day if shorter
 * (e.g. 3 months before 2026-05-31 → 2026-02-28, not an overflowed March date).
 */
export function trailingRange(todayIso: string, months: number): { from: string; to: string } {
  const today = parseLocalDate(todayIso);
  const targetMonthFirst = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const lastDayOfTarget = new Date(
    targetMonthFirst.getFullYear(),
    targetMonthFirst.getMonth() + 1,
    0,
  ).getDate();
  const day = Math.min(today.getDate(), lastDayOfTarget);
  const from = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth(), day);
  return { from: toIso(from), to: todayIso };
}

export type CalendarWeeks = {
  weeks: string[][]; // 7 entries each (Mon..Sun); "" = padding
  monthLabels: { index: number; label: string }[];
  yearLabels: { index: number; label: string }[];
};

/** Mon-first weekday index (0 = Monday .. 6 = Sunday) for a local date. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * The period (e.g. month or year) owning this week-column: most real (non-"") days
 * wins, ties go to the LATER period (the period of the column's last real day).
 */
function owningPeriod<K>(week: string[], keyOf: (d: Date) => K): { key: K; sample: string } | null {
  const real = week.filter((c) => c !== "");
  if (real.length === 0) return null;
  const lastKey = keyOf(parseLocalDate(real[real.length - 1]));
  const counts = new Map<K, number>();
  for (const c of real) {
    const k = keyOf(parseLocalDate(c));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = lastKey;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && key === lastKey)) {
      best = key;
      bestCount = count;
    }
  }
  return { key: best, sample: real.find((c) => keyOf(parseLocalDate(c)) === best)! };
}

/**
 * Arrange the inclusive [from,to] day range into GitHub-style week columns (Mon..Sun),
 * top/bottom padded with "" so every column has 7 cells, plus month and year labels
 * per column.
 *
 * monthLabels/yearLabels rule: every column has exactly ONE owning month (year) - the
 * month (year) holding the most real (non-"") days in that column, ties going to the
 * LATER one. A label is emitted at column 0 and at every column whose owning period
 * differs from the column immediately before it. Month labels are short names only
 * ("Jun"); the year ("2026") lives on the separate yearLabels row.
 *
 * Because a week column can straddle a month (or Dec 31/Jan 1) boundary, the label
 * (and the divider the component draws from it) can sit up to 3 days off the true
 * 1st-of-month/year. Owning by majority minimizes that error and, unlike a
 * first-real-day rule, cannot drop a period whose 1st lands inside the window's
 * first partial week.
 */
export function buildCalendarWeeks(from: string, to: string): CalendarWeeks {
  const days = enumerateDays(from, to);
  if (days.length === 0) return { weeks: [], monthLabels: [], yearLabels: [] };

  const cells: string[] = [];
  const lead = mondayIndex(parseLocalDate(days[0]));
  for (let i = 0; i < lead; i++) cells.push("");
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push("");

  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  const monthLabel = (dateIso: string): string => SHORT_MONTHS[parseLocalDate(dateIso).getMonth()];
  const yearLabel = (dateIso: string): string => String(parseLocalDate(dateIso).getFullYear());

  const monthLabels: { index: number; label: string }[] = [];
  let prevMonth: number | null = null;
  weeks.forEach((week, index) => {
    const owner = owningPeriod(week, (d) => d.getMonth());
    if (!owner) return;
    if (prevMonth === null || owner.key !== prevMonth) {
      monthLabels.push({ index, label: monthLabel(owner.sample) });
      prevMonth = owner.key;
    }
  });

  const yearLabels: { index: number; label: string }[] = [];
  let prevYear: number | null = null;
  weeks.forEach((week, index) => {
    const owner = owningPeriod(week, (d) => d.getFullYear());
    if (!owner) return;
    if (prevYear === null || owner.key !== prevYear) {
      yearLabels.push({ index, label: yearLabel(owner.sample) });
      prevYear = owner.key;
    }
  });

  return { weeks, monthLabels, yearLabels };
}

/**
 * ISO-8601 week number (1-53) for a local YYYY-MM-DD date.
 *
 * ISO weeks run Mon-Sun and week 1 is the week containing the first Thursday of
 * the year, so a date's week is found by comparing its own week's Thursday to the
 * Thursday of the week containing Jan 4 (which is always in week 1). `Math.round`
 * absorbs the +/-1h skew that a DST transition introduces into local-date deltas.
 */
export function isoWeekNumber(dateIso: string): number {
  const d = parseLocalDate(dateIso);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  thursday.setDate(thursday.getDate() - mondayIndex(thursday) + 3);

  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - mondayIndex(firstThursday) + 3);

  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/**
 * Total hours per week column. Index-aligned with `weeks`: one number per column, in
 * the same order. Padding cells ("") and days absent from `byDay` contribute 0, so an
 * all-padding or all-zero column returns 0 and `weeks: []` returns [].
 *
 * Deliberately does not round. `fmtHM` at the render site owns formatting, and rounding
 * here would fork the day cells' and the footer's notion of a total.
 */
export function weekTotals(weeks: string[][], byDay: Map<string, number>): number[] {
  return weeks.map((week) => {
    let sum = 0;
    for (const date of week) {
      if (date === "") continue;
      sum += byDay.get(date) ?? 0;
    }
    return sum;
  });
}

/** CVD-safe categorical fills for 1o8 activity charts (hub). */
export const MF_ACTIVITY_COLORS = [
  "#d95a00",
  "#006bbb",
  "#05893e",
  "#653cbd",
  "#b94f87",
  "#0f766e",
  "#a16207",
  "#9f1239",
  "#475569",
  "#0369a1",
  "#4d7c0f",
  "#7c3aed",
  "#c2410c",
] as const;

export const MF_UNCATEGORIZED_KEY = "__uncategorized__";
export const MF_UNCATEGORIZED_LABEL = "Uncategorized";

export type InternalBreakdownRow = {
  userId: string;
  userName: string | null;
  userEmail: string;
  category: string | null;
  hours: number;
  entries: number;
};

export type MfActivity = {
  key: string;
  label: string;
  hours: number;
  pct: number;
  color: string;
};

export type MfPersonBar = {
  key: string;
  label: string;
  total: number;
} & Record<string, string | number>;

export type AgencyBreakdown = {
  totalHours: number;
  pctOfAll: number;
  meetingsAdminHours: number;
  meetingsAdminLabel: string;
  largestLabel: string;
  entryCount: number;
  activities: MfActivity[];
  people: MfPersonBar[];
};

export function mfCategoryKey(category: string | null): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : MF_UNCATEGORIZED_KEY;
}

export function mfCategoryLabel(category: string | null): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : MF_UNCATEGORIZED_LABEL;
}

function isMeetingsOrAdmin(label: string): boolean {
  return /meeting|admin/i.test(label);
}

export function buildAgencyBreakdown(
  rows: InternalBreakdownRow[],
  allHours: number,
): AgencyBreakdown | null {
  if (rows.length === 0) return null;

  const totalHours = round2(rows.reduce((acc, r) => acc + r.hours, 0));
  if (totalHours <= 0) return null;

  const entryCount = rows.reduce((acc, r) => acc + r.entries, 0);
  const pctOfAll = allHours > 0 ? round2((totalHours / allHours) * 100) : 0;

  const byCat = new Map<string, { label: string; hours: number }>();
  for (const r of rows) {
    const key = mfCategoryKey(r.category);
    const cur = byCat.get(key);
    if (cur) cur.hours = round2(cur.hours + r.hours);
    else byCat.set(key, { label: mfCategoryLabel(r.category), hours: round2(r.hours) });
  }

  const activities: MfActivity[] = [...byCat.entries()]
    .map(([key, v]) => ({ key, label: v.label, hours: v.hours, pct: 0, color: "" }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
  for (let i = 0; i < activities.length; i++) {
    activities[i].color = MF_ACTIVITY_COLORS[i % MF_ACTIVITY_COLORS.length];
    activities[i].pct = totalHours > 0 ? round2((activities[i].hours / totalHours) * 100) : 0;
  }

  const meetingsAdmin = activities.filter((a) => isMeetingsOrAdmin(a.label));
  const meetingsAdminHours = round2(meetingsAdmin.reduce((acc, a) => acc + a.hours, 0));
  const meetingsAdminLabel =
    meetingsAdmin.length === 0
      ? "Meetings + admin"
      : meetingsAdmin.length === 1
        ? meetingsAdmin[0].label
        : "Meetings + admin";

  const byPerson = new Map<string, MfPersonBar>();
  for (const r of rows) {
    let p = byPerson.get(r.userId);
    if (!p) {
      p = { key: r.userId, label: r.userName?.trim() || r.userEmail, total: 0 };
      for (const a of activities) p[a.key] = 0;
      byPerson.set(r.userId, p);
    }
    const catKey = mfCategoryKey(r.category);
    p[catKey] = round2(Number(p[catKey] ?? 0) + r.hours);
    p.total = round2(p.total + r.hours);
  }
  const people = [...byPerson.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  return {
    totalHours,
    pctOfAll,
    meetingsAdminHours,
    meetingsAdminLabel,
    largestLabel: activities[0]?.label ?? "—",
    entryCount,
    activities,
    people,
  };
}
