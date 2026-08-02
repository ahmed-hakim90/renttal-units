import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadMessages(locale) {
  return JSON.parse(readFileSync(join(root, `src/messages/${locale}/contracts.json`), 'utf8'));
}

describe('contract tax header labels', () => {
  it('keeps inclusive tax copy without empty parentheses', () => {
    const en = loadMessages('en');
    const ar = loadMessages('ar');

    assert.match(en.lineAmount, /incl\. tax/i);
    assert.match(en.totalAmount, /incl\. tax/i);
    assert.doesNotMatch(en.lineAmount, /\(\s*\)/);
    assert.doesNotMatch(en.totalAmount, /\(\s*\)/);

    assert.match(ar.lineAmount, /شامل/);
    assert.match(ar.totalAmount, /شاملة/);

    assert.match(en.lineAmountWithTax, /\{tax\}/);
    assert.match(en.totalAmountWithTax, /\{tax\}/);
    assert.match(en.headerTaxBreakdown, /\{untaxed\}/);
    assert.match(en.headerTaxBreakdown, /\{tax\}/);
    assert.match(ar.lineAmountWithTax, /\{tax\}/);
    assert.match(ar.totalAmountWithTax, /\{tax\}/);
    assert.match(ar.headerTaxBreakdown, /\{untaxed\}/);
  });

  it('shows selected tax in the contract editor sticky header', () => {
    const source = readFileSync(join(root, 'src/components/contracts/contract-editor.tsx'), 'utf8');
    assert.match(source, /totalAmountWithTax/);
    assert.match(source, /annualAmountUntaxedWithTax/);
    assert.match(source, /headerTaxBreakdown/);
    assert.match(source, /preview\.totalUntaxed/);
    assert.match(source, /selectedTaxLabel/);
  });

  it('renders independent desktop and mobile tax selectors for each line', () => {
    const source = readFileSync(join(root, 'src/components/contracts/contract-editor.tsx'), 'utf8');
    const linesSection = source.indexOf("<SheetSection title={t('linesSection')}>");
    const desktopTaxSelector = source.indexOf('name={`tax-${line.key}`}', linesSection);
    const desktopLinesFooter = source.indexOf('</tfoot>', linesSection);
    const mobileTaxSelector = source.indexOf('name={`tax-m-${line.key}`}', desktopLinesFooter);
    const linesSectionEnd = source.indexOf('</SheetSection>', mobileTaxSelector);

    assert.ok(linesSection >= 0);
    assert.ok(desktopTaxSelector > linesSection && desktopTaxSelector < desktopLinesFooter);
    assert.ok(mobileTaxSelector > desktopLinesFooter && mobileTaxSelector < linesSectionEnd);
    assert.doesNotMatch(source, /name="tax_selection(_mobile)?"/);
  });
});
