import { createClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getAuthContext } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { logger } from '@/lib/observability';
import { FEATURE_FLAG_DEFAULTS } from '@/lib/features';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { rentalService } from '@/lib/services/rental-service';

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

  return (
    <DashboardShell auth={session} dueInvoiceCount={dueInvoiceCount} featureFlags={featureFlags}>
      {children}
    </DashboardShell>
  );
}
