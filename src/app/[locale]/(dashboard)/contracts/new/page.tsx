import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractEditor } from '@/components/contracts/contract-editor';
import { getUnits } from '@/lib/actions/units';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function NewContractPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'contracts.create', ctx);
  const t = await getTranslations('contracts');
  const [units, featureFlags] = await Promise.all([
    getUnits(locale),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
  ]);

  const availableUnits = units.filter((unit) => !unit.active_contract);

  return (
    <div>
      <PageHeader title={t('create')} subtitle={t('createPageSubtitle')} compact />
      <ContractEditor
        mode="create"
        units={availableUnits}
        locale={locale}
        openingBalanceEnabled={featureFlags.contracts_opening_balance}
        multiLineEnabled={featureFlags.contracts_multi_line}
      />
    </div>
  );
}
