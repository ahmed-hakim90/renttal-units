import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getUnits } from '@/lib/actions/units';
import { getLocations } from '@/lib/actions/locations';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { UnitsManager } from '@/components/units/units-manager';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function UnitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'units.view', ctx);
  const t = await getTranslations('units');
  const [units, locations, featureFlags] = await Promise.all([
    getUnits(locale),
    getLocations(locale),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UnitsManager
        units={units}
        locations={locations}
        locale={locale}
        canEdit={canMutateModule(auth, 'units') && featureFlags.master_data_mutations}
        showOdooCatalogButton={featureFlags.units_odoo_catalog_button}
        allowCreateOdooProduct={featureFlags.units_create_odoo_product}
        allowLinkOdooProduct={featureFlags.units_link_odoo_product}
      />
    </div>
  );
}
