import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const usersRepository = readFileSync(join(root, 'src/lib/repositories/users.ts'), 'utf8');
const auditRepository = readFileSync(join(root, 'src/lib/repositories/audit-logs.ts'), 'utf8');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260729231917_hide_system_owner_profiles.sql'),
  'utf8',
);

test('user administration list excludes every system-owner profile', () => {
  assert.match(usersRepository, /roles!role_id!inner/);
  assert.match(usersRepository, /\.eq\('assigned_role\.is_system_owner', false\)/);
});

test('profile RLS hides system owners from non-owner managers', () => {
  assert.match(migration, /id = auth\.uid\(\)/);
  assert.match(migration, /role_row\.is_system_owner = TRUE/);
  assert.match(migration, /public\.is_admin_editor\(\)/);
});

test('audit read model redacts and filters protected owner profiles', () => {
  assert.match(auditRepository, /!assignedRole\?\.is_system_owner/);
  assert.match(auditRepository, /findProtectedProfileIds/);
  assert.match(auditRepository, /protectedProfileIds\.includes\(profileId\)/);
});

