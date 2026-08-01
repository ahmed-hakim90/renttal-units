import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('odoo settings persist a distinct zero-rated tax id', () => {
  const settings = read('src/lib/odoo/settings.ts');
  assert.match(settings, /zeroRatedTaxId: number \| null/);
  assert.match(settings, /zeroRatedTaxId: asNumber\(value\.zeroRatedTaxId\)/);
  assert.match(read('src/lib/actions/odoo.ts'), /zeroRatedTaxId\?: number \| null/);
  assert.match(read('src/components/settings/settings-form.tsx'), /odooZeroRatedTaxId/);
});

test('contracts and invoices snapshot tax_treatment separately from non_taxable', () => {
  const migration = read('supabase/migrations/20260730190000_zero_rated_tax_treatment.sql');
  assert.match(migration, /CREATE TYPE contract_tax_treatment AS ENUM \('standard', 'zero_rated'\)/);
  assert.match(migration, /tax_treatment contract_tax_treatment NOT NULL DEFAULT 'standard'/);
  assert.match(migration, /taxTreatment/);

  const types = read('src/types/database.ts');
  assert.match(types, /export type ContractTaxTreatment = 'standard' \| 'zero_rated'/);
  assert.match(types, /tax_treatment: ContractTaxTreatment/);
});

test('odoo sync maps zero_rated lines to zeroRatedTaxId and keeps non_taxable empty', () => {
  const service = read('src/lib/odoo/service.ts');
  assert.match(service, /taxTreatment === 'zero_rated'/);
  assert.match(service, /settings\.zeroRatedTaxId/);
  assert.match(service, /Number\(snapshot\.tax_rate\) > 0/);
  assert.match(service, /tax_ids: \[\[6, 0, taxIds\]\]/);
});

test('issuing invoices requires zeroRatedTaxId when lines are zero-rated', () => {
  const odooActions = read('src/lib/actions/odoo.ts');
  assert.match(odooActions, /tax_treatment === 'zero_rated'/);
  assert.match(odooActions, /odooZeroRatedTaxMissing/);
  assert.match(odooActions, /!settings\.zeroRatedTaxId/);
});

test('contract UI exposes zero-rated tax selection for all lines', () => {
  const createForm = read('src/components/contracts/contract-create-form.tsx');
  const editor = read('src/components/contracts/contract-editor.tsx');
  assert.match(createForm, /zero_rated/);
  assert.match(createForm, /tax_treatment: next === 'zero_rated' \? 'zero_rated' : 'standard'/);
  assert.doesNotMatch(createForm, /<option value="non_taxable">/);
  assert.match(editor, /taxSelection/);
  assert.match(editor, /zeroRated/);
  assert.doesNotMatch(editor, /<option value="non_taxable">/);
});

test('invoice line recreation paths persist tax_treatment snapshots', () => {
  const contractService = read('src/lib/services/contract-service.ts');
  const rentalService = read('src/lib/services/rental-service.ts');
  const invoicesRepo = read('src/lib/repositories/invoices.ts');
  assert.match(contractService, /invoicesRepository\.createLines/);
  assert.match(contractService, /taxTreatment: line\.tax_treatment === 'zero_rated'/);
  assert.match(rentalService, /calculateContractBillingSchedule/);
  assert.match(rentalService, /createLines/);
  assert.match(invoicesRepo, /tax_treatment: line\.tax_treatment \?\? 'standard'/);
});
