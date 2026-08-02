import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countContractsExpiringSoon,
  isContractExpiringSoon,
} from '../src/lib/rental/contract-expiry.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asOfDate = new Date('2026-07-30T12:00:00Z');

test('counts active contracts ending from today through the next 30 days', () => {
  const count = countContractsExpiringSoon([
    { status: 'active', end_date: '2026-07-30' },
    { status: 'active', end_date: '2026-08-15' },
    { status: 'active', end_date: '2026-08-29' },
  ], asOfDate);

  assert.equal(count, 3);
});

test('excludes expired, later, non-active, and undated contracts', () => {
  const count = countContractsExpiringSoon([
    { status: 'active', end_date: '2026-07-29' },
    { status: 'active', end_date: '2026-08-30' },
    { status: 'completed', end_date: '2026-08-01' },
    { status: 'cancelled', end_date: '2026-08-10' },
    { status: 'draft', end_date: '2026-08-20' },
    { status: 'active', end_date: null },
  ], asOfDate);

  assert.equal(count, 0);
});

test('isContractExpiringSoon matches count helper membership', () => {
  assert.equal(isContractExpiringSoon({ status: 'active', end_date: '2026-08-15' }, asOfDate), true);
  assert.equal(isContractExpiringSoon({ status: 'active', end_date: '2026-08-30' }, asOfDate), false);
});

test('portfolio summary and notifications deep-link expiring contracts', () => {
  const portfolio = readFileSync(
    join(root, 'src/components/dashboard/portfolio-summary.tsx'),
    'utf8',
  );
  const guards = readFileSync(join(root, 'src/lib/notifications/guards.ts'), 'utf8');
  assert.match(portfolio, /\/contracts\?expiring=30/);
  assert.match(guards, /\/contracts\?expiring=30/);
});
