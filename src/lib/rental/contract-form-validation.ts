import { isReasonableContractDate } from '@/lib/dates/contract-dates';
import {
  calculateContractBillingSchedule,
  type ContractBillingPeriod,
  MAX_CONTRACT_PERIODS,
} from '@/lib/rental/calculations';
import {
  applyOpeningBalanceToSchedule,
  type SettledContractPeriod,
} from '@/lib/rental/contract-opening-balance';
import type { ContractLineType, PaymentCycle } from '@/types/database';
import { normalizeNumberInputValue } from '@/lib/i18n/numbers';
import { isValidSaudiNationalId, normalizeNationalId } from '@/lib/validation/saudi-national-id';

export type ContractFormField =
  | 'unit_id'
  | 'contract_number'
  | 'start_date'
  | 'end_date'
  | 'total_amount'
  | 'payment_cycle'
  | 'paid_through_date'
  | 'opening_paid_amount'
  | 'last_payment_date'
  | 'tenant_name'
  | 'tenant_email'
  | 'tenant_national_id'
  | 'schedule'
  | 'lines';

export type ContractFormErrorCode =
  | 'unitRequired'
  | 'contractNumberRequired'
  | 'tenantNameRequired'
  | 'nationalIdInvalid'
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
  | 'lastPaymentInvalid'
  | 'lastPaymentOutOfRange'
  | 'tenantEmailInvalid'
  | 'tooManyPeriods'
  | 'scheduleFailed'
  | 'linesRequired'
  | 'rentalLineRequired'
  | 'duplicateUnits'
  | 'lineAmountPositive'
  | 'serviceProductRequired'
  | 'taxRateInvalid';

export type ContractFormFieldErrors = Partial<Record<ContractFormField, ContractFormErrorCode>>;

export interface ContractFormLineValues {
  key: string;
  line_type: ContractLineType;
  unit_id: string;
  description: string;
  amount: string;
  odoo_product_id: string;
  odoo_product_name: string;
  tax_rate: string;
  tax_treatment: 'standard' | 'zero_rated';
}

export interface ContractFormValues {
  unit_id: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  total_amount: string;
  payment_cycle: PaymentCycle;
  paid_through_date: string;
  opening_paid_amount: string;
  last_payment_date: string;
  opening_notes: string;
  tenant_name: string;
  tenant_email: string;
  tenant_national_id: string;
  lines: ContractFormLineValues[];
}

export interface ContractInvoicePreview {
  ready: boolean;
  invoiceCount: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  dueCount: number;
  totalAmount: number;
  totalUntaxed: number;
  totalTax: number;
  periods: SettledContractPeriod<ContractBillingPeriod>[];
  error?: ContractFormErrorCode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAmount(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const amount = Number(normalizeNumberInputValue(trimmed));
  if (!Number.isFinite(amount)) return null;
  return amount;
}

export function sumContractLineAmounts(lines: ContractFormLineValues[]): number {
  return lines.reduce((sum, line) => sum + (parseAmount(line.amount) ?? 0), 0);
}

export function validateContractForm(
  values: ContractFormValues,
  options?: { requireUnit?: boolean; mode?: 'strict' | 'draft' },
): ContractFormFieldErrors {
  const errors: ContractFormFieldErrors = {};
  const requireUnit = options?.requireUnit ?? true;
  const draftMode = options?.mode === 'draft';
  const lines = values.lines ?? [];

  if (!values.contract_number.trim()) {
    errors.contract_number = 'contractNumberRequired';
  }

  if (draftMode) {
    const unitIds = lines
      .filter((line) => line.line_type === 'rental')
      .map((line) => line.unit_id)
      .filter(Boolean);
    if (new Set(unitIds).size !== unitIds.length) {
      errors.lines = 'duplicateUnits';
    }
    if (values.tenant_email.trim() && !EMAIL_RE.test(values.tenant_email.trim())) {
      errors.tenant_email = 'tenantEmailInvalid';
    }
    const nationalId = normalizeNationalId(values.tenant_national_id);
    if (nationalId && !isValidSaudiNationalId(nationalId)) {
      errors.tenant_national_id = 'nationalIdInvalid';
    }
    if (values.start_date.trim() && !isReasonableContractDate(values.start_date)) {
      errors.start_date = 'startDateInvalid';
    }
    if (values.end_date.trim() && !isReasonableContractDate(values.end_date)) {
      errors.end_date = 'endDateInvalid';
    } else if (
      values.start_date.trim()
      && values.end_date.trim()
      && isReasonableContractDate(values.start_date)
      && isReasonableContractDate(values.end_date)
      && values.end_date < values.start_date
    ) {
      errors.end_date = 'endBeforeStart';
    }
    return errors;
  }

  if (lines.length === 0) {
    errors.lines = 'linesRequired';
  } else {
    const rentalLines = lines.filter((line) => line.line_type === 'rental');
    if (rentalLines.length === 0) {
      errors.lines = 'rentalLineRequired';
    }
    const unitIds = rentalLines.map((line) => line.unit_id).filter(Boolean);
    if (requireUnit && unitIds.length !== rentalLines.length) {
      errors.unit_id = 'unitRequired';
    }
    if (new Set(unitIds).size !== unitIds.length) {
      errors.lines = 'duplicateUnits';
    }
    if (lines.some((line) => (parseAmount(line.amount) ?? 0) <= 0)) {
      errors.lines = 'lineAmountPositive';
    }
    if (lines.some((line) => line.line_type === 'service' && !line.odoo_product_id?.trim())) {
      errors.lines = 'serviceProductRequired';
    }
    if (lines.some((line) => {
      if (line.tax_rate == null) return false;
      const taxRate = parseAmount(line.tax_rate);
      return taxRate == null || taxRate < 0 || taxRate > 100;
    })) {
      errors.lines = 'taxRateInvalid';
    }
  }

  if (!values.tenant_name.trim()) {
    errors.tenant_name = 'tenantNameRequired';
  }

  const nationalId = normalizeNationalId(values.tenant_national_id);
  if (nationalId && !isValidSaudiNationalId(nationalId)) {
    errors.tenant_national_id = 'nationalIdInvalid';
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

  const amount = sumContractLineAmounts(lines);
  if (amount <= 0) {
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

  const lastPaymentDate = values.last_payment_date?.trim() ?? '';
  if (lastPaymentDate) {
    if (!isReasonableContractDate(lastPaymentDate)) {
      errors.last_payment_date = 'lastPaymentInvalid';
    } else if (
      isReasonableContractDate(values.start_date)
      && isReasonableContractDate(values.end_date)
      && (lastPaymentDate < values.start_date || lastPaymentDate > values.end_date)
    ) {
      errors.last_payment_date = 'lastPaymentOutOfRange';
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
    && !errors.lines
  ) {
    const preview = buildInvoicePreview(values, amount, openingPaid);
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
  const amount = sumContractLineAmounts(values.lines ?? []);
  const openingPaidRaw = values.opening_paid_amount.trim();
  const openingPaid = openingPaidRaw ? parseAmount(openingPaidRaw) : null;

  if (
    !isReasonableContractDate(values.start_date)
    || !isReasonableContractDate(values.end_date)
    || values.end_date < values.start_date
    || amount <= 0
  ) {
    return {
      ready: false,
      invoiceCount: 0,
      fullyPaidCount: 0,
      partiallyPaidCount: 0,
      dueCount: 0,
      totalAmount: 0,
      totalUntaxed: 0,
      totalTax: 0,
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
    totalUntaxed: 0,
    totalTax: 0,
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
    const schedule = calculateContractBillingSchedule({
      start_date: values.start_date,
      end_date: values.end_date,
      payment_cycle: values.payment_cycle,
      lines: values.lines.map((line, index) => ({
        lineType: line.line_type,
        unitId: line.line_type === 'rental' ? line.unit_id : null,
        description: line.description,
        odooProductId: line.odoo_product_id ? Number(line.odoo_product_id) : null,
        odooProductName: line.odoo_product_name || null,
        amount: Number(line.amount),
        taxRate: line.tax_rate == null ? 15 : Number(line.tax_rate),
        taxTreatment: line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard',
        sortOrder: index,
      })),
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
          totalUntaxed: schedule.reduce((sum, period) => sum + period.amountUntaxed, 0),
          totalTax: schedule.reduce((sum, period) => sum + period.amountTax, 0),
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
      totalAmount: settled.reduce((sum, period) => sum + period.amountTotal, 0),
      totalUntaxed: settled.reduce((sum, period) => sum + period.amountUntaxed, 0),
      totalTax: settled.reduce((sum, period) => sum + period.amountTax, 0),
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
