import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDashboardDueBuckets,
  getDashboardDueDateRange,
  parseDashboardDueHorizons,
} from '../src/lib/rental/dashboard-due-buckets.ts';

const asOfDate = new Date('2026-07-30T12:00:00Z');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('uses safe defaults for missing or invalid dashboard horizons', () => {
  assert.deepEqual(parseDashboardDueHorizons(undefined), [3, 7, 15]);
  assert.deepEqual(parseDashboardDueHorizons([7, 3, 15]), [3, 7, 15]);
  assert.deepEqual(parseDashboardDueHorizons([3, 7, 91]), [3, 7, 15]);
  assert.deepEqual(parseDashboardDueHorizons([2, 8, 20]), [2, 8, 20]);
});

test('builds non-overlapping due buckets at every boundary', () => {
  const buckets = buildDashboardDueBuckets([
    { due_date: '2026-07-30', amount: 100, paid_amount: 0 },
    { due_date: '2026-08-02', amount: 200, paid_amount: 20 },
    { due_date: '2026-08-03', amount: 300, paid_amount: 0 },
    { due_date: '2026-08-06', amount: 400, paid_amount: 0 },
    { due_date: '2026-08-07', amount: 500, paid_amount: 0 },
    { due_date: '2026-08-14', amount: 600, paid_amount: 0 },
    { due_date: '2026-08-15', amount: 700, paid_amount: 0 },
    { due_date: '2026-07-29', amount: 800, paid_amount: 0 },
  ], [3, 7, 15], asOfDate);

  assert.deepEqual(buckets, [
    { fromDay: 0, toDay: 3, count: 2, amount: 280 },
    { fromDay: 4, toDay: 7, count: 2, amount: 700 },
    { fromDay: 8, toDay: 15, count: 2, amount: 1100 },
  ]);
});

test('creates an inclusive repository date range through the largest horizon', () => {
  assert.deepEqual(getDashboardDueDateRange(15, asOfDate), {
    startDate: '2026-07-30',
    endDate: '2026-08-14',
  });
});

test('wires validated settings and permission-gated due cards into the dashboard', () => {
  const settingsForm = read('src/components/settings/settings-form.tsx');
  const adminActions = read('src/lib/actions/admin.ts');
  const invoiceService = read('src/lib/services/invoice-service.ts');
  const portfolioSummary = read('src/components/dashboard/portfolio-summary.tsx');

  assert.match(settingsForm, /updateSetting\(locale, 'dashboard_due_horizons', dashboardHorizons\)/);
  assert.match(adminActions, /key === 'dashboard_due_horizons'/);
  assert.match(adminActions, /requirePermission\(locale, 'settings\.manage'/);
  assert.match(invoiceService, /hasPermission\(auth, 'invoices\.view'\)/);
  assert.match(portfolioSummary, /dueBuckets\.map/);
  assert.doesNotMatch(portfolioSummary, /key: 'occupancyRate'/);
  assert.doesNotMatch(portfolioSummary, /key: 'vacantUnits'/);
  assert.doesNotMatch(portfolioSummary, /key: 'maintenanceUnits'/);
});
