import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNumberInputValue,
  formatNumberParts,
  normalizeArabicDigits,
  normalizeNumberInputValue,
} from '../src/lib/i18n/numbers.ts';

test('uses commas for groups and a dot for decimals outside inputs', () => {
  assert.equal(
    formatNumberParts(new Intl.NumberFormat('en-SA', {
      minimumFractionDigits: 2,
    }).formatToParts(100_000.2)),
    '100,000.20',
  );
  assert.equal(
    formatNumberParts(new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 2,
    }).formatToParts(100_000.2)),
    '١٠٠,٠٠٠.٢٠',
  );
});

test('normalizes Arabic-Indic and Eastern Arabic digits to ASCII', () => {
  assert.equal(normalizeArabicDigits('١٢٣٤٥٦٧٨٩٠'), '1234567890');
  assert.equal(normalizeArabicDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
});

test('normalizes localized numeric input without changing its numeric value', () => {
  assert.equal(normalizeNumberInputValue('١٢٣٬٤٥٦٫٧٥'), '123456.75');
  assert.equal(normalizeNumberInputValue('۱۲۳.۴۵۶,۷۵'), '123456.75');
  assert.equal(normalizeNumberInputValue('28,500.00'), '28500.00');
  assert.equal(normalizeNumberInputValue('28,500'), '28500');
  assert.equal(normalizeNumberInputValue('100.000'), '100.000');
});

test('keeps input values ungrouped so a dot is always an editable decimal', () => {
  assert.equal(formatNumberInputValue('100000.25'), '100000.25');
  assert.equal(formatNumberInputValue('100.'), '100.');
  assert.equal(
    formatNumberInputValue(normalizeNumberInputValue('1000000000.٢٠')),
    '1000000000.20',
  );
  assert.equal(formatNumberInputValue(''), '');
});
