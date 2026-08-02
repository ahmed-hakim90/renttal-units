import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstDayOfNextReconciliationMonth,
} from '../src/lib/odoo/reconciliation-window.ts';

test('includes only invoice periods through the current Riyadh month', () => {
  assert.equal(
    firstDayOfNextReconciliationMonth(new Date('2026-08-02T00:00:00Z')),
    '2026-09-01',
  );
});

test('uses Riyadh time at the UTC month boundary', () => {
  assert.equal(
    firstDayOfNextReconciliationMonth(new Date('2026-08-31T21:30:00Z')),
    '2026-10-01',
  );
});

test('rolls December into January of the next year', () => {
  assert.equal(
    firstDayOfNextReconciliationMonth(new Date('2026-12-15T12:00:00Z')),
    '2027-01-01',
  );
});
