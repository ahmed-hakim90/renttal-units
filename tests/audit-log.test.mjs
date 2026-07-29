import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuditChanges } from '../src/lib/audit/format-audit-log.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adminActions = readFileSync(join(root, 'src/lib/actions/admin.ts'), 'utf8');
const auditActions = readFileSync(join(root, 'src/lib/actions/audit.ts'), 'utf8');

function auditLog(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: null,
    action: 'update',
    entity_type: 'profile',
    entity_id: '00000000-0000-4000-8000-000000000002',
    old_values: null,
    new_values: null,
    created_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

test('audit formatter renders safe primitive changes and omits secrets', () => {
  const changes = buildAuditChanges(auditLog({
    old_values: { email: 'old@example.com', api_secret: 'old-secret', nested: { raw: true } },
    new_values: { email: 'new@example.com', api_secret: 'new-secret', nested: { raw: false } },
  }));

  assert.deepEqual(changes, [{
    field: 'email',
    old_value: 'old@example.com',
    new_value: 'new@example.com',
  }]);
});

test('password reset audit never contains the password value', () => {
  assert.match(adminActions, /'reset_user_password'/);
  assert.match(adminActions, /\{ password_changed: true \}/);
  assert.doesNotMatch(adminActions, /'reset_user_password'[\s\S]{0,300}\{ password \}/);
});

test('sensitive user changes protect system-owner accounts', () => {
  const ownerGuards = adminActions.match(
    /target\.assigned_role\?\.is_system_owner && !auth\.isAdminEditor/g,
  ) ?? [];
  assert.equal(ownerGuards.length, 3);
});

test('audit reads require the dedicated audit permission', () => {
  const permissionChecks = auditActions.match(
    /requirePermission\(locale, 'audit\.view', ctx\)/g,
  ) ?? [];
  assert.equal(permissionChecks.length, 2);
});

