import type { InvoiceStatus } from '@/types/database';

export function computeInvoiceStatus(
  amount: number,
  paidAmount: number,
  dueDate: string,
  currentStatus: InvoiceStatus,
): InvoiceStatus {
  if (paidAmount >= amount) return 'fully_paid';
  if (paidAmount > 0) {
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) return 'overdue';
    return 'partially_paid';
  }
  if (currentStatus === 'invoice_issued') {
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) return 'overdue';
    return 'invoice_issued';
  }
  return currentStatus;
}
