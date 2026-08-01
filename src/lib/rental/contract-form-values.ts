import type { ContractFormValues } from '@/lib/rental/contract-form-validation';
import type { Contract } from '@/types/database';

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

export function contractToFormValues(contract: Contract): ContractEditorInitialValues {
  const lines = (contract.lines ?? []).map((line) => ({
    key: line.id,
    line_type: line.line_type,
    unit_id: line.unit_id ?? '',
    description: line.description ?? '',
    amount: line.amount != null ? String(line.amount) : '',
    odoo_product_id: line.odoo_product_id != null ? String(line.odoo_product_id) : '',
    odoo_product_name: line.odoo_product_name ?? '',
    tax_rate: String(line.tax_rate ?? 15),
    tax_treatment: (line.tax_treatment === 'zero_rated' ? 'zero_rated' : 'standard') as
      | 'standard'
      | 'zero_rated',
  }));

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
