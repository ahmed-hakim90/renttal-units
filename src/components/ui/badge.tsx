import { cn } from '@/lib/utils';
import type { InvoiceStatus, UnitStatus } from '@/types/database';

const statusColors: Record<string, string> = {
  due: 'bg-zinc-100 text-zinc-700',
  invoice_issued: 'bg-blue-50 text-blue-700',
  partially_paid: 'bg-amber-50 text-amber-700',
  fully_paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  occupied: 'bg-green-50 text-green-700',
  vacant: 'bg-zinc-100 text-zinc-600',
  maintenance: 'bg-orange-50 text-orange-700',
  active: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
  completed: 'bg-blue-50 text-blue-700',
};

export function Badge({ status, label, className }: { status: InvoiceStatus | UnitStatus | string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[status] ?? 'bg-zinc-100 text-zinc-700', className)}>
      {label}
    </span>
  );
}
