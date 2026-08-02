import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { CONTRACT_EXCEL_HEADERS } from '@/lib/import/contract-excel-columns';
import { getCycleMonths } from '@/lib/rental/calculations';
import type { Contract, PaymentCycle } from '@/types/database';

export type ContractExcelExportRow = Array<string | number | null>;

function estimatePaymentCount(contract: Contract): number {
  const invoices = contract.invoices ?? [];
  if (invoices.length > 0) return invoices.length;

  if (!contract.start_date || !contract.end_date) return 0;
  try {
    const months = Math.max(
      1,
      differenceInCalendarMonths(parseISO(contract.end_date), parseISO(contract.start_date)) + 1,
    );
    const cycleMonths = getCycleMonths(contract.payment_cycle);
    return Math.max(1, Math.ceil(months / cycleMonths));
  } catch {
    return 0;
  }
}

function derivePeriodicAmount(contract: Contract, paymentCount: number): number | null {
  const invoices = [...(contract.invoices ?? [])].sort((a, b) => (
    a.period_start.localeCompare(b.period_start)
  ));
  if (invoices[0]) return Number(invoices[0].amount_total ?? invoices[0].amount);
  if (paymentCount > 0 && Number(contract.total_amount) > 0) {
    return Math.round((Number(contract.total_amount) / paymentCount) * 100) / 100;
  }
  return null;
}

export function contractToExcelRow(contract: Contract): ContractExcelExportRow {
  const unitNumber = contract.unit?.unit_number
    ?? contract.lines?.find((line) => line.line_type === 'rental' && line.unit)?.unit?.unit_number
    ?? '';
  const paymentCount = estimatePaymentCount(contract);
  const periodic = derivePeriodicAmount(contract, paymentCount);

  return [
    contract.contract_number ?? '',
    contract.tenant?.full_name ?? '',
    unitNumber,
    '', // signed_date is import-only reference; not stored on contracts
    contract.start_date ?? '',
    contract.end_date ?? '',
    Number(contract.total_amount) || 0,
    periodic ?? '',
    paymentCount || '',
    contract.paid_through_date ?? '',
    contract.opening_paid_amount ? Number(contract.opening_paid_amount) : '',
    contract.opening_payment_date ?? '',
  ];
}

export function buildContractsExcelRows(contracts: Contract[]): {
  headers: string[];
  rows: ContractExcelExportRow[];
} {
  return {
    headers: [...CONTRACT_EXCEL_HEADERS],
    rows: contracts.map(contractToExcelRow),
  };
}

/** Used by import to infer cycle when creating a new contract. */
export function inferPaymentCycleFromAmounts(
  total: number,
  periodic: number,
): PaymentCycle {
  if (!periodic || periodic <= 0) return 'yearly';
  const ratio = Math.round(total / periodic);
  if (ratio <= 1) return 'yearly';
  if (ratio <= 2) return 'semi_annual';
  if (ratio <= 4) return 'quarterly';
  return 'monthly';
}
