import type { ContractTaxTreatment, ContractLineInput } from '@/types/database';
import type { OdooSettings } from '@/lib/odoo/settings';

export type ContractTaxSelection = 'taxable' | 'zero_rated' | 'non_taxable';

/**
 * Resolves the local tax rate for a contract-wide tax selection from the
 * Odoo tax IDs configured in settings. Rates come from those Odoo records
 * (stored as vatRate / zeroRatedTaxRate) so invoice math matches Odoo.
 */
export function resolveTaxRateForSelection(
  selection: ContractTaxSelection,
  settings: Pick<OdooSettings, 'vatRate' | 'zeroRatedTaxRate'>,
): number {
  if (selection === 'taxable') {
    return Math.min(100, Math.max(0, Number(settings.vatRate) || 0));
  }
  if (selection === 'zero_rated') {
    return Math.min(100, Math.max(0, Number(settings.zeroRatedTaxRate) || 0));
  }
  return 0;
}

export function taxSelectionFromLines(
  taxMode: 'taxable' | 'non_taxable' | null | undefined,
  lines?: Array<{ tax_treatment?: ContractTaxTreatment | null }> | null,
): ContractTaxSelection {
  if ((lines ?? []).some((line) => line.tax_treatment === 'zero_rated')) {
    return 'zero_rated';
  }
  return taxMode === 'taxable' ? 'taxable' : 'non_taxable';
}

export function applyContractWideOdooTaxRates(
  lines: ContractLineInput[],
  selection: ContractTaxSelection,
  settings: Pick<OdooSettings, 'vatRate' | 'zeroRatedTaxRate'>,
): ContractLineInput[] {
  const taxRate = resolveTaxRateForSelection(selection, settings);
  const taxTreatment: ContractTaxTreatment = selection === 'zero_rated' ? 'zero_rated' : 'standard';
  return lines.map((line) => ({
    ...line,
    tax_rate: taxRate,
    tax_treatment: taxTreatment,
  }));
}

export function contractTaxSelectionFromPayload(input: {
  tax_mode?: 'taxable' | 'non_taxable' | null;
  lines?: Array<{ tax_treatment?: ContractTaxTreatment | null }> | null;
}): ContractTaxSelection {
  return taxSelectionFromLines(input.tax_mode, input.lines);
}
