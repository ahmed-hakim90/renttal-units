import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStaffPasswordChecks,
  validateStaffPassword,
} from '../src/lib/validation/password-policy.ts';

test('password checklist reports each requirement independently', () => {
  assert.deepEqual(getStaffPasswordChecks('short'), {
    minLength: false,
    uppercase: false,
    lowercase: true,
    number: false,
  });
  assert.deepEqual(getStaffPasswordChecks('ValidPassword1'), {
    minLength: true,
    uppercase: true,
    lowercase: true,
    number: true,
  });
});

test('password validator and checklist share the same policy', () => {
  assert.equal(validateStaffPassword('ValidPassword1'), null);
  assert.equal(validateStaffPassword('invalidpassword'), 'password_policy');
});

