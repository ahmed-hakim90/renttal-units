import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyContractWideOdooTaxRates,
  applyOdooTaxRatesPerLine,
  resolveTaxRateForSelection,
} from '../src/lib/rental/contract-tax-rates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('resolves taxable and zero-rated rates from Odoo settings', () => {
  assert.equal(resolveTaxRateForSelection('taxable', { vatRate: 15, zeroRatedTaxRate: 0 }), 15);
  assert.equal(resolveTaxRateForSelection('zero_rated', { vatRate: 15, zeroRatedTaxRate: 0 }), 0);
  assert.equal(resolveTaxRateForSelection('non_taxable', { vatRate: 15, zeroRatedTaxRate: 0 }), 0);
  assert.equal(resolveTaxRateForSelection('taxable', { vatRate: 5, zeroRatedTaxRate: 0 }), 5);
});

test('applies the selected Odoo rate to every contract line', () => {
  const lines = applyContractWideOdooTaxRates(
    [
      { line_type: 'rental', amount: 1000, tax_rate: 99, tax_treatment: 'standard' },
      { line_type: 'service', amount: 100, tax_rate: 99, tax_treatment: 'standard' },
    ],
    'zero_rated',
    { vatRate: 15, zeroRatedTaxRate: 0 },
  );
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.tax_rate, 0);
    assert.equal(line.tax_treatment, 'zero_rated');
  }

  const taxable = applyContractWideOdooTaxRates(lines, 'taxable', { vatRate: 15, zeroRatedTaxRate: 0 });
  for (const line of taxable) {
    assert.equal(line.tax_rate, 15);
    assert.equal(line.tax_treatment, 'standard');
  }
});

test('resolves each contract line tax independently using trusted Odoo rates', () => {
  const lines = applyOdooTaxRatesPerLine(
    [
      { line_type: 'rental', amount: 1150, tax_rate: 99, tax_treatment: 'standard' },
      { line_type: 'service', amount: 100, tax_rate: 0, tax_treatment: 'standard' },
      { line_type: 'service', amount: 50, tax_rate: 99, tax_treatment: 'zero_rated' },
    ],
    'taxable',
    { vatRate: 15, zeroRatedTaxRate: 0 },
  );

  assert.deepEqual(
    lines.map((line) => [line.tax_rate, line.tax_treatment]),
    [[15, 'standard'], [0, 'standard'], [0, 'zero_rated']],
  );
});

test('odoo tax options expose amount and settings store both rates', () => {
  const service = read('src/lib/odoo/service.ts');
  assert.match(service, /function taxOptionFromRecord/);
  assert.match(service, /amount: hasAmount \? amount : null/);
  assert.match(service, /async resolveConfiguredTaxRates/);
  assert.match(read('src/lib/odoo/settings.ts'), /zeroRatedTaxRate: number/);
  assert.match(read('src/lib/services/contract-service.ts'), /applyOdooTaxRatesToContractLines/);
  assert.match(read('src/lib/services/contract-service.ts'), /applyOdooTaxRatesPerLine/);
  assert.match(read('src/components/contracts/contract-editor.tsx'), /odooVatRate/);
  assert.match(read('src/components/contracts/contract-editor.tsx'), /rateForTaxSelection/);
});
