import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const sourceUrl = new URL(`${specifier.slice(2)}.ts`, sourceRoot);
    return nextResolve(pathToFileURL(sourceUrl.pathname).href, context);
  },
});

const {
  calculateContractBillingSchedule,
  calculateContractPaymentSchedule,
} = await import('../src/lib/rental/calculations.ts');

const increaseAfterFiveYears = [{
  condition_type: 'percentage_increase_after',
  enabled: true,
  applies_after_months: 60,
  percentage: 10,
  target: 'rental',
}];

test('raises the second five years by 10% and preserves the contract total', () => {
  const schedule = calculateContractPaymentSchedule({
    start_date: '2026-01-01',
    end_date: '2035-12-31',
    payment_cycle: 'semi_annual',
    total_amount: 210_000,
  }, increaseAfterFiveYears);

  assert.equal(schedule.length, 20);
  assert.deepEqual(schedule.slice(0, 10).map((period) => period.amount), Array(10).fill(10_000));
  assert.deepEqual(schedule.slice(10).map((period) => period.amount), Array(10).fill(11_000));
  assert.equal(schedule.reduce((sum, period) => sum + period.amount, 0), 210_000);
});

test('disabled conditions leave installments evenly allocated', () => {
  const schedule = calculateContractPaymentSchedule({
    start_date: '2026-01-01',
    end_date: '2035-12-31',
    payment_cycle: 'semi_annual',
    total_amount: 210_000,
  }, [{ ...increaseAfterFiveYears[0], enabled: false }]);

  assert.deepEqual(schedule.map((period) => period.amount), Array(20).fill(10_500));
});

test('rental conditions do not increase service lines', () => {
  const schedule = calculateContractBillingSchedule({
    start_date: '2026-01-01',
    end_date: '2035-12-31',
    payment_cycle: 'semi_annual',
    payment_conditions: increaseAfterFiveYears,
    lines: [
      {
        lineType: 'rental',
        amount: 210_000,
        taxRate: 0,
      },
      {
        lineType: 'service',
        amount: 20_000,
        taxRate: 0,
      },
    ],
  });

  assert.equal(schedule[0].lineItems[0].amountTotal, 10_000);
  assert.equal(schedule[10].lineItems[0].amountTotal, 11_000);
  assert.equal(schedule[0].lineItems[1].amountTotal, 1_000);
  assert.equal(schedule[10].lineItems[1].amountTotal, 1_000);
});

test('matches a mixed-tax six-year contract with a rent increase after two years', () => {
  const schedule = calculateContractBillingSchedule({
    start_date: '2026-01-21',
    end_date: '2032-01-20',
    payment_cycle: 'semi_annual',
    payment_conditions: [{
      condition_type: 'percentage_increase_after',
      enabled: true,
      applies_after_months: 24,
      percentage: 17.65,
      target: 'rental',
    }],
    lines: [
      {
        lineType: 'rental',
        amount: 2_936_691.52,
        taxRate: 15,
        taxTreatment: 'standard',
      },
      {
        lineType: 'service',
        amount: 255_360,
        taxRate: 0,
        taxTreatment: 'standard',
      },
    ],
  });

  assert.equal(schedule.length, 12);
  assert.deepEqual(schedule.slice(0, 4).map((period) => period.amountTotal), Array(4).fill(240_240));
  assert.equal(schedule[4].amountTotal, 278_886.44);
  assert.ok(schedule.every((period) => period.lineItems[1].amountTotal === 21_280));
  assert.equal(
    schedule.reduce((sum, period) => Math.round((sum + period.amountTotal) * 100) / 100, 0),
    3_192_051.52,
  );
});
