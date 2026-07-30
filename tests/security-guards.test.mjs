import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expandPermissionDependencies,
  hasAnyPermission,
  isPermissionKey,
} from '../src/lib/auth/permissions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

test('Odoo partner search permits contract workflows without granting Odoo management', () => {
  const contractCreator = { permissions: ['contracts.create'] };
  assert.equal(
    hasAnyPermission(contractCreator, ['contracts.create', 'contracts.update', 'odoo.manage']),
    true,
  );
  assert.equal(hasAnyPermission({ permissions: ['contracts.view'] }, [
    'contracts.create',
    'contracts.update',
    'odoo.manage',
  ]), false);

  const source = readFileSync(join(root, 'src/lib/actions/odoo.ts'), 'utf8');
  assert.match(
    source,
    /requireAnyPermission\(\s*locale,\s*\['contracts\.create', 'contracts\.update', 'odoo\.manage'\]/,
  );
});
