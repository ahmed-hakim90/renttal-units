import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { ContractEditor } from '@/components/contracts/contract-editor';
import { buttonStyles } from '@/components/ui/button';
import { getContract } from '@/lib/actions/contracts';
import { getUnits } from '@/lib/actions/units';
import { requirePermission } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { odooServiceProductsRepository } from '@/lib/repositories/odoo-service-products';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import {
  contractHasFinancialActivity,
  getContractEditAccess,
} from '@/lib/rental/contract-edit-access';
import { contractToFormValues } from '@/lib/rental/contract-form-values';
import { Link } from '@/lib/i18n/navigation';

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'contracts.update', ctx);
  const t = await getTranslations('contracts');
  const tc = await getTranslations('common');

  const authCtx = { ...ctx, user_id: auth.userId, role: auth.role };
  const [contract, units, featureFlags, serviceProducts, odooSettings] = await Promise.all([
    getContract(locale, id),
    getUnits(locale),
    loadFeatureFlags(authCtx),
    odooServiceProductsRepository.findActive(authCtx),
    getPublicOdooSettings(authCtx),
  ]);

  if (!contract) notFound();

  const access = getContractEditAccess(contract.status);
  if (!access.allowed) {
    const reasonMessage =
      access.reason === 'cancelled'
        ? t('editNotAllowedCancelled')
        : access.reason === 'completed'
          ? t('editNotAllowedCompleted')
          : t('editNotAllowed');

    return (
      <div>
        <PageHeader title={contract.contract_number || t('edit')} compact />
        <div className="surface-panel mx-auto max-w-xl space-y-4 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold">{t('editNotAllowedTitle')}</h2>
          <p className="text-sm text-muted-foreground">{reasonMessage}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/contracts/${contract.id}`} className={buttonStyles()}>
              {tc('back')}
            </Link>
            <Link href="/contracts" className={buttonStyles({ variant: 'outline' })}>
              {t('title')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const contractUnitIds = new Set(
    (contract.lines ?? [])
      .filter((line) => line.line_type === 'rental' && line.unit_id)
      .map((line) => line.unit_id as string),
  );
  if (contract.unit_id) contractUnitIds.add(contract.unit_id);

  const availableUnits = units.filter((unit) => {
    if (contractUnitIds.has(unit.id)) return true;
    return !unit.active_contract && unit.status !== 'occupied';
  });

  const scheduleLocked =
    access.mode === 'edit-active' && contractHasFinancialActivity(contract.invoices);

  return (
    <div>
      <PageHeader
        title={contract.contract_number || t('edit')}
        subtitle={access.mode === 'edit-draft' ? t('createPageSubtitle') : t('editPageSubtitle')}
        compact
      />
      <ContractEditor
        mode={access.mode}
        contractId={contract.id}
        initialValues={contractToFormValues(contract)}
        units={availableUnits}
        locale={locale}
        openingBalanceEnabled={
          access.mode === 'edit-draft' && featureFlags.contracts_opening_balance
        }
        multiLineEnabled={featureFlags.contracts_multi_line}
        canDeleteDraft={access.mode === 'edit-draft' && hasPermission(auth, 'contracts.update')}
        scheduleLocked={scheduleLocked}
        odooVatRate={odooSettings.vatRate}
        odooZeroRatedTaxRate={odooSettings.zeroRatedTaxRate}
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
