import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260802013000_harden_security_definer_exposure.sql'),
  'utf8',
);

test('SQL-internal SECURITY DEFINER functions are not authenticated RPCs', () => {
  for (const functionName of [
    'create_contract_with_schedule_atomic',
    'save_contract_draft_atomic',
    'activate_contract_draft_atomic',
    'get_user_role',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\)\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
  }
});

test('internal contract implementations remain callable by trusted wrappers', () => {
  for (const functionName of [
    'create_contract_with_schedule_atomic',
    'save_contract_draft_atomic',
    'activate_contract_draft_atomic',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\) TO service_role`,
      ),
    );
  }

  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_user_role\(\) TO service_role/,
  );
});
