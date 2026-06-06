import { getDaysOverdue } from '@/lib/rental/aging';

export function getInvoiceDaysOverdue(dueDate: string, asOfDate: Date = new Date()): number {
  return getDaysOverdue(dueDate, asOfDate);
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
