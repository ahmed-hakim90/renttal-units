import type { InvoiceStatus } from '@/types/database';
import { computeInvoiceStatus } from '@/lib/rental/invoice-status';
import type { ContractPaymentPeriod } from '@/lib/rental/calculations';

export interface ContractOpeningBalanceInput {
  paid_through_date?: string | null;
  opening_paid_amount?: number | null;
}

export type SettledContractPeriod<T extends ContractPaymentPeriod = ContractPaymentPeriod> = T & {
  paid_amount: number;
  status: InvoiceStatus;
};

export function resolveFirstUnpaidPeriod<T extends { periodStart: string; periodEnd: string }>(
  schedule: T[],
  paidThroughDate?: string | null,
): T | null {
  if (schedule.length === 0) return null;
  const paidThrough = paidThroughDate?.trim() || null;
  if (!paidThrough) return schedule[0] ?? null;
  return schedule.find((period) => period.periodEnd > paidThrough) ?? null;
}

/**
 * Odoo tracking starts at the first unpaid installment period_start.
 * Historical periods before this date are opening-balance only.
 */
export function resolveOdooTrackingStartDate(
  schedule: Array<{ periodStart: string; periodEnd: string }>,
  paidThroughDate?: string | null,
): string | null {
  return resolveFirstUnpaidPeriod(schedule, paidThroughDate)?.periodStart ?? null;
}

export function isPeriodBeforeOdooTracking(
  periodStart: string | null | undefined,
  odooTrackingStartDate?: string | null,
): boolean {
  if (!periodStart || !odooTrackingStartDate) return false;
  return periodStart < odooTrackingStartDate;
}

/**
 * Opening-balance import must not rewrite invoices that are already tied to Odoo
 * or that have local payment ledger rows.
 */
export function openingBalanceImportBlockedReason(
  invoices: Array<{ id: string; odoo_invoice_id?: number | null }>,
  paymentCountsByInvoiceId?: Map<string, number> | Record<string, number>,
): 'odooLinkedInvoices' | 'localPaymentsExist' | null {
  const counts = paymentCountsByInvoiceId instanceof Map
    ? paymentCountsByInvoiceId
    : new Map(Object.entries(paymentCountsByInvoiceId ?? {}));

  for (const invoice of invoices) {
    if (invoice.odoo_invoice_id != null) return 'odooLinkedInvoices';
    if ((counts.get(invoice.id) ?? 0) > 0) return 'localPaymentsExist';
  }
  return null;
}

export function applyOpeningBalanceToSchedule<T extends ContractPaymentPeriod>(
  schedule: T[],
  input?: ContractOpeningBalanceInput,
): SettledContractPeriod<T>[] {
  const paidThrough = input?.paid_through_date?.trim() || null;
  const openingPaid = Math.max(0, Number(input?.opening_paid_amount ?? 0));
  let openingApplied = false;

  return schedule.map((period) => {
    if (paidThrough && period.periodEnd <= paidThrough) {
      return {
        ...period,
        paid_amount: period.amount,
        status: 'fully_paid' as const,
      };
    }

    if (!openingApplied && openingPaid > 0) {
      openingApplied = true;
      const paid_amount = Math.min(period.amount, openingPaid);
      return {
        ...period,
        paid_amount,
        status: computeInvoiceStatus(period.amount, paid_amount, period.periodStart, 'due'),
      };
    }

    return {
      ...period,
      paid_amount: 0,
      status: 'due' as const,
    };
  });
}
