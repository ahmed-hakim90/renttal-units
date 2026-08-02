import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const sourceUrl = new URL(`${specifier.slice(2)}.ts`, sourceRoot);
    return nextResolve(pathToFileURL(sourceUrl.pathname).href, context);
  },
});

const {
  hasLegacyContractTotalPricing,
  normalizeContractFormLine,
  previewContractInvoices,
} = await import('../src/lib/rental/contract-form-validation.ts');

test('defaults missing amount_basis to annual and recovers sticky amount values', () => {
  const normalized = normalizeContractFormLine({
    key: 'r1',
    line_type: 'rental',
    unit_id: '11111111-1111-1111-1111-111111111111',
    description: '',
    amount: '56000',
    annual_amount_untaxed: '',
    odoo_product_id: '',
    odoo_product_name: '',
    tax_rate: '15',
    tax_treatment: 'standard',
  });

  assert.equal(normalized.amount_basis, 'annual_untaxed');
  assert.equal(normalized.annual_amount_untaxed, '56000');
  assert.equal(normalized.amount, '');
  assert.equal(hasLegacyContractTotalPricing([normalized]), false);
});

test('preview derives full contract total from annual form values for the Rasd fixture', () => {
  const preview = previewContractInvoices({
    unit_id: '11111111-1111-1111-1111-111111111111',
    contract_number: '20682690054',
    start_date: '2024-07-15',
    end_date: '2027-07-14',
    total_amount: '',
    payment_cycle: 'quarterly',
    paid_through_date: '',
    opening_paid_amount: '',
    last_payment_date: '',
    opening_notes: '',
    tenant_name: 'شركة مداد القابضة',
    tenant_email: '',
    tenant_national_id: '',
    payment_conditions: [{
      enabled: false,
      applies_after_years: '5',
      percentage: '10',
    }],
    lines: [
      {
        key: 'rent',
        line_type: 'rental',
        unit_id: '11111111-1111-1111-1111-111111111111',
        description: '',
        // Sticky state may leave the typed annual value in `amount`.
        amount: '56000',
        annual_amount_untaxed: '',
        odoo_product_id: '',
        odoo_product_name: '',
        tax_rate: '15',
        tax_treatment: 'standard',
      },
      {
        key: 'service',
        line_type: 'service',
        unit_id: '',
        description: 'General service fees',
        amount: '7015',
        annual_amount_untaxed: '',
        odoo_product_id: '10171',
        odoo_product_name: 'General service fees',
        tax_rate: '0',
        tax_treatment: 'standard',
      },
    ],
  });

  assert.equal(preview.ready, true);
  assert.equal(preview.invoiceCount, 12);
  assert.equal(preview.totalAmount, 214_245);
  assert.equal(preview.periods[0].amountTotal, 17_853.75);
  assert.notEqual(preview.periods[0].amountTotal, 5_251.25);
});
