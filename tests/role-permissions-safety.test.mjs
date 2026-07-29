import assert from 'node:assert/strict';
import test from 'node:test';
import { expandPermissionDependencies, SYSTEM_ROLE_SLUGS } from '../src/lib/auth/permissions.ts';

test('system role slugs remain stable for backfill compatibility', () => {
  assert.equal(SYSTEM_ROLE_SLUGS.adminEditor, 'admin_editor');
  assert.equal(SYSTEM_ROLE_SLUGS.viewer, 'viewer');
});

test('role permission payload cannot escalate via unknown keys', () => {
  const result = expandPermissionDependencies([
    'roles.manage',
    'users.manage',
    'roles.escalate',
    'admin_editor',
  ]);
  assert.deepEqual(result, ['users.manage', 'roles.manage']);
  assert.equal(result.includes('roles.escalate'), false);
});
