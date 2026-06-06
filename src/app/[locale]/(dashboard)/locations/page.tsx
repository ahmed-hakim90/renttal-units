import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getLocations } from '@/lib/actions/locations';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { LocationsPageClient } from '@/components/locations/locations-page-client';

export default async function LocationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('locations');
  const [locations, auth] = await Promise.all([
    getLocations(locale),
    getAuthContext({ correlation_id: await getCorrelationId() }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <LocationsPageClient locations={locations} locale={locale} canEdit={auth?.isAdminEditor ?? false} />
    </div>
  );
}
