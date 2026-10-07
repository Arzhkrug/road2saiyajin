export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export const DAY_MS = 86_400_000;

export const getPeriodStart = (now: number, days: number): number =>
  now - days * DAY_MS;

/** Fenêtre glissante [now - days, now], bornes incluses. */
export function filterByPeriod<T>(
  items: readonly T[],
  getTimestamp: (item: T) => number,
  days: number,
  now: number,
): T[] {
  if (!(days > 0) || !Number.isFinite(now)) {
    return [];
  }
  const start = getPeriodStart(now, days);
  return items.filter((item) => {
    const timestamp = getTimestamp(item);
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= now;
  });
}
