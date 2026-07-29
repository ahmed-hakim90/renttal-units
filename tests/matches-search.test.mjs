import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSearch } from '../src/lib/search/matches-search.ts';

test('matches Arabic and English text without case sensitivity', () => {
  assert.equal(matchesSearch('plaza', ['Tal Plaza']), true);
  assert.equal(matchesSearch('الرياض', ['شارع العليا، الرياض']), true);
});

test('matches numeric business data and ignores missing values', () => {
  assert.equal(matchesSearch('10162', [null, undefined, 10162]), true);
  assert.equal(matchesSearch('999', [null, 'Unit 101']), false);
});

test('an empty search keeps all records visible', () => {
  assert.equal(matchesSearch('   ', []), true);
});
