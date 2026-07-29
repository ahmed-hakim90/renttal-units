import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNumberInputValue,
  formatNumberParts,
  normalizeArabicDigits,
  normalizeNumberInputValue,
} from '../src/lib/i18n/numbers.ts';

test('uses a dot as the thousands separator for English and Arabic digits', () => {
  assert.equal(
    formatNumberParts(new Intl.NumberFormat('en-SA').formatToParts(100_000)),
    '100.000',
  );
  assert.equal(
    formatNumberParts(new Intl.NumberFormat('ar-SA').formatToParts(100_000)),
    '١٠٠.٠٠٠',
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
  assert.equal(normalizeNumberInputValue('100.000'), '100000');
});

test('groups canonical form values while keeping decimals editable', () => {
  assert.equal(formatNumberInputValue('100000.25'), '100.000,25');
  assert.equal(formatNumberInputValue('100.'), '100,');
  assert.equal(formatNumberInputValue(''), '');
});
