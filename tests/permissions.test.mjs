import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandPermissionDependencies,
  hasPermission,
  isPermissionKey,
  PERMISSION_KEYS,
  VIEWER_PERMISSION_KEYS,
} from '../src/lib/auth/permissions.ts';

test('permission catalog contains stable unique keys', () => {
  assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
  assert.ok(PERMISSION_KEYS.includes('roles.manage'));
  assert.ok(PERMISSION_KEYS.includes('payments.record'));
});

test('write permissions expand to include matching view permissions', () => {
  const expanded = expandPermissionDependencies(['units.create', 'payments.record']);
  assert.deepEqual(expanded, ['units.view', 'units.create', 'payments.view', 'payments.record']);
});

test('rejects unknown permission keys while expanding', () => {
  const expanded = expandPermissionDependencies(['units.view', 'units.hack', 'not-a-key']);
  assert.deepEqual(expanded, ['units.view']);
});

test('viewer seed permissions are all valid view keys', () => {
  for (const key of VIEWER_PERMISSION_KEYS) {
    assert.equal(isPermissionKey(key), true);
    assert.ok(key.endsWith('.view') || key === 'reports.view');
  }
});

test('hasPermission checks auth permission list', () => {
  const auth = { permissions: ['units.view', 'units.update'] };
  assert.equal(hasPermission(auth, 'units.view'), true);
  assert.equal(hasPermission(auth, 'units.delete'), false);
  assert.equal(hasPermission(null, 'units.view'), false);
});
