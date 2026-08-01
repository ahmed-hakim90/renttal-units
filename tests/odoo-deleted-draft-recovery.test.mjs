import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  new URL('../src/lib/odoo/service.ts', import.meta.url),
  'utf8',
);

test('recreates or relinks an Odoo draft when the user sends a deleted invoice again', () => {
  assert.match(
    service,
    /async function getInvoiceState[\s\S]*?client\.searchRead\(\s*'account\.move',\s*\[\['id', '=', id\]\][\s\S]*?return rows\[0\] \?\? null;/,
  );
  assert.doesNotMatch(
    service,
    /async function getInvoiceState[\s\S]*?client\.read\('account\.move', \[id\]/,
  );
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

test('records deletion during linked invoice status synchronization', () => {
  assert.match(
    service,
    /syncLinkedInvoices[\s\S]*?if \(!record\)[\s\S]*?odoo_sync_error: 'odooInvoiceNotFound'/,
  );
});
