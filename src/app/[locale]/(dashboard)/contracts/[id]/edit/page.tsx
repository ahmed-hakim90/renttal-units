import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractEditor, contractToFormValues } from '@/components/contracts/contract-editor';
import { getContract } from '@/lib/actions/contracts';
import { getUnits } from '@/lib/actions/units';
import { requirePermission } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function EditDraftContractPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'contracts.update', ctx);
  const t = await getTranslations('contracts');

  const [contract, units, featureFlags] = await Promise.all([
    getContract(locale, id),
    getUnits(locale),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
  ]);

  if (!contract || contract.status !== 'draft') notFound();

  const draftUnitIds = new Set(
    (contract.lines ?? [])
      .filter((line) => line.line_type === 'rental' && line.unit_id)
      .map((line) => line.unit_id as string),
  );
  const availableUnits = units.filter(
    (unit) => !unit.active_contract || draftUnitIds.has(unit.id),
  );

  return (
    <div>
      <PageHeader
        title={contract.contract_number || t('edit')}
        subtitle={t('createPageSubtitle')}
        compact
      />
      <ContractEditor
        mode="edit-draft"
        contractId={contract.id}
        initialValues={contractToFormValues(contract)}
        units={availableUnits}
        locale={locale}
        openingBalanceEnabled={featureFlags.contracts_opening_balance}
        multiLineEnabled={featureFlags.contracts_multi_line}
        canDeleteDraft={hasPermission(auth, 'contracts.update')}
      />
    </div>
  );
}
