import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandPermissionDependencies,
  hasPermission,
  SYSTEM_ROLE_SLUGS,
  VIEWER_PERMISSION_KEYS,
} from '../src/lib/auth/permissions.ts';

test('viewer seed is a strict subset of an expanded admin grant set', () => {
  const adminKeys = expandPermissionDependencies([
    ...VIEWER_PERMISSION_KEYS,
    'units.create',
    'contracts.create',
    'payments.record',
    'roles.manage',
    'users.manage',
  ]);

  for (const key of VIEWER_PERMISSION_KEYS) {
    assert.equal(adminKeys.includes(key), true, key);
  }
});

test('auth without roles.manage cannot pass roles gate helper', () => {
  const viewerAuth = { permissions: [...VIEWER_PERMISSION_KEYS] };
  assert.equal(hasPermission(viewerAuth, 'roles.manage'), false);
  assert.equal(hasPermission(viewerAuth, 'units.view'), true);
});

test('system owner slug stays distinct from viewer', () => {
  assert.notEqual(SYSTEM_ROLE_SLUGS.adminEditor, SYSTEM_ROLE_SLUGS.viewer);
});
