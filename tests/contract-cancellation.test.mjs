import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729223340_atomic_contract_cancellation.sql', import.meta.url),
  'utf8',
);
const rpcHardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260729224415_secure_contract_cancellation_rpc.sql', import.meta.url),
  'utf8',
);

function inclusiveDays(start, end) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`))
      / 86_400_000,
  ) + 1;
}

function prorate(amount, periodStart, periodEnd, cancellationDate) {
  const totalDays = inclusiveDays(periodStart, periodEnd);
  const usedDays = inclusiveDays(periodStart, cancellationDate);
  return Math.round(amount * usedDays / totalDays * 100) / 100;
}

test('proration includes the cancellation day', () => {
  assert.equal(prorate(3_100, '2026-07-01', '2026-07-31', '2026-07-29'), 2_900);
  assert.equal(prorate(3_100, '2026-07-01', '2026-07-31', '2026-07-01'), 100);
  assert.equal(prorate(3_100, '2026-07-01', '2026-07-31', '2026-07-31'), 3_100);
});

test('contract cancellation is an authorized atomic database operation', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cancel_contract_atomic/);
  assert.match(migration, /public\.has_permission\('contracts\.update'\)/);
  assert.match(migration, /FOR UPDATE;/);
  assert.match(migration, /UPDATE public\.invoice_lines/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cancel_contract_atomic/);
});

test('privileged cancellation implementation is outside the exposed schema', () => {
  assert.match(
    rpcHardeningMigration,
    /ALTER FUNCTION public\.cancel_contract_atomic\(UUID, DATE, TEXT\)\s+SET SCHEMA private/,
  );
  assert.match(rpcHardeningMigration, /SECURITY INVOKER/);
  assert.match(rpcHardeningMigration, /private\.cancel_contract_atomic_impl/);
  assert.doesNotMatch(
    rpcHardeningMigration,
    /CREATE FUNCTION public\.cancel_contract_atomic[\s\S]*?SECURITY DEFINER/,
  );
});

test('issued or paid future invoices require explicit financial settlement', () => {
  assert.match(migration, /CANCELLATION_HAS_ISSUED_INVOICES/);
  assert.match(migration, /paid_amount > 0/);
  assert.match(migration, /odoo_invoice_id IS NOT NULL/);
  assert.match(migration, /CANCELLATION_REQUIRES_SETTLEMENT/);
});
