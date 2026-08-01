'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';
import { formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import {
  getNotificationBadgeCount,
  isAllowedNotificationHref,
  type ActionableNotification,
} from '@/lib/notifications/guards';
import {
  getNotificationIconTone,
  NotificationIcon,
} from '@/lib/notifications/icons';
import { cn } from '@/lib/utils';

function notificationTitle(
  notification: ActionableNotification,
  t: ReturnType<typeof useTranslations<'notifications'>>,
) {
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
}

function notificationDescription(
  notification: ActionableNotification,
  t: ReturnType<typeof useTranslations<'notifications'>>,
  locale: Locale,
) {
  const countLabel = formatNumber(notification.count, locale);
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
        failed: formatNumber(notification.failedCount ?? 0, locale),
        needsReview: formatNumber(notification.needsReviewCount ?? 0, locale),
      });
    default:
      return '';
  }
}

export function HeaderNotifications({
  notifications = [],
  locale,
}: {
  notifications?: ActionableNotification[];
  locale: string;
}) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const loc = locale as Locale;
  const badgeCount = getNotificationBadgeCount(notifications);
  const safeNotifications = notifications.filter((item) => isAllowedNotificationHref(item.href));

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('bellLabel')}
        title={t('bellLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative text-foreground"
      >
        <Bell className="size-5" aria-hidden="true" />
        {badgeCount > 0 && (
          <span
            className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-card"
            aria-label={t('badgeLabel', { count: formatNumber(badgeCount, loc) })}
          >
            {formatNumber(badgeCount, loc)}
          </span>
        )}
      </Button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('panelTitle')}
          className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Bell className="size-4 text-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">{t('panelTitle')}</p>
          </div>

          {safeNotifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="max-h-[min(24rem,70vh)] overflow-y-auto py-1">
              {safeNotifications.map((notification) => (
                  <li key={notification.kind}>
                    <Link
                      href={notification.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => setOpen(false)}
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
                          getNotificationIconTone(notification.kind),
                        )}
                      >
                        <NotificationIcon kind={notification.kind} className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {notificationTitle(notification, t)}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {notificationDescription(notification, t, loc)}
                        </p>
                      </span>
                    </Link>
                  </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
