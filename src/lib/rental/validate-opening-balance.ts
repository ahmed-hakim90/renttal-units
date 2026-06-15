import { isReasonableContractDate } from '@/lib/dates/contract-dates';
import type { ContractOpeningBalanceInput } from '@/lib/rental/contract-opening-balance';

export function validateContractOpeningBalance(
  contract: { start_date: string; end_date: string },
  opening?: ContractOpeningBalanceInput,
): string[] {
  const errors: string[] = [];
  if (!opening) return errors;

  const paidThrough = opening.paid_through_date?.trim();
  if (paidThrough) {
    if (!isReasonableContractDate(paidThrough)) {
      errors.push('paid_through_date must be a valid date between 1990 and 2100');
    } else if (paidThrough < contract.start_date || paidThrough > contract.end_date) {
      errors.push('paid_through_date must be within the contract period');
    }
  }

  const openingPaid = opening.opening_paid_amount;
  if (openingPaid != null && openingPaid < 0) {
    errors.push('opening_paid_amount must be non-negative');
  }

  return errors;
}
