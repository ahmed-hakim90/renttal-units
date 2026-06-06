import { addMonths, differenceInCalendarMonths, format, parseISO, subDays } from 'date-fns';
import type { PaymentCycle, Unit } from '@/types/database';

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

export function calculateUnitRentPeriod(unit: Unit, referenceDate: Date = new Date()) {
  if (!unit.rent_start_date || !unit.rent_end_date) return null;

  const rentStart = parseISO(unit.rent_start_date);
  const rentEnd = parseISO(unit.rent_end_date);
  const reference = parseISO(format(referenceDate, 'yyyy-MM-dd'));

  if (reference < rentStart || reference > rentEnd) return null;

  const cycleMonths = getCycleMonths(unit.payment_cycle);
  const elapsedMonths = Math.max(0, differenceInCalendarMonths(reference, rentStart));
  const completedCycles = Math.floor(elapsedMonths / cycleMonths);
  const periodStart = addMonths(rentStart, completedCycles * cycleMonths);
  const naturalPeriodEnd = subDays(addMonths(periodStart, cycleMonths), 1);
  const periodEnd = naturalPeriodEnd > rentEnd ? rentEnd : naturalPeriodEnd;

  return {
    periodStart: format(periodStart, 'yyyy-MM-dd'),
    periodEnd: format(periodEnd, 'yyyy-MM-dd'),
  };
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
