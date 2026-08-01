import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('dashboard page validates locationId and threads it through loaders', () => {
  const page = read('src/app/[locale]/(dashboard)/dashboard/page.tsx');
  assert.match(page, /searchParams: Promise<\{ locationId\?: string \}>/);
  assert.match(page, /locations\.some\(\(location\) => location\.id === rawLocationId\)/);
  assert.match(page, /getDashboardStats\(locale, locationFilter\)/);
  assert.match(page, /getDashboardOverview\(locale, locationFilter\)/);
  assert.match(page, /getDashboardDebtAging\(locale, locationFilter\)/);
  assert.match(page, /getOverdueInvoices\(locale, locationFilter\)/);
  assert.match(page, /getDueThisMonth\(locale, locationFilter\)/);
  assert.match(page, /DashboardLocationFilter/);
});

test('dashboard overview scopes contracts by rental lines in the selected location', () => {
  const reporting = read('src/lib/services/reporting-service.ts');
  assert.match(reporting, /function contractTouchesUnitIds/);
  assert.match(reporting, /line_type === 'rental'/);
  assert.match(reporting, /filters\?: \{ locationId\?: string \}/);
});

test('invoice repository dashboard queries accept location filters', () => {
  const invoices = read('src/lib/repositories/invoices.ts');
  assert.match(invoices, /function filterInvoicesByLocation/);
  assert.match(invoices, /countByStatus\([\s\S]*filters\?: \{ locationId\?: string \}/);
  assert.match(invoices, /findOutstanding\(ctx: LogContext, filters\?: \{ locationId\?: string \}/);
});
