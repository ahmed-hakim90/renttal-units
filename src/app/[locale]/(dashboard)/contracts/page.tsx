import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractsManager } from '@/components/contracts/contracts-manager';
import { getContracts } from '@/lib/actions/contracts';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function ContractsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'contracts.view', ctx);
  const t = await getTranslations('contracts');
  const contracts = await getContracts(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ContractsManager
        contracts={contracts}
        locale={locale}
        canEdit={canMutateModule(auth, 'contracts')}
      />
    </div>
  );
}
