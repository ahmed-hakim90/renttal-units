import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUniqueViolation,
  readUniqueViolationConstraint,
} from '../src/lib/db/postgres-errors.ts';

test('reads the constraint from a Supabase unique-violation error', () => {
  const error = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "units_location_id_unit_number_key"',
  };

  assert.equal(isUniqueViolation(error), true);
  assert.equal(
    readUniqueViolationConstraint(error),
    'units_location_id_unit_number_key',
  );
});

test('does not classify other database errors as unique violations', () => {
  const error = {
    code: '23503',
    message: 'insert or update violates a foreign key constraint',
  };

  assert.equal(isUniqueViolation(error), false);
  assert.equal(readUniqueViolationConstraint(error), undefined);
});
