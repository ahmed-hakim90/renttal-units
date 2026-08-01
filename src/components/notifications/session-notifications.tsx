'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from '@/lib/i18n/navigation';
import { formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import { markSessionNotificationsSeen } from '@/lib/notifications/session-cookie';
import type { ActionableNotification } from '@/lib/notifications/guards';
import {
  getNotificationIconTone,
  NotificationIcon,
} from '@/lib/notifications/icons';
import { cn } from '@/lib/utils';

function toastToneClass(kind: ActionableNotification['kind']) {
  if (kind === 'overdue_invoices' || kind === 'odoo_sync_issues') {
    return 'border-red-200 bg-red-50 text-red-950';
  }
  if (
    kind === 'due_invoices'
    || kind === 'awaiting_payment'
    || kind === 'partial_payments'
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-950';
  }
  return 'border-sky-200 bg-sky-50 text-sky-950';
}

function NotificationToastCard({
  notification,
  title,
  description,
  viewLabel,
  closeLabel,
  onNavigate,
  onDismiss,
}: {
  notification: ActionableNotification;
  title: string;
  description: string;
  viewLabel: string;
  closeLabel: string;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border p-3 shadow-lg',
        toastToneClass(notification.kind),
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
          getNotificationIconTone(notification.kind),
        )}
      >
        <NotificationIcon kind={notification.kind} className="size-4" />
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-start"
        onClick={onNavigate}
      >
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{description}</p>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 hover:underline"
          onClick={onNavigate}
        >
          {viewLabel}
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs opacity-70 hover:opacity-100"
          onClick={onDismiss}
          aria-label={closeLabel}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function SessionNotifications({
  notifications,
  locale,
}: {
  notifications: ActionableNotification[];
  locale: string;
}) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const shownKindsRef = useRef(new Set<string>());
  const loc = locale as Locale;

  useEffect(() => {
    const pending = notifications.filter(
      (notification) => !shownKindsRef.current.has(notification.kind),
    );
    if (pending.length === 0) return;

    for (const notification of pending) {
      shownKindsRef.current.add(notification.kind);

      const countLabel = formatNumber(notification.count, loc);
      const title = (() => {
        switch (notification.kind) {
          case 'overdue_invoices':
            return t('overdueInvoicesTitle');
          case 'due_invoices':
            return t('dueInvoicesTitle');
          case 'awaiting_payment':
            return t('awaitingPaymentTitle');
          case 'partial_payments':
            return t('partialPaymentsTitle');
          case 'draft_contracts':
            return t('draftContractsTitle');
          case 'expiring_contracts':
            return t('expiringContractsTitle');
          case 'odoo_sync_issues':
            return t('odooSyncIssuesTitle');
          default:
            return '';
        }
      })();

      const description = (() => {
        switch (notification.kind) {
          case 'overdue_invoices':
            return t('overdueInvoicesDescription', { count: countLabel });
          case 'due_invoices':
            return t('dueInvoicesDescription', { count: countLabel });
          case 'awaiting_payment':
            return t('awaitingPaymentDescription', { count: countLabel });
          case 'partial_payments':
            return t('partialPaymentsDescription', { count: countLabel });
          case 'draft_contracts':
            return t('draftContractsDescription', { count: countLabel });
          case 'expiring_contracts':
            return t('expiringContractsDescription', { count: countLabel });
          case 'odoo_sync_issues':
            return t('odooSyncIssuesDescription', {
              failed: formatNumber(notification.failedCount ?? 0, loc),
              needsReview: formatNumber(notification.needsReviewCount ?? 0, loc),
            });
          default:
            return '';
        }
      })();

      const toastId = `session-notif-${notification.kind}`;

      toast.custom(
        (id) => (
          <NotificationToastCard
            notification={notification}
            title={title}
            description={description}
            viewLabel={t('view')}
            closeLabel={t('close')}
            onNavigate={() => {
              toast.dismiss(id);
              router.push(notification.href);
            }}
            onDismiss={() => toast.dismiss(id)}
          />
        ),
        {
          id: toastId,
          duration: 12_000,
        },
      );
    }

    markSessionNotificationsSeen(pending.map((notification) => notification.kind));
  }, [loc, notifications, router, t]);

  return null;
}
