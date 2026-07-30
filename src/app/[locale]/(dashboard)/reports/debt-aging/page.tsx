import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getDebtAgingReport } from '@/lib/actions/admin';
import { getLocations } from '@/lib/actions/locations';
import { DebtAgingReport } from '@/components/reports/debt-aging-report';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function DebtAgingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'reports.view', ctx);
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  if (!featureFlags.reports_operational) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('reports');
  const [invoices, locations] = await Promise.all([
    getDebtAgingReport(locale),
    getLocations(locale),
  ]);

  return (
    <div>
      <PageHeader compact title={t('debtAging')} subtitle={t('debtAgingSubtitle')} />
      <DebtAgingReport
        invoices={invoices}
        locations={locations}
        locale={locale}
        canExport={hasPermission(auth, 'reports.export')}
      />
    </div>
  );
}
