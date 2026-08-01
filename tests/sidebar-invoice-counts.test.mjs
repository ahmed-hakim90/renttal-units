import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('sidebar shows server-loaded invoice counts for every invoice status page', () => {
  const sidebar = read('src/components/layout/sidebar.tsx');
  for (const route of ['/due-this-month', '/invoices', '/partial-payments', '/fully-paid']) {
    assert.match(sidebar, new RegExp(`case '${route}'`));
  }
  assert.match(sidebar, /invoiceCount != null && invoiceCount > 0/);
  assert.match(sidebar, /format\.number\(invoiceCount\)/);
});

test('dashboard layout loads authorized status counts and passes them to the shell', () => {
  const layout = read('src/app/[locale]/(dashboard)/layout.tsx');
  const service = read('src/lib/services/invoice-service.ts');

  assert.match(layout, /hasPermission\(session, 'invoices\.view'\)/);
  assert.match(layout, /invoiceService\.getNavigationCounts/);
  assert.match(layout, /invoiceNavigationCounts=\{invoiceNavigationCounts\}/);
  assert.match(service, /if \(!hasPermission\(auth, 'invoices\.view'\)\)/);
  assert.match(service, /countByStatus\('invoice_issued'/);
  assert.match(service, /countByStatus\('partially_paid'/);
  assert.match(service, /countByStatus\('fully_paid'/);
});

test('invoice count accessibility labels stay localized in English and Arabic', () => {
  const en = JSON.parse(read('src/messages/en/common.json'));
  const ar = JSON.parse(read('src/messages/ar/common.json'));

  assert.equal(typeof en.nav.invoiceCount, 'string');
  assert.equal(typeof ar.nav.invoiceCount, 'string');
  assert.match(en.nav.invoiceCount, /\{page\}.*\{count\}/);
  assert.match(ar.nav.invoiceCount, /\{page\}.*\{count\}/);
});
