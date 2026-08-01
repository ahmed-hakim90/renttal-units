import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isOdooInvoiceSendVisibleStatus,
  ODOO_INVOICE_SEND_VISIBLE_STATUSES,
} from '../src/lib/odoo/invoice-send-settings.ts';

test('invoice send visible status allowlists only local invoice statuses', () => {
  assert.deepEqual([...ODOO_INVOICE_SEND_VISIBLE_STATUSES], [
    'due',
    'invoice_issued',
    'partially_paid',
    'fully_paid',
    'overdue',
  ]);
  assert.equal(isOdooInvoiceSendVisibleStatus('invoice_issued'), true);
  assert.equal(isOdooInvoiceSendVisibleStatus('posted'), false);
  assert.equal(isOdooInvoiceSendVisibleStatus(''), false);
  assert.equal(isOdooInvoiceSendVisibleStatus(null), false);
});

test('issuing a due invoice no longer auto-sends to Odoo', () => {
  const invoiceService = readFileSync(new URL('../src/lib/services/invoice-service.ts', import.meta.url), 'utf8');
  assert.match(invoiceService, /Odoo draft creation is intentionally manual/);
  assert.doesNotMatch(invoiceService, /enqueueAndProcessInvoice/);
  assert.doesNotMatch(invoiceService, /shouldSyncIssuedInvoiceToOdoo|shouldAllowManualOdooInvoiceSend/);
});

test('manual send and status-check actions enforce auth flags and safe errors', () => {
  const actions = readFileSync(new URL('../src/lib/actions/odoo.ts', import.meta.url), 'utf8');

  assert.match(actions, /export async function sendInvoiceToOdoo/);
  assert.match(actions, /export async function checkOdooInvoiceStatus/);
  assert.match(actions, /requirePermission\(locale, 'odoo\.manage'/);
  assert.match(actions, /shouldAllowManualOdooInvoiceSend/);
  assert.match(actions, /odoo_invoice_manual_send/);
  assert.match(actions, /invoiceSendVisibleStatus/);
  assert.match(actions, /odooSendStageMismatch/);
  assert.match(actions, /invoiceIdSchema/);
  assert.match(actions, /SAFE_ODOO_SEND_ERRORS/);
  assert.match(actions, /sanitizeOdooActionError/);
  assert.match(actions, /odooService\.checkInvoiceStatus/);
});

test('status check uses searchRead and syncs local invoice from Odoo', () => {
  const service = readFileSync(new URL('../src/lib/odoo/service.ts', import.meta.url), 'utf8');
  assert.match(service, /async checkInvoiceStatus\(/);
  assert.match(service, /check_invoice_status/);
  assert.match(service, /odooInvoiceNotFound/);
  assert.match(service, /invoicesRepository\.syncFromOdoo/);
  assert.match(service, /searchRead\(\s*'account\.move'/);
});

test('invoice table gates send and status buttons by permission and stage', () => {
  const table = readFileSync(new URL('../src/components/invoices/invoices-table.tsx', import.meta.url), 'utf8');
  assert.match(table, /shouldShowOdooInvoiceSendButton/);
  assert.match(table, /shouldShowOdooInvoiceStatusCheckButton/);
  assert.match(table, /sendInvoiceToOdoo/);
  assert.match(table, /checkOdooInvoiceStatus/);
  assert.match(table, /canManageOdoo/);
  assert.match(table, /showOdooManualSend/);
  assert.match(table, /invoiceSendVisibleStatus/);
  assert.match(table, /if \(isOdooManagedInvoice\(inv\)\) return null/);
  assert.match(table, /title=\{t\('syncOdoo'\)\}/);
  assert.doesNotMatch(table, /retryOdooInvoiceSync/);
});

test('odoo settings persist invoice send visible status', () => {
  const settings = readFileSync(new URL('../src/lib/odoo/settings.ts', import.meta.url), 'utf8');
  const form = readFileSync(new URL('../src/components/settings/settings-form.tsx', import.meta.url), 'utf8');
  assert.match(settings, /invoiceSendVisibleStatus/);
  assert.match(settings, /isOdooInvoiceSendVisibleStatus/);
  assert.match(form, /invoiceSendVisibleStatus/);
  assert.match(form, /odooInvoiceSendVisibleStatus/);
});
