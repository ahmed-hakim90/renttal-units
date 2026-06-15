import type { InvoiceStatus } from '@/types/database';
import { computeInvoiceStatus } from '@/lib/services/invoice-service';
import type { ContractPaymentPeriod } from '@/lib/rental/calculations';

export interface ContractOpeningBalanceInput {
  paid_through_date?: string | null;
  opening_paid_amount?: number | null;
}

export interface SettledContractPeriod extends ContractPaymentPeriod {
  paid_amount: number;
  status: InvoiceStatus;
}

export function applyOpeningBalanceToSchedule(
  schedule: ContractPaymentPeriod[],
  input?: ContractOpeningBalanceInput,
): SettledContractPeriod[] {
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
