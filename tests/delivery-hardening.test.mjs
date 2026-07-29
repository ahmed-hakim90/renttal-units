import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260729224245_delivery_hardening.sql'),
  'utf8',
);

test('delivery hardening migration preserves local invoice status on Odoo draft', () => {
  assert.match(migration, /WHEN v_document\.move_state = 'draft' THEN status/);
  assert.match(migration, /WHEN v_document\.move_state = 'posted' AND v_document\.amount_total > 0/);
  assert.doesNotMatch(migration, /WHEN v_document\.move_state = 'draft' THEN 'due'::invoice_status/);
});

test('delivery hardening migration scopes contract document storage by attachment path', () => {
  assert.match(migration, /contract_documents_select/);
  assert.match(migration, /FROM public\.contract_attachments ca/);
  assert.match(migration, /ca\.storage_path = name/);
});

test('delivery hardening migration blocks non-owner system-owner assignment', () => {
  assert.match(migration, /prevent_system_owner_assignment/);
  assert.match(migration, /SYSTEM_OWNER_ASSIGNMENT_FORBIDDEN/);
});

test('delivery hardening migration provides atomic role permission replacement', () => {
  assert.match(migration, /replace_role_permissions/);
  assert.match(migration, /DELETE FROM public\.role_permissions WHERE role_id = p_role_id/);
});

test('delivery hardening migration claims outbox with SKIP LOCKED and max attempts', () => {
  assert.match(migration, /claim_odoo_outbox_batch/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /attempts < 8/);
});
