import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sourceRoot = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const sourceUrl = new URL(`${specifier.slice(2)}.ts`, sourceRoot);
    return nextResolve(pathToFileURL(sourceUrl.pathname).href, context);
  },
});

const {
  CONTRACT_EXCEL_COLUMNS,
  CONTRACT_EXCEL_EXAMPLE_ROW,
  CONTRACT_EXCEL_HEADERS,
  resolveContractExcelHeader,
} = await import('../src/lib/import/contract-excel-columns.ts');
const {
  buildContractsExcelRows,
  contractToExcelRow,
  inferPaymentCycleFromAmounts,
} = await import('../src/lib/import/contract-excel-export.ts');
const {
  openingBalanceImportBlockedReason,
} = await import('../src/lib/rental/contract-opening-balance.ts');

test('template, export, and import share the same ordered Arabic headers', () => {
  assert.equal(CONTRACT_EXCEL_HEADERS.length, 11);
  assert.equal(CONTRACT_EXCEL_EXAMPLE_ROW.length, CONTRACT_EXCEL_HEADERS.length);
  assert.deepEqual(
    CONTRACT_EXCEL_COLUMNS.map((column) => column.header),
    CONTRACT_EXCEL_HEADERS,
  );
  assert.equal(CONTRACT_EXCEL_HEADERS[0], 'رقم العقد');
  assert.equal(CONTRACT_EXCEL_HEADERS[3], 'تاريخ بداية الإيجار');
  assert.equal(CONTRACT_EXCEL_HEADERS[8], 'آخر تاريخ مدفوع');
  assert.equal(CONTRACT_EXCEL_HEADERS.at(-1), 'تاريخ آخر دفعة فعلية');
  assert.ok(!CONTRACT_EXCEL_HEADERS.includes('تاريخ الإبرام'));
});

test('resolves Arabic aliases including ريال and opening-paid variants', () => {
  assert.equal(resolveContractExcelHeader('إجمالي قيمة العقد (ريال)'), 'total_amount');
  assert.equal(resolveContractExcelHeader('مبلغ مدفوع مسبقا'), 'opening_paid_amount');
  assert.equal(resolveContractExcelHeader('opening_payment_date'), 'opening_payment_date');
});

test('export rows keep header order and opening-balance fields', () => {
  const contract = {
    contract_number: 'C-1',
    tenant: { full_name: 'Tenant' },
    unit: { unit_number: '10' },
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    total_amount: 24000,
    payment_cycle: 'semi_annual',
    paid_through_date: '2025-06-30',
    opening_paid_amount: 100,
    opening_payment_date: '2025-07-01',
    invoices: [
      {
        period_start: '2025-01-01',
        period_end: '2025-06-30',
        amount: 12000,
        amount_total: 12000,
      },
      {
        period_start: '2025-07-01',
        period_end: '2025-12-31',
        amount: 12000,
        amount_total: 12000,
      },
    ],
  };

  const row = contractToExcelRow(contract);
  assert.equal(row.length, CONTRACT_EXCEL_HEADERS.length);
  assert.equal(row[0], 'C-1');
  assert.equal(row[2], '10');
  assert.equal(row[7], 2);
  assert.equal(row[8], '2025-06-30');
  assert.equal(row[9], 100);
  assert.equal(row[10], '2025-07-01');

  const built = buildContractsExcelRows([contract]);
  assert.deepEqual(built.headers, [...CONTRACT_EXCEL_HEADERS]);
  assert.equal(built.rows.length, 1);
});

test('infers payment cycle from total and periodic amounts', () => {
  assert.equal(inferPaymentCycleFromAmounts(24000, 12000), 'semi_annual');
  assert.equal(inferPaymentCycleFromAmounts(24000, 6000), 'quarterly');
  assert.equal(inferPaymentCycleFromAmounts(24000, 24000), 'yearly');
});

test('blocks opening-balance import when Odoo links or local payments exist', () => {
  assert.equal(
    openingBalanceImportBlockedReason([{ id: 'inv-1', odoo_invoice_id: 99 }], new Map()),
    'odooLinkedInvoices',
  );
  assert.equal(
    openingBalanceImportBlockedReason(
      [{ id: 'inv-1', odoo_invoice_id: null }],
      new Map([['inv-1', 1]]),
    ),
    'localPaymentsExist',
  );
  assert.equal(
    openingBalanceImportBlockedReason([{ id: 'inv-1', odoo_invoice_id: null }], new Map()),
    null,
  );
});

test('import client and admin action use shared columns and upsert actions', async () => {
  const [client, admin] = await Promise.all([
    readFile(new URL('../src/components/import/import-contracts-client.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/actions/admin.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(client, /CONTRACT_EXCEL_HEADERS/);
  assert.match(client, /exportContractsExcel/);
  assert.match(client, /importActionUpdate/);
  assert.match(admin, /exportContractsExcel/);
  assert.match(admin, /applyOpeningBalanceFromImport/);
  assert.match(admin, /action === 'update'/);
  assert.match(admin, /resolveContractExcelHeader/);
  assert.doesNotMatch(admin, /CONTRACT_HEADER_MAP/);
});
