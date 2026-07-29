import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTaxInclusiveAmount } from '../src/lib/rental/tax.ts';

test('extracts 15% VAT from a tax-inclusive contract amount', () => {
  assert.deepEqual(splitTaxInclusiveAmount(115, 15), {
    amountUntaxed: 100,
    amountTax: 15,
    amountTotal: 115,
  });
});

test('preserves the exact inclusive total after currency rounding', () => {
  const result = splitTaxInclusiveAmount(34_206.64, 15);
  assert.equal(result.amountUntaxed, 29_744.9);
  assert.equal(result.amountTax, 4_461.74);
  assert.equal(result.amountUntaxed + result.amountTax, result.amountTotal);
});

test('treats a zero-tax contract amount as untaxed', () => {
  assert.deepEqual(splitTaxInclusiveAmount(500, 0), {
    amountUntaxed: 500,
    amountTax: 0,
    amountTotal: 500,
  });
});
