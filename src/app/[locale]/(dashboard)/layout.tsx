import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getAuthContext } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { logger } from '@/lib/observability';
import { FEATURE_FLAG_DEFAULTS } from '@/lib/features';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { SESSION_NOTIFICATIONS_COOKIE } from '@/lib/notifications/guards';
import { invoiceService } from '@/lib/services/invoice-service';
import { notificationService } from '@/lib/services/notification-service';
import { rentalService } from '@/lib/services/rental-service';
import type { ActionableNotification } from '@/lib/notifications/guards';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
  }

  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await getAuthContext(ctx);
  if (!auth) {
    redirect({ href: '/login', locale });
  }

  const session = auth as NonNullable<typeof auth>;

  if (session.mustChangePassword) {
    redirect({ href: '/change-password', locale });
  }

  let dueInvoiceCount = 0;
  if (hasPermission(session, 'invoices.view')) {
    try {
      dueInvoiceCount = await rentalService.countDueThisMonth(session, {
        ...ctx,
        user_id: session.userId,
        role: session.role,
      });
    } catch (error) {
      logger.error('Failed to load due invoice navigation count', {
        ...ctx,
        user_id: session.userId,
        role: session.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let featureFlags = FEATURE_FLAG_DEFAULTS;
  try {
    featureFlags = await loadFeatureFlags({
      ...ctx,
      user_id: session.userId,
      role: session.role,
    });
  } catch (error) {
    logger.error('Failed to load feature flags for dashboard shell', {
      ...ctx,
      user_id: session.userId,
      role: session.role,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let invoiceNavigationCounts = {
    dueNow: dueInvoiceCount,
    awaitingPayment: 0,
    partialPayments: 0,
    fullyPaid: 0,
  };
  let invoiceCountHints:
    | { awaitingPaymentCount: number; partialCount: number }
    | undefined;
  if (hasPermission(session, 'invoices.view')) {
    try {
      const statusCounts = await invoiceService.getNavigationCounts(session, {
        ...ctx,
        user_id: session.userId,
        role: session.role,
      });
      invoiceNavigationCounts = {
        dueNow: dueInvoiceCount,
        ...statusCounts,
      };
      invoiceCountHints = {
        awaitingPaymentCount: statusCounts.awaitingPayment,
        partialCount: statusCounts.partialPayments,
      };
    } catch (error) {
      logger.error('Failed to load invoice navigation counts', {
        ...ctx,
        user_id: session.userId,
        role: session.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let headerNotifications: ActionableNotification[] = [];
  let sessionNotifications: ActionableNotification[] = [];
  try {
    const logCtx = {
      ...ctx,
      user_id: session.userId,
      role: session.role,
    };
    const cookieStore = await cookies();
    headerNotifications = await notificationService.listActionable(
      session,
      featureFlags,
      logCtx,
      dueInvoiceCount,
      invoiceCountHints,
    );
    sessionNotifications = await notificationService.listPendingForSession(
      session,
      featureFlags,
      logCtx,
      {
        dueCount: dueInvoiceCount,
        invoiceCountHints,
        seenCookieValue: cookieStore.get(SESSION_NOTIFICATIONS_COOKIE)?.value,
      },
    );
  } catch (error) {
    logger.error('Failed to load session notifications', {
      ...ctx,
      user_id: session.userId,
      role: session.role,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <DashboardShell
      auth={session}
      invoiceNavigationCounts={invoiceNavigationCounts}
      featureFlags={featureFlags}
      headerNotifications={headerNotifications}
      sessionNotifications={sessionNotifications}
      locale={locale}
    >
      {children}
    </DashboardShell>
  );
}
