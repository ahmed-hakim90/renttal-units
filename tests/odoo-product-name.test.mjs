import assert from 'node:assert/strict';
import test from 'node:test';
import { getOdooProductName } from '../src/lib/odoo/product-name.ts';

test('uses the exact Odoo product name for the local unit name', () => {
  assert.equal(
    getOdooProductName({
      id: 9049,
      name: 'Latira Plaza - Show Room Large No.001 لاتيرا بلازا - معرض كبير رقم 001',
      display_name: '[10107] Latira Plaza - Show Room Large No.001 لاتيرا بلازا - معرض كبير رقم 001',
    }),
    'Latira Plaza - Show Room Large No.001 لاتيرا بلازا - معرض كبير رقم 001',
  );
});

test('falls back to the Odoo display name when name is unavailable', () => {
  assert.equal(
    getOdooProductName({ id: 9049, display_name: '[10107] Latira Plaza' }),
    '[10107] Latira Plaza',
  );
});
