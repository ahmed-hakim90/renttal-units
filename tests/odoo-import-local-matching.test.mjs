import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  localContractOptionsForLine,
  matchOdooLineToLocalInvoice,
} from '../src/lib/odoo/import-matching.ts';

const candidates = [
  {
    invoiceId: 'local-first',
    invoiceNumber: '12',
    odooInvoiceId: 57596,
    contractId: 'contract-active',
    contractNumber: '10037652099 / 1-0',
    contractStatus: 'active',
    contractStart: '2026-01-27',
    contractEnd: '2027-01-26',
    odooTrackingStartDate: null,
    tenantOdooPartnerId: 917,
    tenantName: 'Tenant',
    unitId: 'unit-10',
    unitNumber: 'Apartment 10',
    periodStart: '2026-01-27',
    periodEnd: '2026-07-26',
    amountTotal: 22_750,
    status: 'invoice_issued',
  },
  {
    invoiceId: 'local-second',
    invoiceNumber: 'DUE-000005',
    odooInvoiceId: null,
    contractId: 'contract-active',
    contractNumber: '10037652099 / 1-0',
    contractStatus: 'active',
    contractStart: '2026-01-27',
    contractEnd: '2027-01-26',
    odooTrackingStartDate: null,
    tenantOdooPartnerId: 917,
    tenantName: 'Tenant',
    unitId: 'unit-10',
    unitNumber: 'Apartment 10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
    amountTotal: 22_750,
    status: 'due',
  },
];

test('matches an existing Odoo link before inferred contract matching', () => {
  const result = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57596,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: '2026-01-27',
    periodEnd: '2026-07-26',
    amountTotal: 22_750,
  }, candidates);

  assert.equal(result.reason, 'odooInvoiceId');
  assert.equal(result.candidate?.invoiceId, 'local-first');
});

test('matches the second scheduled invoice by unit, tenant, period, and amount', () => {
  const result = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57211,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
    amountTotal: 22_750,
  }, candidates);

  assert.equal(result.reason, 'unitTenantPeriod');
  assert.equal(result.candidate?.invoiceNumber, 'DUE-000005');
});

test('uses the Odoo invoice date when legacy invoice lines have no period fields', () => {
  const result = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57212,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: null,
    periodEnd: null,
    invoiceDate: '2026-07-27',
    amountTotal: 22_750,
  }, candidates);

  assert.equal(result.reason, 'unitTenantPeriod');
  assert.equal(result.candidate?.invoiceNumber, 'DUE-000005');
});

test('does not auto-match a legacy invoice when its amount differs', () => {
  const result = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57212,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: null,
    periodEnd: null,
    invoiceDate: '2026-07-27',
    amountTotal: 22_751,
  }, candidates);

  assert.equal(result.reason, 'amountMismatch');
  assert.equal(result.candidate, null);
});

test('matches a composite invoice using the document total including services', () => {
  const compositeCandidate = {
    ...candidates[1],
    amountTotal: 20_250,
  };
  const result = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57211,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
    amountTotal: 20_250,
  }, [compositeCandidate]);

  assert.equal(result.reason, 'unitTenantPeriod');
  assert.equal(result.candidate?.invoiceId, 'local-second');
});

test('keeps amount and tenant conflicts in review', () => {
  const amountMismatch = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57211,
    partnerOdooId: 917,
    reference: null,
    unitId: 'unit-10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
    amountTotal: 20_000,
  }, candidates);
  const tenantMismatch = matchOdooLineToLocalInvoice({
    odooInvoiceId: 57211,
    partnerOdooId: 999,
    reference: null,
    unitId: 'unit-10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
    amountTotal: 22_750,
  }, candidates);

  assert.equal(amountMismatch.reason, 'amountMismatch');
  assert.equal(amountMismatch.candidate, null);
  assert.equal(tenantMismatch.reason, 'contractNotMatched');
  assert.equal(tenantMismatch.candidate, null);
});

test('contract selector only exposes compatible active local contracts', () => {
  const options = localContractOptionsForLine({
    partnerOdooId: 917,
    unitId: 'unit-10',
    periodStart: '2026-07-27',
    periodEnd: '2027-01-26',
  }, candidates);

  assert.equal(options.length, 1);
  assert.equal(options[0].contractNumber, '10037652099 / 1-0');
  assert.deepEqual(options[0].invoices.map((invoice) => invoice.invoiceNumber), ['12', 'DUE-000005']);
});

test('atomic link migration validates permission and ownership boundaries', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260730222000_odoo_invoice_local_matching.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /has_permission\('odoo\.manage'\)/);
  assert.match(migration, /LOCAL_INVOICE_CONTRACT_MISMATCH/);
  assert.match(migration, /LOCAL_INVOICE_UNIT_MISMATCH/);
  assert.match(migration, /CONTRACT_TENANT_MISMATCH/);
  assert.match(migration, /ODOO_INVOICE_ALREADY_LINKED/);
  assert.match(migration, /payments_odoo_source_guard/);
});

test('composite invoice migration validates the document total and links service lines', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260730230000_odoo_composite_invoice_matching.sql', import.meta.url),
    'utf8',
  );
  const service = await readFile(
    new URL('../src/lib/odoo/import-service.ts', import.meta.url),
    'utf8',
  );

  assert.match(migration, /WHEN COUNT\(\*\) = 1 THEN v_document\.amount_total/);
  assert.match(migration, /AND is_rental = FALSE/);
  assert.match(service, /rentalLineCount === 1 \? documentAmountTotal : amountTotal/);
  assert.match(service, /sharedRentalContracts/);
});

test('all row actions and local payments stop once an invoice is linked to Odoo', async () => {
  const [table, paymentService, migration] = await Promise.all([
    readFile(new URL('../src/components/invoices/invoices-table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/services/payment-service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260730231500_odoo_linked_payment_guard.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(table, /return invoice\.odoo_invoice_id != null/);
  assert.match(table, /if \(isOdooManagedInvoice\(inv\)\) return null/);
  assert.match(paymentService, /oldInvoice\.odoo_invoice_id != null/);
  assert.match(migration, /invoice\.odoo_invoice_id IS NOT NULL/);
});

test('import preview is restored from a session-scoped run id', async () => {
  const component = await readFile(
    new URL('../src/components/import/import-odoo-center-client.tsx', import.meta.url),
    'utf8',
  );

  assert.match(component, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(component, /getOdooInvoiceImportPreview\(locale, runId\)/);
  assert.match(component, /window\.sessionStorage\.setItem\(previewSessionKey\(locale\), nextPreview\.runId\)/);
  assert.doesNotMatch(component, /localStorage/);
});

test('linked Odoo documents are hidden from duplicate invoice tables', async () => {
  const [repository, invoicesPage, locationPage, reportingService] = await Promise.all([
    readFile(new URL('../src/lib/repositories/odoo-import.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/[locale]/(dashboard)/invoices/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/[locale]/(dashboard)/locations/[id]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/services/reporting-service.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(repository, /filters\.unmatchedOnly/);
  assert.match(repository, /line\.is_rental \? !line\.local_invoice_id : !line\.contract_id/);
  assert.match(invoicesPage, /getOdooInvoiceDocuments\(locale, \{ unmatchedOnly: true \}\)/);
  assert.match(locationPage, /locationId: id, unmatchedOnly: true/);
  assert.match(reportingService, /findDocuments\(\{ locationId \}, ctx\)/);
  assert.doesNotMatch(reportingService, /unmatchedOnly/);
});

test('saving selected documents does not automatically load another preview', async () => {
  const component = await readFile(
    new URL('../src/components/import/import-odoo-center-client.tsx', import.meta.url),
    'utf8',
  );
  const commitHandler = component.slice(
    component.indexOf('async function handleCommit()'),
    component.indexOf('\n  return (', component.indexOf('async function handleCommit()')),
  );

  assert.doesNotMatch(commitHandler, /handlePreview\('incremental'\)/);
  assert.match(commitHandler, /successfulItemIds/);
  assert.match(commitHandler, /setSelectedIds\(new Set\(failedByItemId\.keys\(\)\)\)/);
});

test('unchanged imported Odoo documents are not offered for approval again', async () => {
  const [service, component] = await Promise.all([
    readFile(new URL('../src/lib/odoo/import-service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/import/import-odoo-center-client.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(service, /existingWriteTime === incomingWriteTime/);
  assert.match(service, /rentalLines\.every\(\(line\) => line\.matchReason === 'odooInvoiceId'\)/);
  assert.match(service, /\? 'ignored'/);
  assert.match(component, /item\.itemStatus === 'ready'/);
  assert.match(component, /item\.itemStatus === 'ignored'/);
});

test('reconciliation preview is local-first and Sync All requires approval', async () => {
  const [service, component] = await Promise.all([
    readFile(new URL('../src/lib/odoo/import-service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/import/import-odoo-center-client.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(service, /localInvoices: OdooReconciliationLocalInvoice\[\]/);
  assert.match(service, /\['due', 'invoice_issued', 'partially_paid', 'overdue'\]/);
  assert.match(component, /preview\.localInvoices\.map/);
  assert.match(component, /result === 'missing'/);
  assert.match(component, /startOdooInvoiceImportPreview\(locale\)/);
  assert.doesNotMatch(component, /startOdooIncrementalImportPreview/);
  assert.match(component, /saveSelectedOdooDocuments/);
});
