const ymd = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const isWeekend = (s: string) => [0, 6].includes(at(s).getUTCDay());
const plusDays = (s: string, n: number) => {
  const d = at(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const onOrNextWorkday = (s: string) => {
  let d = s;
  while (isWeekend(d)) d = plusDays(d, 1);
  return d;
};
const nextWorkday = (s: string) => onOrNextWorkday(plusDays(s, 1));

/** Spec L9: reports generate on the 4th of the month after `period`; PM/AM/CEO due on chained working days. */
export function reviewDeadlines(period: string): { generatedOn: string; pm: string; am: string; ceo: string } {
  const [y, m] = period.split("-").map(Number);
  const generatedOn = ymd(new Date(Date.UTC(y, m, 4, 12))); // month index m = the month after `period`
  const pm = onOrNextWorkday(generatedOn);
  const am = nextWorkday(pm);
  const ceo = nextWorkday(am);
  return { generatedOn, pm, am, ceo };
}
