import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardDebtAgingSummary } from '../src/lib/rental/aging.ts';

function makeInvoice({
  amount,
  paid = 0,
  dueDate,
  status = 'invoice_issued',
}) {
  return {
    id: `${dueDate}-${amount}`,
    invoice_number: null,
    unit_id: 'unit-1',
    contract_id: null,
    period_start: dueDate,
    period_end: dueDate,
    amount,
    paid_amount: paid,
    due_date: dueDate,
    status,
    issued_at: null,
    notes: null,
    odoo_invoice_id: null,
    odoo_invoice_name: null,
    odoo_invoice_state: null,
    odoo_sync_status: 'not_synced',
    odoo_synced_at: null,
    odoo_sync_error: null,
    created_at: `${dueDate}T00:00:00Z`,
    updated_at: `${dueDate}T00:00:00Z`,
  };
}

test('dashboard debt aging summary totals overdue buckets only', () => {
  const asOf = new Date('2026-07-30T12:00:00Z');
  const summary = buildDashboardDebtAgingSummary([
    makeInvoice({ amount: 1000, dueDate: '2026-07-30' }), // current
    makeInvoice({ amount: 200, dueDate: '2026-07-15' }), // 1-30
    makeInvoice({ amount: 300, paid: 50, dueDate: '2026-06-15' }), // 31-60
    makeInvoice({ amount: 400, dueDate: '2026-05-15' }), // 61-90
    makeInvoice({ amount: 500, dueDate: '2026-03-01' }), // over90
  ], asOf);

  assert.equal(summary.totalOutstanding, 1000 + 200 + 250 + 400 + 500);
  assert.equal(summary.days1to30.count, 1);
  assert.equal(summary.days1to30.totalAmount, 200);
  assert.equal(summary.days31to60.count, 1);
  assert.equal(summary.days31to60.totalAmount, 250);
  assert.equal(summary.days61to90.count, 1);
  assert.equal(summary.days61to90.totalAmount, 400);
  assert.equal(summary.over90.count, 1);
  assert.equal(summary.over90.totalAmount, 500);
});

test('dashboard debt aging ignores fully paid invoices', () => {
  const asOf = new Date('2026-07-30T12:00:00Z');
  const summary = buildDashboardDebtAgingSummary([
    makeInvoice({ amount: 500, paid: 500, dueDate: '2026-01-01' }),
  ], asOf);

  assert.equal(summary.totalOutstanding, 0);
  assert.equal(summary.over90.count, 0);
  assert.equal(summary.over90.totalAmount, 0);
});
