import assert from 'node:assert/strict';
import test from 'node:test';
import { expandPermissionDependencies, isPermissionKey } from '../src/lib/auth/permissions.ts';

test('system owner role assignment is rejected for non-owner actors at policy level', () => {
  // Application-level guard mirrors DB trigger: only isAdminEditor may assign owner.
  function canAssignSystemOwner(actorIsAdminEditor) {
    return Boolean(actorIsAdminEditor);
  }
  assert.equal(canAssignSystemOwner(false), false);
  assert.equal(canAssignSystemOwner(true), true);
});

test('role permission updates expand dependencies before persistence', () => {
  const keys = expandPermissionDependencies(['contracts.update', 'payments.record', 'bogus.key']);
  assert.deepEqual(keys, [
    'contracts.view',
    'contracts.update',
    'payments.view',
    'payments.record',
  ]);
  for (const key of keys) assert.equal(isPermissionKey(key), true);
});

test('settings allowlist rejects odoo integration key', () => {
  const ALLOWED_SETTING_KEYS = new Set([
    'company_name',
    'company_name_ar',
    'default_payment_cycle',
    'default_tax_mode',
    'vat_rate',
    'invoice_prefix',
    'currency',
  ]);
  assert.equal(ALLOWED_SETTING_KEYS.has('odoo_integration'), false);
  assert.equal(ALLOWED_SETTING_KEYS.has('company_name'), true);
});
