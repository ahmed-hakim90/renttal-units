import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getUnits } from '@/lib/actions/units';
import { getLocations } from '@/lib/actions/locations';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { UnitsManager } from '@/components/units/units-manager';

export default async function UnitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('units');
  const [units, locations, auth] = await Promise.all([
    getUnits(locale),
    getLocations(locale),
    getAuthContext({ correlation_id: await getCorrelationId() }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UnitsManager units={units} locations={locations} locale={locale} canEdit={auth?.isAdminEditor ?? false} />
    </div>
  );
}
