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
import { odooServiceProductsRepository } from '@/lib/repositories/odoo-service-products';
import { getPublicOdooSettings } from '@/lib/odoo/settings';

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

  const authCtx = { ...ctx, user_id: auth.userId, role: auth.role };
  const [contract, units, featureFlags, serviceProducts, odooSettings] = await Promise.all([
    getContract(locale, id),
    getUnits(locale),
    loadFeatureFlags(authCtx),
    odooServiceProductsRepository.findActive(authCtx),
    getPublicOdooSettings(authCtx),
  ]);

  if (!contract || contract.status !== 'draft') notFound();

  const availableUnits = units.filter(
    (unit) => !unit.active_contract && unit.status !== 'occupied',
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
        initialServiceProducts={serviceProducts
          .filter((product) => product.category_id === odooSettings.serviceCategoryId)
          .map((product) => ({
            id: product.odoo_product_id,
            name: product.name,
            display_name: product.display_name,
            default_code: product.default_code,
          }))}
      />
    </div>
  );
}
