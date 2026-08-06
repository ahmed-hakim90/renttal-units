import type { ContractFormValues } from '@/lib/rental/contract-form-validation';
import type { Contract, ContractPercentageIncreaseCondition } from '@/types/database';

export type ContractEditorInitialValues = Partial<ContractFormValues> & {
  notes?: string;
  applyVat?: boolean;
  taxSelection?: 'taxable' | 'zero_rated' | 'non_taxable';
  tenant_phone?: string;
  tenant_odoo_partner_id?: number | null;
  tenant_vat?: string;
  tenant_street?: string;
  tenant_city?: string;
  tenant_country_code?: string;
  sync_tenant_to_odoo?: boolean;
};

function isRentalPercentageIncrease(
  condition: Contract['payment_conditions'][number],
): condition is ContractPercentageIncreaseCondition {
  return condition.condition_type === 'percentage_increase_after' && condition.target === 'rental';
}

export function contractToFormValues(contract: Contract): ContractEditorInitialValues {
  const rentIncreaseCondition = (contract.payment_conditions ?? []).find(isRentalPercentageIncrease);
  const firstYearSingleInstallment = (contract.payment_conditions ?? []).some(
    (condition) => condition.condition_type === 'first_year_single_installment'
      && condition.enabled,
  );
  const lines = (contract.lines ?? []).map((line) => {
    const amountBasis = line.amount_basis === 'annual_untaxed'
      ? 'annual_untaxed' as const
      : 'contract_total_inclusive' as const;
    return {
      key: line.id,
      line_type: line.line_type,
      unit_id: line.unit_id ?? '',
      description: line.description ?? '',
      amount: line.amount != null ? String(line.amount) : '',
      amount_basis: amountBasis,
      annual_amount_untaxed: amountBasis === 'annual_untaxed' && line.annual_amount_untaxed != null
        ? String(line.annual_amount_untaxed)
        : '',
      odoo_product_id: line.odoo_product_id != null ? String(line.odoo_product_id) : '',
      odoo_product_name: line.odoo_product_name ?? '',
      tax_rate: String(line.tax_rate ?? 15),
      tax_treatment: (line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard') as
        | 'standard'
        | 'zero_rated',
    };
  });

  return {
    unit_id: contract.unit_id ?? '',
    contract_number: contract.contract_number ?? '',
    start_date: contract.start_date ?? '',
    end_date: contract.end_date ?? '',
    total_amount: String(contract.total_amount ?? ''),
    payment_cycle: contract.payment_cycle ?? 'quarterly',
    paid_through_date: contract.paid_through_date ?? '',
    opening_paid_amount: contract.opening_paid_amount
      ? String(contract.opening_paid_amount)
      : '',
    last_payment_date: contract.opening_payment_date ?? '',
    opening_notes: contract.opening_notes ?? '',
    tenant_name: contract.tenant?.full_name ?? '',
    tenant_email: contract.tenant?.email ?? '',
    tenant_national_id: contract.tenant?.national_id ?? '',
    lines,
    payment_conditions: [{
      enabled: rentIncreaseCondition?.enabled ?? false,
      applies_after_years: rentIncreaseCondition
        ? String(rentIncreaseCondition.applies_after_months / 12)
        : '5',
      percentage: rentIncreaseCondition ? String(rentIncreaseCondition.percentage) : '10',
      first_year_single_installment: firstYearSingleInstallment,
    }],
    notes: contract.notes ?? '',
    taxSelection: (contract.lines ?? []).some((line) => line.tax_treatment === 'zero_rated')
      ? 'zero_rated'
      : contract.tax_mode === 'taxable'
        ? 'taxable'
        : 'non_taxable',
    tenant_phone: contract.tenant?.phone ?? '',
    tenant_odoo_partner_id: contract.tenant?.odoo_partner_id ?? null,
    tenant_vat: contract.tenant?.vat ?? '',
    tenant_street: contract.tenant?.street ?? '',
    tenant_city: contract.tenant?.city ?? '',
    tenant_country_code: contract.tenant?.country_code ?? 'SA',
    sync_tenant_to_odoo: !contract.tenant?.odoo_partner_id,
  };
}
