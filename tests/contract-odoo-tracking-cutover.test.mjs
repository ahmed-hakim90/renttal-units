import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sourceRoot = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const sourceUrl = new URL(`${specifier.slice(2)}.ts`, sourceRoot);
    return nextResolve(pathToFileURL(sourceUrl.pathname).href, context);
  },
});

const {
  applyOpeningBalanceToSchedule,
  resolveFirstUnpaidPeriod,
  resolveOdooTrackingStartDate,
} = await import('../src/lib/rental/contract-opening-balance.ts');
const {
  filterCandidatesForOdooTracking,
  isOdooInputBeforeContractTracking,
  matchOdooLineToLocalInvoice,
} = await import('../src/lib/odoo/import-matching.ts');

const schedule = [
  { periodStart: '2024-01-01', periodEnd: '2024-06-30', amount: 1000 },
  { periodStart: '2024-07-01', periodEnd: '2024-12-31', amount: 1000 },
  { periodStart: '2025-01-01', periodEnd: '2025-06-30', amount: 1000 },
];

test('resolves first unpaid installment and Odoo tracking start after paid-through', () => {
  const firstUnpaid = resolveFirstUnpaidPeriod(schedule, '2024-06-30');
  assert.equal(firstUnpaid?.periodStart, '2024-07-01');
  assert.equal(resolveOdooTrackingStartDate(schedule, '2024-06-30'), '2024-07-01');
});

test('opening paid amount applies only to the first open installment', () => {
  const settled = applyOpeningBalanceToSchedule(schedule, {
    paid_through_date: '2024-06-30',
    opening_paid_amount: 250,
  });

  assert.equal(settled[0].status, 'fully_paid');
  assert.equal(settled[0].paid_amount, 1000);
  assert.equal(settled[1].paid_amount, 250);
  assert.ok(['partially_paid', 'overdue'].includes(settled[1].status));
  assert.equal(settled[2].paid_amount, 0);
  assert.equal(settled[2].status, 'due');
});

test('gap paid-through still advances tracking to the next sequential open period', () => {
  // paid_through mid-history: periods ending on/before that date are treated paid.
  assert.equal(resolveOdooTrackingStartDate(schedule, '2024-12-31'), '2025-01-01');
  // A paid-through inside an open period does not mark that period fully paid.
  assert.equal(resolveFirstUnpaidPeriod(schedule, '2024-12-15')?.periodStart, '2024-07-01');
});

const candidates = [
  {
    invoiceId: 'historical',
    invoiceNumber: 'HIST-1',
    odooInvoiceId: null,
    contractId: 'contract-1',
    contractNumber: 'C-1',
    contractStatus: 'active',
    contractStart: '2024-01-01',
    contractEnd: '2025-06-30',
    odooTrackingStartDate: '2024-07-01',
    tenantOdooPartnerId: 10,
    tenantName: 'Tenant',
    unitId: 'unit-1',
    unitNumber: '1',
    periodStart: '2024-01-01',
    periodEnd: '2024-06-30',
    amountTotal: 1000,
    status: 'fully_paid',
  },
  {
    invoiceId: 'open',
    invoiceNumber: 'OPEN-1',
    odooInvoiceId: null,
    contractId: 'contract-1',
    contractNumber: 'C-1',
    contractStatus: 'active',
    contractStart: '2024-01-01',
    contractEnd: '2025-06-30',
    odooTrackingStartDate: '2024-07-01',
    tenantOdooPartnerId: 10,
    tenantName: 'Tenant',
    unitId: 'unit-1',
    unitNumber: '1',
    periodStart: '2024-07-01',
    periodEnd: '2024-12-31',
    amountTotal: 1000,
    status: 'due',
  },
];

test('matching excludes local invoices before the contract Odoo cutover', () => {
  const trackable = filterCandidatesForOdooTracking(candidates);
  assert.deepEqual(trackable.map((row) => row.invoiceId), ['open']);

  const historical = matchOdooLineToLocalInvoice({
    odooInvoiceId: 1,
    partnerOdooId: 10,
    reference: null,
    unitId: 'unit-1',
    periodStart: '2024-01-01',
    periodEnd: '2024-06-30',
    amountTotal: 1000,
  }, candidates);
  assert.equal(historical.reason, 'localInvoiceMissing');
  assert.equal(historical.candidate, null);

  const open = matchOdooLineToLocalInvoice({
    odooInvoiceId: 2,
    partnerOdooId: 10,
    reference: null,
    unitId: 'unit-1',
    periodStart: '2024-07-01',
    periodEnd: '2024-12-31',
    amountTotal: 1000,
  }, candidates);
  assert.equal(open.reason, 'unitTenantPeriod');
  assert.equal(open.candidate?.invoiceId, 'open');
});

test('detects historical Odoo periods before every related contract cutover', () => {
  assert.equal(isOdooInputBeforeContractTracking({
    partnerOdooId: 10,
    unitId: 'unit-1',
    periodStart: '2024-01-01',
    invoiceDate: null,
  }, candidates), true);
  assert.equal(isOdooInputBeforeContractTracking({
    partnerOdooId: 10,
    unitId: 'unit-1',
    periodStart: '2024-07-01',
    invoiceDate: null,
  }, candidates), false);
});

test('cutover migration adds columns, persists cutover fields, and blocks early links', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260802011341_contract_odoo_tracking_cutover.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /odoo_tracking_start_date/);
  assert.match(migration, /historical_last_payment_amount/);
  assert.match(migration, /historical_last_payment_reference/);
  assert.match(migration, /LOCAL_INVOICE_BEFORE_ODOO_TRACKING/);
  assert.match(migration, /odooTrackingStartDate/);
  assert.match(migration, /create_contract_with_conditions_atomic/);
  assert.match(migration, /link_odoo_import_invoice_atomic/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.link_odoo_import_invoice_atomic/);
});

test('reporting and import services enforce the cutover boundary', async () => {
  const [reporting, importService, adr] = await Promise.all([
    readFile(new URL('../src/lib/services/reporting-service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/odoo/import-service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../docs/adr/2026-08-02-contract-odoo-tracking-cutover.md', import.meta.url), 'utf8'),
  ]);

  assert.match(reporting, /isOdooDocumentBeforeContractCutover/);
  assert.match(reporting, /operationalOdooDocuments/);
  assert.match(importService, /LOCAL_INVOICE_BEFORE_ODOO_TRACKING/);
  assert.match(importService, /isOdooInputBeforeContractTracking/);
  assert.match(importService, /odoo_tracking_start_date/);
  assert.match(adr, /hybrid cutover/i);
});
