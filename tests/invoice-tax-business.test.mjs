import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTaxInclusiveAmount } from '../src/lib/rental/tax.ts';

test('tax-inclusive split keeps total stable at 15%', () => {
  const split = splitTaxInclusiveAmount(115, 15);
  assert.equal(split.amountTotal, 115);
  assert.equal(Number((split.amountUntaxed + split.amountTax).toFixed(2)), 115);
  assert.ok(split.amountTax > 0);
});

test('non-taxable mode yields zero tax', () => {
  const split = splitTaxInclusiveAmount(100, 0);
  assert.equal(split.amountUntaxed, 100);
  assert.equal(split.amountTax, 0);
  assert.equal(split.amountTotal, 100);
});
