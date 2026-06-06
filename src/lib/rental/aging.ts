import { differenceInDays, format, parseISO } from 'date-fns';
import type { Invoice, PaymentCycle } from '@/types/database';

export const AGING_BUCKET_KEYS = [
  'current',
  'days1to30',
  'days31to60',
  'days61to90',
  'over90',
] as const;

export type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number];

export type AgingBucketAmounts = Record<AgingBucketKey, number>;

export function createEmptyBucketAmounts(): AgingBucketAmounts {
  return {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
}

export function getDaysOverdue(dueDate: string, asOfDate: Date = new Date()): number {
  const today = parseISO(format(asOfDate, 'yyyy-MM-dd'));
  const due = parseISO(dueDate);
  return Math.max(0, differenceInDays(today, due));
}

export function getAgingBucketKey(daysOverdue: number): AgingBucketKey {
  if (daysOverdue === 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'over90';
}

export function getRemainingAmount(invoice: Invoice): number {
  return Number(invoice.amount) - Number(invoice.paid_amount);
}

export interface AgingRow {
  invoice: Invoice;
  daysOverdue: number;
  bucket: AgingBucketKey;
  remaining: number;
}

export function buildAgingRows(invoices: Invoice[], asOfDate: Date = new Date()): AgingRow[] {
  return invoices
    .map((invoice) => {
      const remaining = getRemainingAmount(invoice);
      const daysOverdue = getDaysOverdue(invoice.due_date, asOfDate);
      return {
        invoice,
        daysOverdue,
        bucket: getAgingBucketKey(daysOverdue),
        remaining,
      };
    })
    .filter((row) => row.remaining > 0);
}

export interface BucketSummary {
  bucket: AgingBucketKey;
  count: number;
  totalAmount: number;
  percentage: number;
}

export function buildBucketSummary(rows: AgingRow[]): BucketSummary[] {
  const totalAmount = rows.reduce((sum, row) => sum + row.remaining, 0);

  return AGING_BUCKET_KEYS.map((bucket) => {
    const bucketRows = rows.filter((row) => row.bucket === bucket);
    const bucketTotal = bucketRows.reduce((sum, row) => sum + row.remaining, 0);
    return {
      bucket,
      count: bucketRows.length,
      totalAmount: bucketTotal,
      percentage: totalAmount > 0 ? (bucketTotal / totalAmount) * 100 : 0,
    };
  });
}

export interface UnitAgingSummary {
  unitId: string;
  unitNumber: string;
  locationName: string;
  tenantName: string;
  paymentCycle: PaymentCycle | null;
  buckets: AgingBucketAmounts;
  total: number;
  invoiceCount: number;
}

export function buildUnitAgingSummary(
  rows: AgingRow[],
  getLocationName: (invoice: Invoice) => string,
): UnitAgingSummary[] {
  const byUnit = new Map<string, UnitAgingSummary>();

  for (const row of rows) {
    const unit = row.invoice.unit;
    const unitId = row.invoice.unit_id;
    const existing = byUnit.get(unitId);

    if (!existing) {
      byUnit.set(unitId, {
        unitId,
        unitNumber: unit?.unit_number ?? '—',
        locationName: getLocationName(row.invoice),
        tenantName: row.invoice.tenant?.full_name ?? row.invoice.unit?.tenant?.full_name ?? '—',
        paymentCycle: unit?.payment_cycle ?? null,
        buckets: createEmptyBucketAmounts(),
        total: 0,
        invoiceCount: 0,
      });
    }

    const summary = byUnit.get(unitId)!;
    summary.buckets[row.bucket] += row.remaining;
    summary.total += row.remaining;
    summary.invoiceCount += 1;
  }

  return Array.from(byUnit.values()).sort((a, b) => b.total - a.total);
}

export function sumBucketAmounts(rows: AgingRow[]): AgingBucketAmounts {
  const totals = createEmptyBucketAmounts();
  for (const row of rows) {
    totals[row.bucket] += row.remaining;
  }
  return totals;
}
