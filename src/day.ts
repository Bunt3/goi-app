/** The study day rolls over at 04:00 local time, so a late-night session counts as the same day. */
export const DAY_START_HOUR = 4;
export const DAY_MS = 86_400_000;

export function startOfDay(now: number): number {
  const d = new Date(now - DAY_START_HOUR * 3_600_000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + DAY_START_HOUR * 3_600_000;
}

export function endOfDay(now: number): number {
  return addDays(startOfDay(now), 1);
}

/** Calendar-aware day arithmetic on a start-of-day timestamp (safe across DST changes). */
export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole study days from `from` to `to` (negative if `to` is earlier). */
export function dayDiff(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/** YYYY-MM-DD in local time. */
export function isoDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
