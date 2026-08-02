/**
 * Single ordered column definition for contract Excel template, export, and import.
 * Keep headers stable — round-trip depends on identical order and Arabic labels.
 */

export type ContractExcelField =
  | 'contract_number'
  | 'tenant_name'
  | 'unit_number'
  | 'start_date'
  | 'end_date'
  | 'total_amount'
  | 'periodic_amount'
  | 'payment_count'
  | 'paid_through_date'
  | 'opening_paid_amount'
  | 'opening_payment_date';

export type ContractExcelColumn = {
  field: ContractExcelField;
  /** Canonical Arabic header written to template/export. */
  header: string;
  /** Extra Arabic/normalized aliases accepted on import. */
  aliases?: string[];
};

export const CONTRACT_EXCEL_COLUMNS: readonly ContractExcelColumn[] = [
  { field: 'contract_number', header: 'رقم العقد' },
  { field: 'tenant_name', header: 'اسم المستأجر' },
  { field: 'unit_number', header: 'رقم الوحدة' },
  { field: 'start_date', header: 'تاريخ بداية الإيجار' },
  { field: 'end_date', header: 'تاريخ نهاية الإيجار' },
  { field: 'total_amount', header: 'إجمالي قيمة العقد' },
  { field: 'periodic_amount', header: 'قيمة الدفعة الدورية' },
  { field: 'payment_count', header: 'عدد الدفعات' },
  { field: 'paid_through_date', header: 'آخر تاريخ مدفوع' },
  {
    field: 'opening_paid_amount',
    header: 'مبلغ مدفوع مسبقاً',
    aliases: ['مبلغ مدفوع مسبقا'],
  },
  { field: 'opening_payment_date', header: 'تاريخ آخر دفعة فعلية' },
] as const;

export const CONTRACT_EXCEL_HEADERS = CONTRACT_EXCEL_COLUMNS.map((column) => column.header);

export const CONTRACT_EXCEL_EXAMPLE_ROW: readonly string[] = [
  'CTR-001',
  'اسم المستأجر',
  '1',
  '2025-01-01',
  '2026-01-01',
  '24000',
  '12000',
  '2',
  '2025-07-01',
  '0',
  '2025-07-15',
];

/** Strip punctuation/ريال so Arabic Excel headers still match. */
export function normalizeContractExcelHeaderKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()（）\-–—]/g, '')
    .replace(/ريال/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTRACT_HEADER_LOOKUP = (() => {
  const map = new Map<string, ContractExcelField>();
  for (const column of CONTRACT_EXCEL_COLUMNS) {
    map.set(normalizeContractExcelHeaderKey(column.header), column.field);
    map.set(normalizeContractExcelHeaderKey(column.field), column.field);
    for (const alias of column.aliases ?? []) {
      map.set(normalizeContractExcelHeaderKey(alias), column.field);
    }
  }
  return map;
})();

export function resolveContractExcelHeader(raw: string): string {
  const normalized = normalizeContractExcelHeaderKey(raw);
  return CONTRACT_HEADER_LOOKUP.get(normalized) ?? normalized;
}

export const CONTRACT_EXCEL_NUMERIC_FIELDS = new Set<ContractExcelField>([
  'total_amount',
  'periodic_amount',
  'payment_count',
  'opening_paid_amount',
]);

export const CONTRACT_EXCEL_DATE_FIELDS = new Set<ContractExcelField>([
  'start_date',
  'end_date',
  'paid_through_date',
  'opening_payment_date',
]);

export const CONTRACT_EXCEL_OPENING_FIELDS = new Set<ContractExcelField>([
  'paid_through_date',
  'opening_paid_amount',
  'opening_payment_date',
]);
