import { addDays, addMonths, differenceInDays, format, intervalToDuration, parseISO, subDays } from 'date-fns';
import type { PaymentCycle, Unit } from '@/types/database';

export interface UnitRentPeriod {
  periodStart: string;
  periodEnd: string;
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
