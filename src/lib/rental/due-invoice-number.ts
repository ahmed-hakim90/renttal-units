export function buildDueInvoiceNumber(contractId: string, periodStart: string) {
  return `DUE-${contractId}-${periodStart}`;
}
