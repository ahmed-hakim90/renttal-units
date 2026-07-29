import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Pure helpers mirrored from import grouping / form totals for regression coverage
 * without requiring a live database.
 */

function groupOdooLinesIntoContracts(input) {
  const documentContractNumber = input.lines
    .map((line) => line.suggestedContractNumber)
    .find((value) => Boolean(value)) ?? null;
  const groups = new Map();
  let sortOrder = 0;
  for (const line of input.lines) {
    const contractNumber = line.suggestedContractNumber
      ?? (line.mappingStatus === 'service' ? documentContractNumber : null);
    if (!contractNumber) continue;
    if (line.isRental && (!line.unitId || !line.periodStart || !line.periodEnd)) continue;
    if (!line.isRental && line.mappingStatus !== 'service') continue;
    const key = `${contractNumber}:${input.tenantId}`;
    const group = groups.get(key) ?? {
      contractNumber,
      primaryUnitId: '',
      tenantId: input.tenantId,
      lineIds: [],
      totalAmount: 0,
      lines: [],
    };
    if (line.isRental && line.unitId && !group.primaryUnitId) group.primaryUnitId = line.unitId;
    group.lineIds.push(line.odooLineId);
    group.totalAmount += line.amountUntaxed;
    group.lines.push({
      lineType: line.isRental ? 'rental' : 'service',
      unitId: line.isRental ? line.unitId : null,
      amount: line.amountUntaxed,
      odooLineId: line.odooLineId,
      sortOrder: sortOrder++,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function sumLineAmounts(lines) {
  return lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

test('two rental units + service fee become one contract group', () => {
  const groups = groupOdooLinesIntoContracts({
    tenantId: 'tenant-1',
    lines: [
      {
        odooLineId: 1,
        isRental: true,
        mappingStatus: 'matched',
        unitId: 'unit-a',
        periodStart: '2026-06-27',
        periodEnd: '2026-09-26',
        suggestedContractNumber: 'CTR-MIL-001',
        amountUntaxed: 100000,
        description: 'Showroom 05',
        productName: '10162',
      },
      {
        odooLineId: 2,
        isRental: true,
        mappingStatus: 'matched',
        unitId: 'unit-b',
        periodStart: '2026-06-27',
        periodEnd: '2026-09-26',
        suggestedContractNumber: 'CTR-MIL-001',
        amountUntaxed: 110000,
        description: 'Showroom 06',
        productName: '10163',
      },
      {
        odooLineId: 3,
        isRental: false,
        mappingStatus: 'service',
        unitId: null,
        periodStart: null,
        periodEnd: null,
        suggestedContractNumber: 'CTR-MIL-001',
        amountUntaxed: 20000,
        description: 'General Service Fees',
        productName: '10171',
      },
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].lines.length, 3);
  assert.equal(groups[0].totalAmount, 230000);
  assert.equal(groups[0].primaryUnitId, 'unit-a');
  assert.deepEqual(groups[0].lineIds, [1, 2, 3]);
  assert.equal(groups[0].lines.filter((line) => line.lineType === 'service').length, 1);
});

test('service fee without its own number inherits document contract number', () => {
  const groups = groupOdooLinesIntoContracts({
    tenantId: 'tenant-1',
    lines: [
      {
        odooLineId: 10,
        isRental: true,
        mappingStatus: 'matched',
        unitId: 'unit-a',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        suggestedContractNumber: 'LEASE-9',
        amountUntaxed: 50,
        description: null,
        productName: null,
      },
      {
        odooLineId: 11,
        isRental: false,
        mappingStatus: 'service',
        unitId: null,
        periodStart: null,
        periodEnd: null,
        suggestedContractNumber: null,
        amountUntaxed: 5,
        description: 'رسوم خدمات',
        productName: null,
      },
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[0].totalAmount, 55);
});

test('different contract numbers stay separate', () => {
  const groups = groupOdooLinesIntoContracts({
    tenantId: 'tenant-1',
    lines: [
      {
        odooLineId: 1,
        isRental: true,
        mappingStatus: 'matched',
        unitId: 'unit-a',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        suggestedContractNumber: 'A',
        amountUntaxed: 10,
        description: null,
        productName: null,
      },
      {
        odooLineId: 2,
        isRental: true,
        mappingStatus: 'matched',
        unitId: 'unit-b',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        suggestedContractNumber: 'B',
        amountUntaxed: 20,
        description: null,
        productName: null,
      },
    ],
  });
  assert.equal(groups.length, 2);
});

test('contract total is sum of rental and service line amounts', () => {
  assert.equal(sumLineAmounts([
    { amount: 100 },
    { amount: 200 },
    { amount: 30 },
  ]), 330);
});
