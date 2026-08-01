import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('contract detail previews the activation schedule for drafts without invoices', () => {
  const detail = read('src/components/contracts/contract-detail.tsx');

  assert.match(detail, /contract\.status !== 'draft'/);
  assert.match(detail, /calculateContractBillingSchedule\(\{/);
  assert.match(detail, /applyOpeningBalanceToSchedule\(/);
  assert.match(detail, /const projectedSchedule = invoices\.length === 0/);
  assert.match(detail, /draftScheduleHint/);
});

test('contract detail uses compact cards and payment schedule rows', () => {
  const detail = read('src/components/contracts/contract-detail.tsx');

  assert.match(detail, /<PageHeader\s+compact/);
  assert.match(detail, /<Card className="p-3 sm:p-4">/);
  assert.match(detail, /formatDate\(row\.periodStart, loc\).*formatDate\(row\.periodEnd, loc\)/s);
  assert.match(read('src/messages/en/contracts.json'), /"plannedInvoiceCount":/);
  assert.match(read('src/messages/ar/contracts.json'), /"draftScheduleHint":/);
});
