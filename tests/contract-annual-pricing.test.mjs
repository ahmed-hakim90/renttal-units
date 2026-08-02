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
  deriveContractLineInclusiveAmounts,
} = await import('../src/lib/rental/calculations.ts');

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

test('matches Rasd quarterly Ejar contract from annual pre-tax amounts', () => {
  const schedule = calculateContractBillingSchedule({
    start_date: '2024-07-15',
    end_date: '2027-07-14',
    payment_cycle: 'quarterly',
    lines: [
      {
        lineType: 'rental',
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 56_000,
        taxRate: 15,
        taxTreatment: 'standard',
      },
      {
        lineType: 'service',
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 7_015,
        taxRate: 0,
        taxTreatment: 'standard',
      },
    ],
  });

  assert.equal(schedule.length, 12);
  // Exact 2-decimal money: 7015/4 = 1753.75 (Ejar PDF may display whole-riyal 1754/1751).
  assert.deepEqual(
    schedule.map((period) => period.amountTotal),
    Array(12).fill(17_853.75),
  );
  assert.deepEqual(
    schedule.map((period) => period.lineItems[0].amountUntaxed),
    Array(12).fill(14_000),
  );
  assert.deepEqual(
    schedule.map((period) => period.lineItems[0].amountTax),
    Array(12).fill(2_100),
  );
  assert.deepEqual(
    schedule.map((period) => period.lineItems[1].amountTotal),
    Array(12).fill(1_753.75),
  );
  assert.equal(
    roundMoney(schedule.reduce((sum, period) => sum + period.amountTotal, 0)),
    214_245,
  );

  const derived = deriveContractLineInclusiveAmounts({
    start_date: '2024-07-15',
    end_date: '2027-07-14',
    payment_cycle: 'quarterly',
    lines: [
      {
        lineType: 'rental',
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 56_000,
        taxRate: 15,
      },
      {
        lineType: 'service',
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 7_015,
        taxRate: 0,
      },
    ],
  });
  assert.equal(derived.totalAmount, 214_245);
  assert.equal(derived.lines[0].amount, 193_200);
  assert.equal(derived.lines[1].amount, 21_045);
});

test('matches Farsan Najd semi-annual Ejar contract with rent increase from annual amounts', () => {
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
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 380_800,
        taxRate: 15,
        taxTreatment: 'standard',
      },
      {
        lineType: 'service',
        amount: 0,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 42_560,
        taxRate: 0,
        taxTreatment: 'standard',
      },
    ],
  });

  assert.equal(schedule.length, 12);
  assert.deepEqual(
    schedule.slice(0, 4).map((period) => period.amountTotal),
    Array(4).fill(240_240),
  );
  assert.equal(schedule[4].amountTotal, 278_886.44);
  assert.ok(schedule.every((period) => period.lineItems[1].amountTotal === 21_280));
  assert.equal(
    roundMoney(schedule.reduce((sum, period) => sum + period.amountTotal, 0)),
    3_192_051.52,
  );

  const derived = deriveContractLineInclusiveAmounts({
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
        amount: 999_999,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 380_800,
        taxRate: 15,
      },
      {
        lineType: 'service',
        amount: 1,
        amountBasis: 'annual_untaxed',
        annualAmountUntaxed: 42_560,
        taxRate: 0,
      },
    ],
  });

  // Client-spoofed inclusive amounts must be overwritten by derived totals.
  assert.equal(derived.lines[0].amount, 2_936_691.52);
  assert.equal(derived.lines[1].amount, 255_360);
  assert.equal(derived.totalAmount, 3_192_051.52);
});

test('puts annual rounding remainder on the last installment', () => {
  const schedule = calculateContractBillingSchedule({
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    payment_cycle: 'quarterly',
    lines: [{
      lineType: 'rental',
      amount: 0,
      amountBasis: 'annual_untaxed',
      annualAmountUntaxed: 1000.01,
      taxRate: 0,
    }],
  });

  assert.equal(schedule.length, 4);
  assert.deepEqual(
    schedule.slice(0, 3).map((period) => period.amountTotal),
    [250, 250, 250],
  );
  assert.equal(schedule[3].amountTotal, 250.01);
  assert.equal(
    roundMoney(schedule.reduce((sum, period) => sum + period.amountTotal, 0)),
    1000.01,
  );
});

test('legacy inclusive totals still allocate with increase weights', () => {
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
        amountBasis: 'contract_total_inclusive',
        taxRate: 15,
      },
      {
        lineType: 'service',
        amount: 255_360,
        amountBasis: 'contract_total_inclusive',
        taxRate: 0,
      },
    ],
  });

  assert.equal(schedule.length, 12);
  assert.deepEqual(schedule.slice(0, 4).map((period) => period.amountTotal), Array(4).fill(240_240));
  assert.equal(
    roundMoney(schedule.reduce((sum, period) => sum + period.amountTotal, 0)),
    3_192_051.52,
  );
});
