import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { ImportUnitsClient } from '@/components/import/import-units-client';
import { ImportContractsClient } from '@/components/import/import-contracts-client';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');
  const tu = await getTranslations('units');
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });

  return (
    <div className="space-y-10">
      <div>
        <PageHeader title={t('nav.import')} />
        <ImportUnitsClient locale={locale} canEdit />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-4">{tu('importContracts')}</h2>
        <ImportContractsClient locale={locale} canEdit />
      </div>
    </div>
  );
}
