import { addDays, addMonths, differenceInDays, format, intervalToDuration, parseISO, subDays } from 'date-fns';
import { CONTRACT_DATE_MIN } from '@/lib/dates/contract-dates';
import { applyTaxExclusiveAmount, splitTaxInclusiveAmount } from '@/lib/rental/tax';
import type {
  Contract,
  ContractLineAmountBasis,
  ContractPaymentCondition,
  ContractStatus,
  PaymentCycle,
  Unit,
} from '@/types/database';

export type ContractDisplayStatus = ContractStatus | 'expired';

export const MAX_CONTRACT_PERIODS = 50;

// An 'active' contract whose end date has passed is shown as 'expired' so it is
// not confused with a genuinely running contract. The stored status is unchanged.
export function getContractDisplayStatus(
  status: ContractStatus,
  endDate: string | null | undefined,
  asOfDate: Date = new Date(),
): ContractDisplayStatus {
  if (status === 'draft') return 'draft';
  if (status === 'active' && endDate && endDate < format(asOfDate, 'yyyy-MM-dd')) return 'expired';
  return status;
}

export interface UnitRentPeriod {
  periodStart: string;
  periodEnd: string;
}

export interface ContractPaymentPeriod extends UnitRentPeriod {
  amount: number;
}

export interface ContractBillingLineInput {
  contractLineId?: string | null;
  lineType: 'rental' | 'service';
  unitId?: string | null;
  description?: string | null;
  odooProductId?: number | null;
  odooProductName?: string | null;
  /**
   * Full-contract tax-inclusive total.
   * Required for contract_total_inclusive; derived for annual_untaxed.
   */
  amount: number;
  amountBasis?: ContractLineAmountBasis;
  annualAmountUntaxed?: number | null;
  taxRate: number;
  taxTreatment?: 'standard' | 'zero_rated';
  sortOrder?: number;
}

export interface ContractBillingLinePeriod {
  contractLineId: string | null;
  lineType: 'rental' | 'service';
  unitId: string | null;
  description: string;
  odooProductId: number | null;
  odooProductName: string | null;
  amountUntaxed: number;
  taxRate: number;
  taxTreatment: 'standard' | 'zero_rated';
  amountTax: number;
  amountTotal: number;
  sortOrder: number;
}

export interface ContractBillingPeriod extends ContractPaymentPeriod {
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  lineItems: ContractBillingLinePeriod[];
}

type WeightedContractPeriod = UnitRentPeriod & {
  dayWeight: number;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getCycleMonths(cycle: PaymentCycle): number {
  switch (cycle) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'yearly': return 12;
  }
}

export function getPaymentsPerYear(cycle: PaymentCycle): number {
  return 12 / getCycleMonths(cycle);
}

export function calculatePeriodAmount(monthlyRent: number, cycle: PaymentCycle): number {
  return monthlyRent * getCycleMonths(cycle);
}

export function calculateRentPeriod(cycle: PaymentCycle, referenceDate: Date = new Date()) {
  const months = getCycleMonths(cycle);
  const periodStart = parseISO(format(referenceDate, 'yyyy-MM-01'));
  const periodEnd = subDays(addMonths(periodStart, months), 1);
  return {
    periodStart: format(periodStart, 'yyyy-MM-dd'),
    periodEnd: format(periodEnd, 'yyyy-MM-dd'),
  };
}

export function calculateAllUnitRentPeriods(unit: Unit, upToDate: Date = new Date()): UnitRentPeriod[] {
  if (!unit.rent_start_date || !unit.rent_end_date) return [];

  const rentStart = parseISO(unit.rent_start_date);
  const rentEnd = parseISO(unit.rent_end_date);
  const reference = parseISO(format(upToDate, 'yyyy-MM-dd'));

  if (reference < rentStart) return [];

  const cycleMonths = getCycleMonths(unit.payment_cycle);
  const periods: UnitRentPeriod[] = [];
  let periodStart = rentStart;

  while (periodStart <= reference && periodStart <= rentEnd) {
    const naturalPeriodEnd = subDays(addMonths(periodStart, cycleMonths), 1);
    const periodEnd = naturalPeriodEnd > rentEnd ? rentEnd : naturalPeriodEnd;

    periods.push({
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
    });

    periodStart = addMonths(periodStart, cycleMonths);
  }

  return periods;
}

function conditionMultiplierForPeriod(
  periodStart: Date,
  contractStart: Date,
  paymentConditions: ContractPaymentCondition[],
): number {
  return paymentConditions.reduce((multiplier, condition) => {
    if (
      !condition.enabled
      || condition.condition_type !== 'percentage_increase_after'
      || !Number.isInteger(condition.applies_after_months)
      || condition.applies_after_months < 1
      || !Number.isFinite(condition.percentage)
      || condition.percentage <= 0
    ) {
      return multiplier;
    }
    const threshold = addMonths(contractStart, condition.applies_after_months);
    return periodStart >= threshold
      ? multiplier * (1 + condition.percentage / 100)
      : multiplier;
  }, 1);
}

function buildWeightedContractPeriods(
  startDate: string,
  endDate: string,
  paymentCycle: PaymentCycle,
): WeightedContractPeriod[] {
  if (startDate < CONTRACT_DATE_MIN) {
    throw new Error(`Contract start_date must be on or after ${CONTRACT_DATE_MIN}`);
  }

  const contractStart = parseISO(startDate);
  const contractEnd = parseISO(endDate);
  const cycleMonths = getCycleMonths(paymentCycle);
  const periods: WeightedContractPeriod[] = [];
  let periodStart = contractStart;

  while (periodStart <= contractEnd) {
    if (periods.length >= MAX_CONTRACT_PERIODS) {
      throw new Error(`Contract payment schedule exceeds maximum of ${MAX_CONTRACT_PERIODS} periods`);
    }

    const naturalPeriodEnd = subDays(addMonths(periodStart, cycleMonths), 1);
    const periodEnd = naturalPeriodEnd > contractEnd ? contractEnd : naturalPeriodEnd;
    const fullDays = differenceInDays(naturalPeriodEnd, periodStart) + 1;
    const actualDays = differenceInDays(periodEnd, periodStart) + 1;

    periods.push({
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
      dayWeight: actualDays / fullDays,
    });

    periodStart = addMonths(periodStart, cycleMonths);
  }

  return periods;
}

function allocateByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Contract payment schedule weights must be positive');
  }

  let assigned = 0;
  return weights.map((weight, index) => {
    const isLast = index === weights.length - 1;
    const amount = isLast
      ? roundMoney(total - assigned)
      : roundMoney((total * weight) / totalWeight);
    assigned = roundMoney(assigned + amount);
    return amount;
  });
}

export function calculateContractPaymentSchedule(
  contract: Pick<Contract, 'start_date' | 'end_date' | 'payment_cycle' | 'total_amount'>,
  paymentConditions: ContractPaymentCondition[] = [],
): ContractPaymentPeriod[] {
  if (!contract.start_date || !contract.end_date) {
    throw new Error('Contract start_date and end_date are required to calculate payment schedule');
  }

  const contractStart = parseISO(contract.start_date);
  const periods = buildWeightedContractPeriods(
    contract.start_date,
    contract.end_date,
    contract.payment_cycle,
  );
  if (periods.length === 0) return [];

  const weights = periods.map((period) => (
    period.dayWeight * conditionMultiplierForPeriod(
      parseISO(period.periodStart),
      contractStart,
      paymentConditions,
    )
  ));
  const amounts = allocateByWeights(Number(contract.total_amount), weights);

  return periods.map((period, index) => ({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    amount: amounts[index] ?? 0,
  }));
}

function lineConditions(
  paymentConditions: ContractPaymentCondition[] | undefined,
  lineType: 'rental' | 'service',
): ContractPaymentCondition[] {
  return (paymentConditions ?? []).filter(
    (condition) => condition.target === 'all' || condition.target === lineType,
  );
}

function effectiveLineTax(line: ContractBillingLineInput): {
  taxRate: number;
  taxTreatment: 'standard' | 'zero_rated';
} {
  const taxTreatment = line.taxTreatment === 'zero_rated' ? 'zero_rated' as const : 'standard' as const;
  const taxRate = taxTreatment === 'zero_rated' ? 0 : Math.max(0, Number(line.taxRate));
  return { taxRate, taxTreatment };
}

function allocateAnnualUntaxedPeriods(input: {
  annualAmountUntaxed: number;
  paymentCycle: PaymentCycle;
  periods: WeightedContractPeriod[];
  contractStart: Date;
  paymentConditions: ContractPaymentCondition[];
}): number[] {
  const paymentsPerYear = getPaymentsPerYear(input.paymentCycle);
  const basePeriodUntaxed = Number(input.annualAmountUntaxed) / paymentsPerYear;
  const exactAmounts = input.periods.map((period) => (
    basePeriodUntaxed
    * period.dayWeight
    * conditionMultiplierForPeriod(
      parseISO(period.periodStart),
      input.contractStart,
      input.paymentConditions,
    )
  ));
  // Keep the signed/derived untaxed total exact in cents, round ordinary
  // installments, and put the leftover cents on the final period.
  const exactTotalCents = Math.round(
    exactAmounts.reduce((sum, amount) => sum + amount, 0) * 100,
  );
  let assignedCents = 0;

  return exactAmounts.map((exact, index) => {
    const isLast = index === exactAmounts.length - 1;
    const amountCents = isLast
      ? exactTotalCents - assignedCents
      : Math.round(exact * 100);
    assignedCents += amountCents;
    return amountCents / 100;
  });
}

function billingLinePeriodFromAmounts(
  line: ContractBillingLineInput,
  lineIndex: number,
  amountUntaxed: number,
  amountTax: number,
  amountTotal: number,
): ContractBillingLinePeriod {
  const { taxRate, taxTreatment } = effectiveLineTax(line);
  return {
    contractLineId: line.contractLineId ?? null,
    lineType: line.lineType,
    unitId: line.unitId ?? null,
    description: line.description?.trim() || (
      line.lineType === 'rental' ? 'Rental' : 'Service'
    ),
    odooProductId: line.odooProductId ?? null,
    odooProductName: line.odooProductName ?? null,
    amountUntaxed,
    taxRate,
    taxTreatment,
    amountTax,
    amountTotal,
    sortOrder: line.sortOrder ?? lineIndex,
  };
}

/**
 * Creates immutable invoice snapshots from contract lines.
 *
 * - annual_untaxed: operator enters annual pre-tax; schedule + VAT + line.amount are derived.
 * - contract_total_inclusive (legacy): signed full-contract inclusive totals are allocated
 *   across periods (with optional increase weights that still preserve the signed total).
 */
export function calculateContractBillingSchedule(input: {
  start_date: string;
  end_date: string;
  payment_cycle: PaymentCycle;
  lines: ContractBillingLineInput[];
  payment_conditions?: ContractPaymentCondition[];
}): ContractBillingPeriod[] {
  if (input.lines.length === 0) return [];

  const periods = buildWeightedContractPeriods(
    input.start_date,
    input.end_date,
    input.payment_cycle,
  );
  if (periods.length === 0) return [];

  const contractStart = parseISO(input.start_date);
  const linePeriodItems = input.lines.map((line, lineIndex) => {
    const { taxRate, taxTreatment } = effectiveLineTax(line);
    const conditions = lineConditions(input.payment_conditions, line.lineType);
    const amountBasis: ContractLineAmountBasis = line.amountBasis === 'annual_untaxed'
      ? 'annual_untaxed'
      : 'contract_total_inclusive';

    if (amountBasis === 'annual_untaxed') {
      const annual = Number(line.annualAmountUntaxed);
      if (!Number.isFinite(annual) || annual <= 0) {
        throw new Error('Annual untaxed amount must be greater than zero');
      }
      const untaxedPeriods = allocateAnnualUntaxedPeriods({
        annualAmountUntaxed: annual,
        paymentCycle: input.payment_cycle,
        periods,
        contractStart,
        paymentConditions: conditions,
      });
      return untaxedPeriods.map((amountUntaxed) => {
        const taxed = applyTaxExclusiveAmount(
          amountUntaxed,
          taxTreatment === 'zero_rated' ? 0 : taxRate,
        );
        return billingLinePeriodFromAmounts(
          line,
          lineIndex,
          taxed.amountUntaxed,
          taxed.amountTax,
          taxed.amountTotal,
        );
      });
    }

    const inclusivePeriods = calculateContractPaymentSchedule({
      start_date: input.start_date,
      end_date: input.end_date,
      payment_cycle: input.payment_cycle,
      total_amount: line.amount,
    }, conditions);

    return inclusivePeriods.map((period) => {
      const split = splitTaxInclusiveAmount(
        period.amount,
        taxTreatment === 'zero_rated' ? 0 : taxRate,
      );
      return billingLinePeriodFromAmounts(
        line,
        lineIndex,
        split.amountUntaxed,
        split.amountTax,
        split.amountTotal,
      );
    });
  });

  return periods.map((period, periodIndex) => {
    const lineItems = linePeriodItems.map((linePeriods) => {
      const linePeriod = linePeriods[periodIndex];
      if (!linePeriod) throw new Error('Contract line schedules are inconsistent');
      return linePeriod;
    });
    const amountUntaxed = roundMoney(lineItems.reduce((sum, line) => sum + line.amountUntaxed, 0));
    const amountTax = roundMoney(lineItems.reduce((sum, line) => sum + line.amountTax, 0));
    const amountTotal = roundMoney(amountUntaxed + amountTax);

    return {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount: amountTotal,
      amountUntaxed,
      amountTax,
      amountTotal,
      lineItems,
    };
  });
}

/**
 * Server-authoritative derivation of full-contract inclusive line amounts from
 * annual sources (or pass-through for legacy inclusive lines).
 */
export function deriveContractLineInclusiveAmounts(input: {
  start_date: string;
  end_date: string;
  payment_cycle: PaymentCycle;
  payment_conditions?: ContractPaymentCondition[];
  lines: ContractBillingLineInput[];
}): {
  schedule: ContractBillingPeriod[];
  lines: Array<ContractBillingLineInput & { amount: number }>;
  totalAmount: number;
} {
  const schedule = calculateContractBillingSchedule(input);
  const lines = input.lines.map((line, lineIndex) => {
    const amount = roundMoney(schedule.reduce(
      (sum, period) => sum + (period.lineItems[lineIndex]?.amountTotal ?? 0),
      0,
    ));
    return { ...line, amount };
  });
  const totalAmount = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  return { schedule, lines, totalAmount };
}

export function calculateUnitRentPeriod(unit: Unit, referenceDate: Date = new Date()): UnitRentPeriod | null {
  const periods = calculateAllUnitRentPeriods(unit, referenceDate);
  if (periods.length === 0) return null;
  return periods[periods.length - 1] ?? null;
}

export type RentPeriodStatus = 'not_started' | 'active' | 'expired';

export interface RentPeriodInfo {
  status: RentPeriodStatus;
  totalDays: number;
  remainingDays: number;
  daysUntilStart: number;
}

export function getRentPeriodInfo(
  startDate: string,
  endDate: string,
  referenceDate: Date = new Date(),
): RentPeriodInfo {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const today = parseISO(format(referenceDate, 'yyyy-MM-dd'));

  const totalDays = differenceInDays(end, start) + 1;
  const remainingDays = differenceInDays(end, today);
  const daysUntilStart = differenceInDays(start, today);

  let status: RentPeriodStatus;
  if (today < start) status = 'not_started';
  else if (today > end) status = 'expired';
  else status = 'active';

  return {
    status,
    totalDays,
    remainingDays: Math.max(0, remainingDays),
    daysUntilStart: Math.max(0, daysUntilStart),
  };
}

export function breakdownDaysToDuration(days: number) {
  if (days <= 0) return { years: 0, months: 0, days: 0 };

  const start = new Date(2000, 0, 1);
  return intervalToDuration({ start, end: addDays(start, days) });
}

export function calculateUnitDueDate(unit: Unit, referenceDate: Date = new Date()): string | null {
  if (!unit.rent_start_date || !unit.rent_end_date) return null;

  const rentStart = parseISO(unit.rent_start_date);
  const rentEnd = parseISO(unit.rent_end_date);
  const reference = parseISO(format(referenceDate, 'yyyy-MM-dd'));

  if (reference <= rentStart) return unit.rent_start_date;
  if (reference > rentEnd) return null;

  return calculateUnitRentPeriod(unit, reference)?.periodStart ?? null;
}
