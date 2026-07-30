import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getUnitsPageData } from '@/lib/actions/units';
import { UnitsManager } from '@/components/units/units-manager';

export default async function UnitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('units');
  const pageData = await getUnitsPageData(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UnitsManager
        units={pageData.units}
        locations={pageData.locations}
        locale={locale}
        canEdit={pageData.canEdit}
        showOdooCatalogButton={pageData.showOdooCatalogButton}
        showOdooServiceCatalogButton={pageData.showOdooServiceCatalogButton}
        allowCreateOdooProduct={pageData.allowCreateOdooProduct}
        allowLinkOdooProduct={pageData.allowLinkOdooProduct}
        initialServiceProducts={pageData.serviceProducts}
        serviceCategoryId={pageData.serviceCategoryId}
      />
    </div>
  );
}
