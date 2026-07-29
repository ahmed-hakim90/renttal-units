import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getLocations } from '@/lib/actions/locations';
import { getLocationStatement } from '@/lib/actions/admin';
import { LocationStatementReport } from '@/components/reports/location-statement-report';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function LocationStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locale } = await params;
  const { locationId } = await searchParams;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'reports.view', ctx);
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  if (!featureFlags.reports_operational) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('reports');
  const locations = await getLocations(locale);
  const initialLocationId = locations.some((location) => location.id === locationId)
    ? locationId ?? ''
    : locations[0]?.id ?? '';
  const initialStatement = initialLocationId
    ? await getLocationStatement(locale, initialLocationId)
    : null;

  return (
    <div>
      <PageHeader title={t('locationStatement')} subtitle={t('locationStatementSubtitle')} />
      <LocationStatementReport
        locations={locations}
        initialLocationId={initialLocationId}
        initialStatement={initialStatement}
        locale={locale}
        canExport={hasPermission(auth, 'reports.export')}
      />
    </div>
  );
}
