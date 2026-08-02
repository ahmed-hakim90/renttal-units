import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getTenantsPageData } from '@/lib/actions/tenants';
import { TenantsManager } from '@/components/tenants/tenants-manager';

export default async function TenantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('tenants');
  const pageData = await getTenantsPageData(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <TenantsManager
        tenants={pageData.tenants}
        locale={locale}
        canCreate={pageData.canCreate}
        canUpdate={pageData.canUpdate}
        canDelete={pageData.canDelete}
      />
    </div>
  );
}
