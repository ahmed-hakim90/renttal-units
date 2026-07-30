import { addDays, format } from 'date-fns';
import type { Contract } from '@/types/database';

export const CONTRACT_EXPIRY_WARNING_DAYS = 30;

export function countContractsExpiringSoon(
  contracts: Array<Pick<Contract, 'status' | 'end_date'>>,
  asOfDate: Date = new Date(),
  warningDays = CONTRACT_EXPIRY_WARNING_DAYS,
): number {
  const today = format(asOfDate, 'yyyy-MM-dd');
  const warningEndDate = format(addDays(asOfDate, warningDays), 'yyyy-MM-dd');

  return contracts.filter((contract) => {
    const endDate = contract.end_date;
    return (
      contract.status === 'active'
      && endDate !== null
      && endDate >= today
      && endDate <= warningEndDate
    );
  }).length;
}
