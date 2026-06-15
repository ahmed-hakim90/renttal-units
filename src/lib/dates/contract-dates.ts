const MIN_CONTRACT_YEAR = 1990;
const MAX_CONTRACT_YEAR = 2100;

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isReasonableContractDate(value: string): boolean {
  if (!isValidDateInput(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= MIN_CONTRACT_YEAR && year <= MAX_CONTRACT_YEAR;
}

export const CONTRACT_DATE_MIN = `${MIN_CONTRACT_YEAR}-01-01`;
