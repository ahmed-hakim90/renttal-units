import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getLocations } from '@/lib/actions/locations';
import { getLocationStatement } from '@/lib/actions/admin';
import { LocationStatementReport } from '@/components/reports/location-statement-report';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function LocationStatementPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });

  const t = await getTranslations('reports');
  const locations = await getLocations(locale);
  const initialLocationId = locations[0]?.id ?? '';
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
      />
    </div>
  );
}
