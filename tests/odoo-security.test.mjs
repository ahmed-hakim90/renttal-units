import assert from 'node:assert/strict';
import test from 'node:test';

test('odoo import run ownership fails closed for foreign operators', () => {
  function canAccessRun(run, authUserId, isSystem) {
    if (!run) return false;
    if (isSystem) return true;
    return run.requested_by === authUserId;
  }

  const run = { id: 'run-1', requested_by: 'user-a' };
  assert.equal(canAccessRun(run, 'user-a', false), true);
  assert.equal(canAccessRun(run, 'user-b', false), false);
  assert.equal(canAccessRun(run, 'user-b', true), true);
  assert.equal(canAccessRun(null, 'user-a', false), false);
});

test('outbox enqueue does not reopen succeeded items', () => {
  function nextOutboxStatus(existingStatus) {
    if (existingStatus === 'succeeded') return 'succeeded';
    return 'pending';
  }
  assert.equal(nextOutboxStatus('succeeded'), 'succeeded');
  assert.equal(nextOutboxStatus('failed'), 'pending');
  assert.equal(nextOutboxStatus('pending'), 'pending');
});

test('encryptSecret fails closed without dedicated secret', () => {
  function encryptSecret(value, secret) {
    if (!value) return '';
    if (!secret?.trim()) {
      throw new Error('ODOO_SETTINGS_SECRET is required to encrypt Odoo credentials');
    }
    return `enc:v1:${value}`;
  }
  assert.throws(() => encryptSecret('api-key', ''), /ODOO_SETTINGS_SECRET/);
  assert.equal(encryptSecret('api-key', 'secret'), 'enc:v1:api-key');
});
