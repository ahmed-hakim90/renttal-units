import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('issuing a scheduled invoice preserves its generated number', async () => {
  const [table, recentActivity, action, repository, migration] = await Promise.all([
    readFile(new URL('../src/components/invoices/invoices-table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/recent-activity.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/actions/invoices.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/repositories/invoices.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260730233500_generated_invoice_issue.sql', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(table, /<Input name="invoice_number"/);
  assert.match(table, /issueDueInvoice\(locale, selectedInvoice\.id\)/);
  assert.doesNotMatch(recentActivity, /<Input name="invoice_number"/);
  assert.match(recentActivity, /issueDueInvoice\(locale, selectedInvoice\.id\)/);
  assert.match(action, /issueDueInvoice\(locale: string, invoiceId: string\)/);
  assert.doesNotMatch(repository, /p_invoice_number:/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.issue_due_invoice_atomic\(\s*p_invoice_id UUID\s*\)/);
  assert.match(migration, /SET status = 'invoice_issued'/);
  assert.doesNotMatch(migration, /SET\s+invoice_number\s*=/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.issue_due_invoice_atomic\(UUID, TEXT\) FROM authenticated/);
});
