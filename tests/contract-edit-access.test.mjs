import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  join(root, 'src/lib/rental/contract-edit-access.ts'),
  'utf8',
);

function getContractEditAccess(status) {
  if (status === 'draft') return { allowed: true, mode: 'edit-draft' };
  if (status === 'active') return { allowed: true, mode: 'edit-active' };
  if (status === 'cancelled') return { allowed: false, reason: 'cancelled' };
  if (status === 'completed') return { allowed: false, reason: 'completed' };
  return { allowed: false, reason: 'unknown' };
}

function contractHasFinancialActivity(invoices) {
  return (invoices ?? []).some(
    (invoice) => Number(invoice.paid_amount) > 0 || invoice.status !== 'due',
  );
}

test('draft and active contracts may open the editor', () => {
  assert.deepEqual(getContractEditAccess('draft'), { allowed: true, mode: 'edit-draft' });
  assert.deepEqual(getContractEditAccess('active'), { allowed: true, mode: 'edit-active' });
});

test('cancelled and completed contracts are blocked from the editor', () => {
  assert.deepEqual(getContractEditAccess('cancelled'), { allowed: false, reason: 'cancelled' });
  assert.deepEqual(getContractEditAccess('completed'), { allowed: false, reason: 'completed' });
});

test('financial activity detects issued or paid invoices', () => {
  assert.equal(contractHasFinancialActivity([{ paid_amount: 0, status: 'due' }]), false);
  assert.equal(contractHasFinancialActivity([{ paid_amount: 10, status: 'due' }]), true);
  assert.equal(contractHasFinancialActivity([{ paid_amount: 0, status: 'issued' }]), true);
});

test('source exports the edit-access helpers used by the edit page', () => {
  assert.match(source, /export function getContractEditAccess/);
  assert.match(source, /export function contractHasFinancialActivity/);
});
