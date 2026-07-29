import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOdooCategoryDomain } from '../src/lib/odoo/category-domain.ts';

test('builds one category filter without an OR operator', () => {
  assert.deepEqual(buildOdooCategoryDomain([6]), [
    ['categ_id', 'child_of', 6],
  ]);
});

test('combines multiple category trees with Odoo prefix OR operators', () => {
  assert.deepEqual(buildOdooCategoryDomain([6, 70]), [
    '|',
    ['categ_id', 'child_of', 6],
    ['categ_id', 'child_of', 70],
  ]);
});

test('removes duplicate and invalid category IDs', () => {
  assert.deepEqual(buildOdooCategoryDomain([6, 70, 6, 0, -1]), [
    '|',
    ['categ_id', 'child_of', 6],
    ['categ_id', 'child_of', 70],
  ]);
});
