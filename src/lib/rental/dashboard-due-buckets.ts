import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';

export const DEFAULT_DASHBOARD_DUE_HORIZONS = [3, 7, 15] as const;
export const MAX_DASHBOARD_DUE_HORIZON_DAYS = 90;
export const DASHBOARD_DUE_HORIZONS_SETTING_KEY = 'dashboard_due_horizons';

export type DashboardDueHorizons = [number, number, number];

export type ScheduledDueInvoice = {
  due_date: string;
  amount: number | string;
  paid_amount: number | string;
};

export type DashboardDueBucket = {
  fromDay: number;
  toDay: number;
  count: number;
  amount: number;
};

export function parseDashboardDueHorizons(value: unknown): DashboardDueHorizons {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some((days) => !Number.isSafeInteger(days) || days < 1 || days > MAX_DASHBOARD_DUE_HORIZON_DAYS)
    || !(value[0] < value[1] && value[1] < value[2])
  ) {
    return [...DEFAULT_DASHBOARD_DUE_HORIZONS];
  }

  return [value[0], value[1], value[2]];
}

export function getDashboardDueDateRange(
  maximumDays: number,
  asOfDate: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = startOfDay(asOfDate);
  return {
    startDate: format(today, 'yyyy-MM-dd'),
    endDate: format(addDays(today, maximumDays), 'yyyy-MM-dd'),
  };
}

export function buildDashboardDueBuckets(
  invoices: ScheduledDueInvoice[],
  horizons: DashboardDueHorizons,
  asOfDate: Date = new Date(),
): DashboardDueBucket[] {
  const [first, second, third] = horizons;
  const buckets: DashboardDueBucket[] = [
    { fromDay: 0, toDay: first, count: 0, amount: 0 },
    { fromDay: first + 1, toDay: second, count: 0, amount: 0 },
    { fromDay: second + 1, toDay: third, count: 0, amount: 0 },
  ];
  const today = startOfDay(asOfDate);

  for (const invoice of invoices) {
    const daysUntilDue = differenceInCalendarDays(parseISO(invoice.due_date), today);
    const bucket = buckets.find(({ fromDay, toDay }) => (
      daysUntilDue >= fromDay && daysUntilDue <= toDay
    ));
    if (!bucket) continue;

    bucket.count += 1;
    bucket.amount += Math.max(0, Number(invoice.amount) - Number(invoice.paid_amount));
  }

  return buckets;
}
