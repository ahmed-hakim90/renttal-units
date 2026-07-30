import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import {
  getDashboardStats,
  getDueThisMonth,
  getInvoices,
  getOverdueInvoices,
} from '@/lib/actions/invoices';
import {
  getDashboardDebtAging,
  getDashboardOdooHealth,
  getDashboardOverview,
} from '@/lib/actions/admin';
import { DashboardStatsCards } from '@/components/dashboard/stats-cards';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { LocationOccupancySection } from '@/components/dashboard/location-occupancy-section';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { DashboardQuickActions } from '@/components/dashboard/quick-actions';
import { DebtAgingSummary } from '@/components/dashboard/debt-aging-summary';
import { DashboardSecondaryAlerts } from '@/components/dashboard/secondary-alerts';
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
  const [overdueInvoices, dueInvoices, partialInvoices] = await Promise.all([
    getOverdueInvoices(locale),
    getDueThisMonth(locale),
    showPaymentStatusPages
      ? getInvoices(locale, { status: 'partially_paid' })
      : Promise.resolve([]),
  ]);

  return (
    <RecentActivity
      overdueInvoices={overdueInvoices}
      dueInvoices={dueInvoices}
      partialInvoices={partialInvoices}
      locale={locale}
      canEdit={canEdit}
      showPaymentStatusPages={showPaymentStatusPages}
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
  const canCreateContract = Boolean(auth && hasPermission(auth, 'contracts.create'));
  const canRecordPayment = Boolean(auth && hasPermission(auth, 'payments.record'));
  const canSyncDue = Boolean(auth && hasPermission(auth, 'invoices.create'));
  const canViewContracts = Boolean(auth && hasPermission(auth, 'contracts.view'));
  const canViewReports = Boolean(
    auth
    && hasPermission(auth, 'reports.view')
    && featureFlags.reports_operational,
  );
  const canManageOdoo = Boolean(
    auth
    && hasPermission(auth, 'odoo.manage')
    && featureFlags.odoo_invoices_documents,
  );
  const paymentHref = featureFlags.invoices_payment_status_pages
    ? '/partial-payments' as const
    : '/invoices' as const;

  const [stats, overview, debtAging, odooHealth] = await Promise.all([
    getDashboardStats(locale),
    getDashboardOverview(locale),
    canViewReports ? getDashboardDebtAging(locale) : Promise.resolve(null),
    canManageOdoo ? getDashboardOdooHealth(locale) : Promise.resolve(null),
  ]);
  const { summary, locationsOccupancy } = overview;

  return (
    <div>
      <PageHeader
        compact
        title={t('title')}
        subtitle={t('subtitle')}
        actions={(
          <DashboardQuickActions
            locale={locale}
            canCreateContract={canCreateContract}
            canRecordPayment={canRecordPayment}
            canSyncDue={canSyncDue}
            paymentHref={paymentHref}
          />
        )}
      />
      <DashboardStatsCards
        stats={stats}
        locale={locale}
        canNavigate={canNavigate}
        showPaymentStatusPages={featureFlags.invoices_payment_status_pages}
      />
      <PortfolioSummary summary={summary} locale={locale} canNavigate={canNavigate} />
      {debtAging && (
        <DebtAgingSummary
          summary={debtAging}
          locale={locale}
          canNavigate={canViewReports}
        />
      )}
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
      <DashboardSecondaryAlerts
        draftContracts={summary.draftContracts}
        odooHealth={odooHealth}
        locale={locale}
        canViewContracts={canViewContracts}
        canManageOdoo={canManageOdoo}
      />
    </div>
  );
}
