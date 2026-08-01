import { addDays, addMonths, differenceInDays, format, intervalToDuration, parseISO, subDays } from 'date-fns';
import { CONTRACT_DATE_MIN } from '@/lib/dates/contract-dates';
import { splitTaxInclusiveAmount } from '@/lib/rental/tax';
import type { Contract, ContractStatus, PaymentCycle, Unit } from '@/types/database';

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
  amount: number;
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

export function getCycleMonths(cycle: PaymentCycle): number {
  switch (cycle) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'yearly': return 12;
  }
}

export function calculatePeriodAmount(monthlyRent: number, cycle: PaymentCycle): number {
  return monthlyRent * getCycleMonths(cycle);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export function calculateContractPaymentSchedule(
  contract: Pick<Contract, 'start_date' | 'end_date' | 'payment_cycle' | 'total_amount'>
): ContractPaymentPeriod[] {
  if (!contract.start_date || !contract.end_date) {
    throw new Error('Contract start_date and end_date are required to calculate payment schedule');
  }

  if (contract.start_date < CONTRACT_DATE_MIN) {
    throw new Error(`Contract start_date must be on or after ${CONTRACT_DATE_MIN}`);
  }

  const contractStart = parseISO(contract.start_date);
  const contractEnd = parseISO(contract.end_date);
  const cycleMonths = getCycleMonths(contract.payment_cycle);

  // Each period carries a weight: 1 for a full cycle, and a day-based fraction
  // for a trailing partial cycle, so a stub period is prorated by its days
  // instead of being charged a full cycle.
  const periods: Array<UnitRentPeriod & { weight: number }> = [];
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
      weight: actualDays / fullDays,
    });

    periodStart = addMonths(periodStart, cycleMonths);
  }

  if (periods.length === 0) return [];

  const total = Number(contract.total_amount);
  const totalWeight = periods.reduce((sum, period) => sum + period.weight, 0);
  let assigned = 0;

  return periods.map((period, index) => {
    const isLast = index === periods.length - 1;
    const amount = isLast
      ? roundMoney(total - assigned)
      : roundMoney((total * period.weight) / totalWeight);
    assigned = roundMoney(assigned + amount);
    return { periodStart: period.periodStart, periodEnd: period.periodEnd, amount };
  });
}

/**
 * Creates immutable invoice snapshots from contract lines. Contract line amounts
 * are VAT-inclusive totals for the whole contract and are allocated proportionally
 * across periods. VAT is extracted per invoice line to match the signed contract.
 */
export function calculateContractBillingSchedule(input: {
  start_date: string;
  end_date: string;
  payment_cycle: PaymentCycle;
  lines: ContractBillingLineInput[];
}): ContractBillingPeriod[] {
  if (input.lines.length === 0) return [];

  const lineSchedules = input.lines.map((line) => ({
    line,
    periods: calculateContractPaymentSchedule({
      start_date: input.start_date,
      end_date: input.end_date,
      payment_cycle: input.payment_cycle,
      total_amount: line.amount,
    }),
  }));
  const periodCount = lineSchedules[0]?.periods.length ?? 0;

  return Array.from({ length: periodCount }, (_, periodIndex) => {
    const basePeriod = lineSchedules[0].periods[periodIndex];
    if (!basePeriod) throw new Error('Contract line schedules are inconsistent');

    const lineItems = lineSchedules.map(({ line, periods }, lineIndex) => {
      const period = periods[periodIndex];
      if (!period
        || period.periodStart !== basePeriod.periodStart
        || period.periodEnd !== basePeriod.periodEnd) {
        throw new Error('Contract line schedules are inconsistent');
      }
      const taxRate = Math.max(0, Number(line.taxRate));
      const taxTreatment = line.taxTreatment === 'zero_rated' ? 'zero_rated' as const : 'standard' as const;
      const effectiveTaxRate = taxTreatment === 'zero_rated' ? 0 : taxRate;
      const { amountUntaxed, amountTax, amountTotal } = splitTaxInclusiveAmount(
        period.amount,
        effectiveTaxRate,
      );
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
        taxRate: effectiveTaxRate,
        taxTreatment,
        amountTax,
        amountTotal,
        sortOrder: line.sortOrder ?? lineIndex,
      };
    });
    const amountUntaxed = roundMoney(lineItems.reduce((sum, line) => sum + line.amountUntaxed, 0));
    const amountTax = roundMoney(lineItems.reduce((sum, line) => sum + line.amountTax, 0));
    const amountTotal = roundMoney(amountUntaxed + amountTax);

    return {
      periodStart: basePeriod.periodStart,
      periodEnd: basePeriod.periodEnd,
      amount: amountTotal,
      amountUntaxed,
      amountTax,
      amountTotal,
      lineItems,
    };
  });
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
