import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPaginated } from '../src/lib/odoo/pagination.ts';

test('loads every page and preserves order', async () => {
  const source = Array.from({ length: 77 }, (_, index) => ({ id: index + 1 }));
  const requests = [];
  const rows = await collectPaginated(async (offset, limit) => {
    requests.push({ offset, limit });
    return source.slice(offset, offset + limit);
  }, { pageSize: 25, maxRecords: 500 });

  assert.equal(rows.length, 77);
  assert.deepEqual(rows.map((row) => row.id), source.map((row) => row.id));
  assert.deepEqual(requests, [
    { offset: 0, limit: 25 },
    { offset: 25, limit: 25 },
    { offset: 50, limit: 25 },
    { offset: 75, limit: 25 },
  ]);
});

test('stops exactly at maxRecords', async () => {
  const rows = await collectPaginated(async (offset, limit) => (
    Array.from({ length: limit }, (_, index) => offset + index)
  ), { pageSize: 30, maxRecords: 65 });

  assert.equal(rows.length, 65);
  assert.equal(rows[64], 64);
});

test('propagates network errors instead of returning an empty list', async () => {
  await assert.rejects(
    collectPaginated(async () => {
      throw new Error('network disconnected');
    }),
    /network disconnected/,
  );
});
