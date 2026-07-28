import { isReasonableContractDate } from '@/lib/dates/contract-dates';
import {
  calculateContractPaymentSchedule,
  MAX_CONTRACT_PERIODS,
} from '@/lib/rental/calculations';
import {
  applyOpeningBalanceToSchedule,
  type SettledContractPeriod,
} from '@/lib/rental/contract-opening-balance';
import type { PaymentCycle } from '@/types/database';

export type ContractFormField =
  | 'unit_id'
  | 'start_date'
  | 'end_date'
  | 'total_amount'
  | 'payment_cycle'
  | 'paid_through_date'
  | 'opening_paid_amount'
  | 'tenant_email'
  | 'schedule';

export type ContractFormErrorCode =
  | 'unitRequired'
  | 'startDateRequired'
  | 'startDateInvalid'
  | 'endDateRequired'
  | 'endDateInvalid'
  | 'endBeforeStart'
  | 'amountRequired'
  | 'amountPositive'
  | 'paidThroughInvalid'
  | 'paidThroughOutOfRange'
  | 'openingPaidNegative'
  | 'openingPaidExceedsPeriod'
  | 'tenantEmailInvalid'
  | 'tooManyPeriods'
  | 'scheduleFailed';

export type ContractFormFieldErrors = Partial<Record<ContractFormField, ContractFormErrorCode>>;

export interface ContractFormValues {
  unit_id: string;
  start_date: string;
  end_date: string;
  total_amount: string;
  payment_cycle: PaymentCycle;
  paid_through_date: string;
  opening_paid_amount: string;
  tenant_email: string;
}

export interface ContractInvoicePreview {
  ready: boolean;
  invoiceCount: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  dueCount: number;
  totalAmount: number;
  periods: SettledContractPeriod[];
  error?: ContractFormErrorCode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  return amount;
}

export function validateContractForm(
  values: ContractFormValues,
  options?: { requireUnit?: boolean },
): ContractFormFieldErrors {
  const errors: ContractFormFieldErrors = {};
  const requireUnit = options?.requireUnit ?? true;

  if (requireUnit && !values.unit_id.trim()) {
    errors.unit_id = 'unitRequired';
  }

  if (!values.start_date.trim()) {
    errors.start_date = 'startDateRequired';
  } else if (!isReasonableContractDate(values.start_date)) {
    errors.start_date = 'startDateInvalid';
  }

  if (!values.end_date.trim()) {
    errors.end_date = 'endDateRequired';
  } else if (!isReasonableContractDate(values.end_date)) {
    errors.end_date = 'endDateInvalid';
  } else if (
    isReasonableContractDate(values.start_date)
    && values.end_date < values.start_date
  ) {
    errors.end_date = 'endBeforeStart';
  }

  const amount = parseAmount(values.total_amount);
  if (amount == null) {
    errors.total_amount = 'amountRequired';
  } else if (amount <= 0) {
    errors.total_amount = 'amountPositive';
  }

  const paidThrough = values.paid_through_date.trim();
  if (paidThrough) {
    if (!isReasonableContractDate(paidThrough)) {
      errors.paid_through_date = 'paidThroughInvalid';
    } else if (
      isReasonableContractDate(values.start_date)
      && isReasonableContractDate(values.end_date)
      && (paidThrough < values.start_date || paidThrough > values.end_date)
    ) {
      errors.paid_through_date = 'paidThroughOutOfRange';
    }
  }

  const openingPaidRaw = values.opening_paid_amount.trim();
  let openingPaid: number | null = null;
  if (openingPaidRaw) {
    openingPaid = parseAmount(openingPaidRaw);
    if (openingPaid == null || openingPaid < 0) {
      errors.opening_paid_amount = 'openingPaidNegative';
    }
  }

  const tenantEmail = values.tenant_email.trim();
  if (tenantEmail && !EMAIL_RE.test(tenantEmail)) {
    errors.tenant_email = 'tenantEmailInvalid';
  }

  if (
    !errors.start_date
    && !errors.end_date
    && !errors.total_amount
    && !errors.paid_through_date
    && !errors.opening_paid_amount
  ) {
    const preview = buildInvoicePreview(values, amount ?? 0, openingPaid);
    if (preview.error === 'tooManyPeriods') {
      errors.schedule = 'tooManyPeriods';
    } else if (preview.error === 'scheduleFailed') {
      errors.schedule = 'scheduleFailed';
    } else if (preview.error === 'openingPaidExceedsPeriod') {
      errors.opening_paid_amount = 'openingPaidExceedsPeriod';
    }
  }

  return errors;
}

export function previewContractInvoices(values: ContractFormValues): ContractInvoicePreview {
  const amount = parseAmount(values.total_amount);
  const openingPaidRaw = values.opening_paid_amount.trim();
  const openingPaid = openingPaidRaw ? parseAmount(openingPaidRaw) : null;

  if (
    !isReasonableContractDate(values.start_date)
    || !isReasonableContractDate(values.end_date)
    || values.end_date < values.start_date
    || amount == null
    || amount <= 0
  ) {
    return {
      ready: false,
      invoiceCount: 0,
      fullyPaidCount: 0,
      partiallyPaidCount: 0,
      dueCount: 0,
      totalAmount: 0,
      periods: [],
    };
  }

  const paidThrough = values.paid_through_date.trim();
  if (paidThrough) {
    if (!isReasonableContractDate(paidThrough)) {
      return emptyPreview('paidThroughInvalid');
    }
    if (paidThrough < values.start_date || paidThrough > values.end_date) {
      return emptyPreview('paidThroughOutOfRange');
    }
  }

  if (openingPaid != null && openingPaid < 0) {
    return emptyPreview('openingPaidNegative');
  }

  return buildInvoicePreview(values, amount, openingPaid);
}

function emptyPreview(error: ContractFormErrorCode): ContractInvoicePreview {
  return {
    ready: false,
    invoiceCount: 0,
    fullyPaidCount: 0,
    partiallyPaidCount: 0,
    dueCount: 0,
    totalAmount: 0,
    periods: [],
    error,
  };
}

function buildInvoicePreview(
  values: ContractFormValues,
  amount: number,
  openingPaid: number | null,
): ContractInvoicePreview {
  try {
    const schedule = calculateContractPaymentSchedule({
      start_date: values.start_date,
      end_date: values.end_date,
      payment_cycle: values.payment_cycle,
      total_amount: amount,
    });

    if (schedule.length > MAX_CONTRACT_PERIODS) {
      return emptyPreview('tooManyPeriods');
    }

    const paidThrough = values.paid_through_date.trim() || null;
    if (openingPaid != null && openingPaid > 0) {
      const firstOpen = schedule.find(
        (period) => !(paidThrough && period.periodEnd <= paidThrough),
      );
      if (firstOpen && openingPaid > firstOpen.amount) {
        return {
          ready: false,
          invoiceCount: schedule.length,
          fullyPaidCount: 0,
          partiallyPaidCount: 0,
          dueCount: 0,
          totalAmount: amount,
          periods: [],
          error: 'openingPaidExceedsPeriod',
        };
      }
    }

    const settled = applyOpeningBalanceToSchedule(schedule, {
      paid_through_date: paidThrough,
      opening_paid_amount: openingPaid,
    });

    return {
      ready: true,
      invoiceCount: settled.length,
      fullyPaidCount: settled.filter((p) => p.status === 'fully_paid').length,
      partiallyPaidCount: settled.filter((p) => p.status === 'partially_paid').length,
      dueCount: settled.filter((p) => p.status === 'due' || p.status === 'overdue').length,
      totalAmount: amount,
      periods: settled,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('maximum')) {
      return emptyPreview('tooManyPeriods');
    }
    return emptyPreview('scheduleFailed');
  }
}
