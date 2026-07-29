import { cn } from '@/lib/utils';
import type { InvoiceStatus, UnitStatus } from '@/types/database';

const statusColors: Record<string, string> = {
  due: 'bg-slate-100 text-slate-700 ring-slate-200',
  invoice_issued: 'bg-blue-50 text-blue-700 ring-blue-100',
  partially_paid: 'bg-amber-50 text-amber-800 ring-amber-100',
  fully_paid: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  overdue: 'bg-red-50 text-red-700 ring-red-100',
  occupied: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  vacant: 'bg-slate-100 text-slate-600 ring-slate-200',
  maintenance: 'bg-orange-50 text-orange-700 ring-orange-100',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  completed: 'bg-blue-50 text-blue-700 ring-blue-100',
  expired: 'bg-amber-50 text-amber-800 ring-amber-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',
  pending: 'bg-amber-50 text-amber-800 ring-amber-100',
  synced: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  linked: 'bg-blue-50 text-blue-700 ring-blue-100',
  unlinked: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Badge({
  status,
  label,
  className,
}: {
  status: InvoiceStatus | UnitStatus | string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ring-1 ring-inset',
        statusColors[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200',
        className
      )}
    >
      {label}
    </span>
  );
}
