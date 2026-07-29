import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getLocations } from '@/lib/actions/locations';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { LocationsPageClient } from '@/components/locations/locations-page-client';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function LocationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'locations.view', ctx);
  const t = await getTranslations('locations');
  const [locations, featureFlags] = await Promise.all([
    getLocations(locale),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <LocationsPageClient
        locations={locations}
        locale={locale}
        canEdit={canMutateModule(auth, 'locations') && featureFlags.master_data_mutations}
      />
    </div>
  );
}
