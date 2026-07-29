import { getDaysOverdue } from '@/lib/rental/aging';
import type { Invoice, InvoiceStatus } from '@/types/database';

export function getInvoiceDaysOverdue(dueDate: string, asOfDate: Date = new Date()): number {
  return getDaysOverdue(dueDate, asOfDate);
}

// Effective lifecycle status for display. The DB never flips invoices to
// 'overdue', so we derive it from the balance and due date at render time.
// A not-yet-issued 'due' placeholder stays 'due' (it was never billed).
export function getInvoiceDisplayStatus(
  invoice: Pick<Invoice, 'amount' | 'paid_amount' | 'due_date' | 'status'>,
  asOfDate: Date = new Date(),
): InvoiceStatus {
  const amount = Number(invoice.amount);
  const paid = Number(invoice.paid_amount);
  if (paid >= amount) return 'fully_paid';

  const overdue = getDaysOverdue(invoice.due_date, asOfDate) > 0;
  if (paid > 0) return overdue ? 'overdue' : 'partially_paid';
  if (invoice.status === 'invoice_issued') return overdue ? 'overdue' : 'invoice_issued';
  return invoice.status;
}

export function hasOverdueInvoice(
  invoices: Array<Pick<Invoice, 'amount' | 'paid_amount' | 'due_date' | 'status'>>,
  asOfDate: Date = new Date(),
): boolean {
  return invoices.some((invoice) => getInvoiceDisplayStatus(invoice, asOfDate) === 'overdue');
}

export function isOldOutstandingDue(dueDate: string, status: string, asOfDate: Date = new Date()): boolean {
  return status === 'due' && getDaysOverdue(dueDate, asOfDate) > 0;
}

export function getInvoiceRowHighlight(dueDate: string, status: string, asOfDate: Date = new Date()): string {
  const daysOverdue = getDaysOverdue(dueDate, asOfDate);
  if (daysOverdue <= 0) return '';

  if (status === 'due') {
    if (daysOverdue > 30) return 'bg-red-50/80 border-l-4 border-l-red-500';
    return 'bg-amber-50/80 border-l-4 border-l-amber-500';
  }

  if (status === 'invoice_issued' || status === 'partially_paid' || status === 'overdue') {
    if (daysOverdue > 30) return 'bg-red-50/60 border-l-4 border-l-red-400';
    return 'bg-orange-50/60 border-l-4 border-l-orange-400';
  }

  return '';
}

export function getOverdueBadgeClass(daysOverdue: number): string {
  if (daysOverdue > 30) return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}
