import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Calendar,
  CloudAlert,
  CreditCard,
  FileClock,
  FilePenLine,
  Timer,
} from 'lucide-react';
import type { ActionableNotificationKind } from '@/lib/notifications/guards';

export function getNotificationIcon(kind: ActionableNotificationKind): LucideIcon {
  switch (kind) {
    case 'overdue_invoices':
      return AlertTriangle;
    case 'due_invoices':
      return Calendar;
    case 'awaiting_payment':
      return FileClock;
    case 'partial_payments':
      return CreditCard;
    case 'draft_contracts':
      return FilePenLine;
    case 'expiring_contracts':
      return Timer;
    case 'odoo_sync_issues':
      return CloudAlert;
    default:
      return AlertTriangle;
  }
}

export function NotificationIcon({
  kind,
  className,
}: {
  kind: ActionableNotificationKind;
  className?: string;
}) {
  const props = { className, 'aria-hidden': true as const };
  switch (kind) {
    case 'overdue_invoices':
      return <AlertTriangle {...props} />;
    case 'due_invoices':
      return <Calendar {...props} />;
    case 'awaiting_payment':
      return <FileClock {...props} />;
    case 'partial_payments':
      return <CreditCard {...props} />;
    case 'draft_contracts':
      return <FilePenLine {...props} />;
    case 'expiring_contracts':
      return <Timer {...props} />;
    case 'odoo_sync_issues':
      return <CloudAlert {...props} />;
    default:
      return <AlertTriangle {...props} />;
  }
}

export function getNotificationIconTone(kind: ActionableNotificationKind): string {
  if (kind === 'overdue_invoices' || kind === 'odoo_sync_issues') {
    return 'bg-red-100 text-red-800';
  }
  if (
    kind === 'due_invoices'
    || kind === 'awaiting_payment'
    || kind === 'partial_payments'
  ) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-sky-100 text-sky-800';
}
