import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { ImportUnitsClient } from '@/components/import/import-units-client';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');
  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });

  return (
    <div>
      <PageHeader title={t('nav.import')} />
      <ImportUnitsClient locale={locale} canEdit={auth?.isAdminEditor ?? false} />
    </div>
  );
}
