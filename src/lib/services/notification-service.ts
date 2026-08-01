import 'server-only';

import { cache } from 'react';
import { hasPermission } from '@/lib/auth/permissions';
import type { FeatureFlags } from '@/lib/features';
import {
  buildActionableNotifications,
  filterUnseenNotifications,
  parseSeenNotificationKinds,
  type ActionableNotification,
  type ActionableNotificationKind,
} from '@/lib/notifications/guards';
import { logger, withSpan, type LogContext } from '@/lib/observability';
import { countContractsExpiringSoon } from '@/lib/rental/contract-expiry';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import type { AuthContext } from '@/types/database';

async function safeCount(
  label: string,
  ctx: LogContext,
  auth: AuthContext,
  load: () => Promise<number>,
): Promise<number> {
  try {
    return await load();
  } catch (error) {
    logger.error(`Failed to load session notification count: ${label}`, {
      ...ctx,
      user_id: auth.userId,
      role: auth.role,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function loadActionableNotificationCounts(
  auth: AuthContext,
  featureFlags: FeatureFlags,
  ctx: LogContext,
  dueCountHint?: number,
  invoiceCountHints?: {
    awaitingPaymentCount: number;
    partialCount: number;
  },
) {
  const canViewInvoices = hasPermission(auth, 'invoices.view');
  const canViewContracts = hasPermission(auth, 'contracts.view');
  const canManageOdoo = hasPermission(auth, 'odoo.manage') && featureFlags.odoo_invoices_documents;

  const [
    overdueCount,
    dueCount,
    awaitingPaymentCount,
    partialCount,
    draftCount,
    expiringCount,
    odooFailedCount,
    odooNeedsReviewCount,
  ] = await Promise.all([
    canViewInvoices
      ? safeCount('overdue', ctx, auth, () => invoicesRepository.countOverdue(ctx))
      : Promise.resolve(0),
    canViewInvoices
      ? (
        dueCountHint != null
          ? Promise.resolve(dueCountHint)
          : safeCount('due', ctx, auth, async () => {
            const { rentalService } = await import('@/lib/services/rental-service');
            return rentalService.countDueThisMonth(auth, ctx);
          })
      )
      : Promise.resolve(0),
    canViewInvoices
      ? (
        invoiceCountHints
          ? Promise.resolve(invoiceCountHints.awaitingPaymentCount)
          : safeCount('awaitingPayment', ctx, auth, () =>
            invoicesRepository.countByStatus('invoice_issued', ctx))
      )
      : Promise.resolve(0),
    canViewInvoices && featureFlags.invoices_payment_status_pages
      ? (
        invoiceCountHints
          ? Promise.resolve(invoiceCountHints.partialCount)
          : safeCount('partial', ctx, auth, () => invoicesRepository.countByStatus('partially_paid', ctx))
      )
      : Promise.resolve(0),
    canViewContracts
      ? safeCount('draft', ctx, auth, async () => {
        const stats = await contractsRepository.getSummaryStats(ctx);
        return stats.draftCount;
      })
      : Promise.resolve(0),
    canViewContracts
      ? safeCount('expiring', ctx, auth, async () => {
        const active = await contractsRepository.findActive(ctx);
        return countContractsExpiringSoon(active);
      })
      : Promise.resolve(0),
    canManageOdoo
      ? safeCount('odooFailed', ctx, auth, () => invoicesRepository.countByOdooSyncStatus(['failed'], ctx))
      : Promise.resolve(0),
    canManageOdoo
      ? safeCount('odooNeedsReview', ctx, auth, () => invoicesRepository.countByOdooSyncStatus(['needs_review'], ctx))
      : Promise.resolve(0),
  ]);

  return {
    overdueCount,
    dueCount,
    awaitingPaymentCount,
    partialCount,
    draftCount,
    expiringCount,
    odooFailedCount,
    odooNeedsReviewCount,
    access: {
      canViewInvoices,
      canViewContracts,
      canManageOdoo,
      showPaymentStatusPages: featureFlags.invoices_payment_status_pages,
      odooDocumentsEnabled: featureFlags.odoo_invoices_documents,
    },
  };
}

const listActionableCached = cache(async (
  auth: AuthContext,
  featureFlags: FeatureFlags,
  ctx: LogContext,
  dueCount?: number,
  invoiceCountHints?: {
    awaitingPaymentCount: number;
    partialCount: number;
  },
): Promise<ActionableNotification[]> => {
  return withSpan('notificationService.listActionable', {
    ...ctx,
    service: 'notifications',
    user_id: auth.userId,
  }, async () => {
    const loaded = await loadActionableNotificationCounts(
      auth,
      featureFlags,
      ctx,
      dueCount,
      invoiceCountHints,
    );

    return buildActionableNotifications(
      {
        overdueCount: loaded.overdueCount,
        dueCount: loaded.dueCount,
        awaitingPaymentCount: loaded.awaitingPaymentCount,
        partialCount: loaded.partialCount,
        draftCount: loaded.draftCount,
        expiringCount: loaded.expiringCount,
        odooFailedCount: loaded.odooFailedCount,
        odooNeedsReviewCount: loaded.odooNeedsReviewCount,
      },
      loaded.access,
    );
  });
});

export const notificationService = {
  /** All currently actionable alerts for the header bell (ignores session-seen cookie). */
  listActionable: listActionableCached,

  /** Unseen alerts for first-open session toasts only. */
  async listPendingForSession(
    auth: AuthContext,
    featureFlags: FeatureFlags,
    ctx: LogContext,
    options?: {
      dueCount?: number;
      invoiceCountHints?: {
        awaitingPaymentCount: number;
        partialCount: number;
      };
      seenCookieValue?: string | null;
    },
  ): Promise<ActionableNotification[]> {
    return withSpan('notificationService.listPendingForSession', {
      ...ctx,
      service: 'notifications',
      user_id: auth.userId,
    }, async () => {
      const notifications = await listActionableCached(
        auth,
        featureFlags,
        ctx,
        options?.dueCount,
        options?.invoiceCountHints,
      );
      const seen = parseSeenNotificationKinds(options?.seenCookieValue);
      return filterUnseenNotifications(notifications, seen);
    });
  },
};

export type { ActionableNotification, ActionableNotificationKind };
