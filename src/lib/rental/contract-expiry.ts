import { addDays, format } from 'date-fns';
import type { Contract } from '@/types/database';

export const CONTRACT_EXPIRY_WARNING_DAYS = 30;

export function isContractExpiringSoon(
  contract: Pick<Contract, 'status' | 'end_date'>,
  asOfDate: Date = new Date(),
  warningDays = CONTRACT_EXPIRY_WARNING_DAYS,
): boolean {
  const endDate = contract.end_date;
  if (contract.status !== 'active' || endDate === null) return false;

  const today = format(asOfDate, 'yyyy-MM-dd');
  const warningEndDate = format(addDays(asOfDate, warningDays), 'yyyy-MM-dd');
  return endDate >= today && endDate <= warningEndDate;
}

export function countContractsExpiringSoon(
  contracts: Array<Pick<Contract, 'status' | 'end_date'>>,
  asOfDate: Date = new Date(),
  warningDays = CONTRACT_EXPIRY_WARNING_DAYS,
): number {
  return contracts.filter((contract) => isContractExpiringSoon(contract, asOfDate, warningDays)).length;
}
