import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getDashboardStats, getDueThisMonth, getInvoices } from '@/lib/actions/invoices';
import { getLocationsOccupancy, getPortfolioSummary } from '@/lib/actions/admin';
import { DashboardStatsCards } from '@/components/dashboard/stats-cards';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { LocationOccupancySection } from '@/components/dashboard/location-occupancy-section';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { getAuthContext } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { FEATURE_FLAG_DEFAULTS } from '@/lib/features';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { LoadingRegion, RecentActivitySkeleton } from '@/components/ui/skeleton';

async function DashboardRecentActivitySection({
  locale,
  canEdit,
  showPaymentStatusPages,
}: {
  locale: string;
  canEdit: boolean;
  showPaymentStatusPages: boolean;
}) {
  const dueInvoices = await getDueThisMonth(locale);
  const [awaitingInvoices, partialInvoices, fullyPaidInvoices] = await Promise.all([
    getInvoices(locale, { status: 'invoice_issued' }),
    showPaymentStatusPages
      ? getInvoices(locale, { status: 'partially_paid' })
      : Promise.resolve([]),
    showPaymentStatusPages
      ? getInvoices(locale, { status: 'fully_paid' })
      : Promise.resolve([]),
  ]);

  return (
    <RecentActivity
      dueInvoices={dueInvoices}
      awaitingInvoices={awaitingInvoices}
      partialInvoices={partialInvoices}
      fullyPaidInvoices={fullyPaidInvoices}
      locale={locale}
      canEdit={canEdit}
    />
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');
  const auth = await getAuthContext(ctx);
  const featureFlags = auth
    ? await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }).catch(() => FEATURE_FLAG_DEFAULTS)
    : FEATURE_FLAG_DEFAULTS;

  const canNavigate = Boolean(
    auth && (
      hasPermission(auth, 'locations.view')
      || hasPermission(auth, 'units.view')
      || hasPermission(auth, 'invoices.view')
    ),
  );
  const canShowActivity = Boolean(auth && hasPermission(auth, 'invoices.view'));
  const canEditActivity = Boolean(auth && (
    canMutateModule(auth, 'invoices') || hasPermission(auth, 'payments.record')
  ));

  const [stats, summary, locationsOccupancy] = await Promise.all([
    getDashboardStats(locale),
    getPortfolioSummary(locale),
    getLocationsOccupancy(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <DashboardStatsCards
        stats={stats}
        locale={locale}
        canNavigate={canNavigate}
        showPaymentStatusPages={featureFlags.invoices_payment_status_pages}
      />
      <PortfolioSummary summary={summary} locale={locale} canNavigate={canNavigate} />
      <LocationOccupancySection locations={locationsOccupancy} locale={locale} />
      {canShowActivity && (
        <Suspense
          fallback={(
            <LoadingRegion label={tc('loading')}>
              <RecentActivitySkeleton />
            </LoadingRegion>
          )}
        >
          <DashboardRecentActivitySection
            locale={locale}
            canEdit={canEditActivity}
            showPaymentStatusPages={featureFlags.invoices_payment_status_pages}
          />
        </Suspense>
      )}
    </div>
  );
}
