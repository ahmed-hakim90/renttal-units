import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractsManager } from '@/components/contracts/contracts-manager';
import { getContracts } from '@/lib/actions/contracts';
import { getUnits } from '@/lib/actions/units';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function ContractsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });
  const t = await getTranslations('contracts');
  const [contracts, units] = await Promise.all([
    getContracts(locale),
    getUnits(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ContractsManager
        contracts={contracts}
        units={units}
        locale={locale}
        canEdit
      />
    </div>
  );
}
