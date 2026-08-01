import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addMonths, differenceInDays, format, parseISO, subDays } from 'date-fns';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Mirrors src/lib/rental/calculations.ts calculateContractPaymentSchedule for monthly. */
function calculateMonthlySchedule(totalAmount, startDate, endDate) {
  const contractStart = parseISO(startDate);
  const contractEnd = parseISO(endDate);
  const cycleMonths = 1;
  const periods = [];
  let periodStart = contractStart;

  while (periodStart <= contractEnd) {
    const naturalPeriodEnd = subDays(addMonths(periodStart, cycleMonths), 1);
    const periodEnd = naturalPeriodEnd > contractEnd ? contractEnd : naturalPeriodEnd;
    const fullDays = differenceInDays(naturalPeriodEnd, periodStart) + 1;
    const actualDays = differenceInDays(periodEnd, periodStart) + 1;
    periods.push({
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
      weight: actualDays / fullDays,
    });
    periodStart = addMonths(periodStart, cycleMonths);
  }

  const total = Number(totalAmount);
  const totalWeight = periods.reduce((sum, period) => sum + period.weight, 0);
  let assigned = 0;
  return periods.map((period, index) => {
    const isLast = index === periods.length - 1;
    const amount = isLast
      ? roundMoney(total - assigned)
      : roundMoney((total * period.weight) / totalWeight);
    assigned = roundMoney(assigned + amount);
    return { periodStart: period.periodStart, periodEnd: period.periodEnd, amount };
  });
}

test('contract create and edit forms expose monthly payment cycle', () => {
  const createForm = read('src/components/contracts/contract-create-form.tsx');
  const editor = read('src/components/contracts/contract-editor.tsx');
  const calculations = read('src/lib/rental/calculations.ts');

  assert.match(createForm, /\(\['monthly', 'quarterly', 'semi_annual', 'yearly'\]/);
  assert.match(editor, /\(\['monthly', 'quarterly', 'semi_annual', 'yearly'\]/);
  assert.match(calculations, /case 'monthly': return 1;/);
  assert.match(read('src/messages/en/common.json'), /"monthly": "Monthly"/);
  assert.match(read('src/messages/ar/common.json'), /"monthly": "شهري"/);
});

test('monthly schedule splits a full-year contract into twelve equal periods', () => {
  const schedule = calculateMonthlySchedule(12000, '2026-01-01', '2026-12-31');
  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].periodStart, '2026-01-01');
  assert.equal(schedule[0].periodEnd, '2026-01-31');
  assert.equal(schedule[11].periodStart, '2026-12-01');
  assert.equal(schedule[11].periodEnd, '2026-12-31');
  assert.equal(schedule.reduce((sum, period) => sum + period.amount, 0), 12000);
  for (const period of schedule) {
    assert.equal(period.amount, 1000);
  }
});

test('monthly schedule prorates a trailing partial month and keeps the contract total', () => {
  const schedule = calculateMonthlySchedule(1500, '2026-01-01', '2026-02-15');
  assert.equal(schedule.length, 2);
  assert.equal(schedule[0].periodEnd, '2026-01-31');
  assert.equal(schedule[1].periodEnd, '2026-02-15');
  assert.equal(
    Number(schedule.reduce((sum, period) => sum + period.amount, 0).toFixed(2)),
    1500,
  );
  assert.ok(schedule[0].amount > schedule[1].amount);
});
