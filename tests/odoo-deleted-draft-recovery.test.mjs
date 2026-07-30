import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  new URL('../src/lib/odoo/service.ts', import.meta.url),
  'utf8',
);

test('recreates or relinks an Odoo draft when its stored record was deleted', () => {
  assert.match(service, /async function findOrCreateDraft\(\)/);
  assert.match(
    service,
    /const current = await getInvoiceState\(client, invoice\.odoo_invoice_id\);[\s\S]*?if \(!current\) \{\s*return findOrCreateDraft\(\);/,
  );
  assert.match(
    service,
    /findOrCreateDraft[\s\S]*?searchRead\('account\.move',[\s\S]*?\['ref', '=', getInvoiceRef\(invoice\)\][\s\S]*?client\.create\('account\.move', values\)/,
  );
});
