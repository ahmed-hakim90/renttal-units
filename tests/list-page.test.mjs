import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listPageRange,
  parseListPage,
  parseListPageSize,
  toListPageResult,
} from '../src/lib/pagination/list-page.ts';

test('parseListPage defaults invalid values to 1', () => {
  assert.equal(parseListPage(undefined), 1);
  assert.equal(parseListPage('0'), 1);
  assert.equal(parseListPage('abc'), 1);
  assert.equal(parseListPage('3'), 3);
});

test('parseListPageSize clamps to max', () => {
  assert.equal(parseListPageSize('200'), 100);
  assert.equal(parseListPageSize('10'), 10);
});

test('listPageRange builds inclusive supabase ranges', () => {
  assert.deepEqual(listPageRange(2, 50), { from: 50, to: 99, page: 2, pageSize: 50 });
});

test('toListPageResult computes total pages', () => {
  const result = toListPageResult(['a', 'b'], 120, 1, 50);
  assert.equal(result.totalPages, 3);
  assert.equal(result.total, 120);
});
