import {
  deriveContractLineInclusiveAmounts,
  type ContractBillingLineInput,
} from '@/lib/rental/calculations';
import type {
  ContractLineAmountBasis,
  ContractLineInput,
  ContractPaymentCondition,
  PaymentCycle,
} from '@/types/database';

export function normalizeContractLineAmountBasis(
  value: ContractLineAmountBasis | null | undefined,
): ContractLineAmountBasis {
  return value === 'annual_untaxed' ? 'annual_untaxed' : 'contract_total_inclusive';
}

export function toContractBillingLineInput(
  line: ContractLineInput,
  index = 0,
): ContractBillingLineInput {
  const amountBasis = normalizeContractLineAmountBasis(line.amount_basis);
  return {
    lineType: line.line_type,
    unitId: line.unit_id ?? null,
    description: line.description ?? null,
    odooProductId: line.odoo_product_id ?? null,
    odooProductName: line.odoo_product_name ?? null,
    amount: Number(line.amount) || 0,
    amountBasis,
    annualAmountUntaxed: amountBasis === 'annual_untaxed'
      ? (line.annual_amount_untaxed ?? null)
      : null,
    taxRate: Number(line.tax_rate ?? 0),
    taxTreatment: line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard',
    sortOrder: line.sort_order ?? index,
  };
}

/**
 * Derive authoritative inclusive line/contract totals on the server.
 * Client-provided amount/total_amount are ignored for annual_untaxed lines.
 */
export function resolveContractLinesForPersistence(input: {
  start_date: string;
  end_date: string;
  payment_cycle: PaymentCycle;
  payment_conditions?: ContractPaymentCondition[];
  lines: ContractLineInput[];
}): {
  lines: ContractLineInput[];
  total_amount: number;
} {
  const derived = deriveContractLineInclusiveAmounts({
    start_date: input.start_date,
    end_date: input.end_date,
    payment_cycle: input.payment_cycle,
    payment_conditions: input.payment_conditions,
    lines: input.lines.map((line, index) => toContractBillingLineInput(line, index)),
  });

  return {
    total_amount: derived.totalAmount,
    lines: input.lines.map((line, index) => {
      const amountBasis = normalizeContractLineAmountBasis(line.amount_basis);
      return {
        ...line,
        amount_basis: amountBasis,
        annual_amount_untaxed: amountBasis === 'annual_untaxed'
          ? Number(line.annual_amount_untaxed)
          : null,
        amount: derived.lines[index]?.amount ?? 0,
        sort_order: line.sort_order ?? index,
      };
    }),
  };
}
