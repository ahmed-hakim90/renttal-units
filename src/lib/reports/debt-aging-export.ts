import {
  type AgingBucketKey,
  type AgingRow,
  type BucketSummary,
  type UnitAgingSummary,
  type AgingBucketAmounts,
} from '@/lib/rental/aging';

type ExcelWorksheet = import('exceljs').Worksheet;

export interface DebtAgingExportLabels {
  reportTitle: string;
  asOfDate: string;
  totalOutstanding: string;
  totalInvoices: string;
  totalUnits: string;
  bucketSummarySection: string;
  unitSummarySection: string;
  detailSheetTitle: string;
  summarySheet: string;
  detailSheet: string;
  bucket: string;
  count: string;
  totalAmount: string;
  percentage: string;
  unit: string;
  location: string;
  paymentCycle: string;
  period: string;
  dueDate: string;
  daysOverdue: string;
  amount: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
  total: string;
  grandTotal: string;
  invoiceCount: string;
  subtotal: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  invoiceNumber: string;
}

function bucketLabel(labels: DebtAgingExportLabels, bucket: AgingBucketKey): string {
  return labels[bucket];
}

type Row = (string | number)[];

function blankRow(): Row {
  return [''];
}

function buildSummarySheet(
  labels: DebtAgingExportLabels,
  asOfFormatted: string,
  bucketSummary: BucketSummary[],
  unitSummary: UnitAgingSummary[],
  bucketTotals: AgingBucketAmounts,
  totalAmount: number,
  totalInvoices: number,
  totalUnits: number,
  getPaymentCycleLabel: (cycle: string | null) => string,
): Row[] {
  const rows: Row[] = [
    [labels.reportTitle],
    [labels.asOfDate, asOfFormatted],
    [labels.totalOutstanding, totalAmount],
    [labels.totalInvoices, totalInvoices],
    [labels.totalUnits, totalUnits],
    blankRow(),
    [labels.bucketSummarySection],
    [labels.bucket, labels.count, labels.totalAmount, labels.percentage],
  ];

  for (const bucket of bucketSummary) {
    rows.push([
      bucketLabel(labels, bucket.bucket),
      bucket.count,
      bucket.totalAmount,
      Math.round(bucket.percentage * 10) / 10,
    ]);
  }

  rows.push(
    [labels.grandTotal, totalInvoices, totalAmount, 100],
    blankRow(),
    [labels.unitSummarySection],
    [
      labels.unit,
      labels.location,
      labels.paymentCycle,
      labels.current,
      labels.days1to30,
      labels.days31to60,
      labels.days61to90,
      labels.over90,
      labels.total,
      labels.invoiceCount,
    ],
  );

  for (const unit of unitSummary) {
    rows.push([
      unit.unitNumber,
      unit.locationName,
      getPaymentCycleLabel(unit.paymentCycle),
      unit.buckets.current || '',
      unit.buckets.days1to30 || '',
      unit.buckets.days31to60 || '',
      unit.buckets.days61to90 || '',
      unit.buckets.over90 || '',
      unit.total,
      unit.invoiceCount,
    ]);
  }

  rows.push([
    labels.grandTotal,
    '',
    '',
    bucketTotals.current || '',
    bucketTotals.days1to30 || '',
    bucketTotals.days31to60 || '',
    bucketTotals.days61to90 || '',
    bucketTotals.over90 || '',
    totalAmount,
    totalInvoices,
  ]);

  return rows;
}

function buildDetailSheet(
  labels: DebtAgingExportLabels,
  asOfFormatted: string,
  groupedRows: { bucket: AgingBucketKey; rows: AgingRow[] }[],
  totalAmount: number,
  getLocationName: (row: AgingRow) => string,
  getPaymentCycleLabel: (cycle: string | undefined) => string,
  getStatusLabel: (status: string) => string,
): Row[] {
  const rows: Row[] = [
    [labels.detailSheetTitle],
    [labels.asOfDate, asOfFormatted],
    blankRow(),
    [
      labels.bucket,
      labels.invoiceNumber,
      labels.unit,
      labels.location,
      labels.paymentCycle,
      labels.period,
      labels.dueDate,
      labels.daysOverdue,
      labels.amount,
      labels.paidAmount,
      labels.remainingAmount,
      labels.status,
    ],
  ];

  for (const group of groupedRows) {
    const subtotal = group.rows.reduce((sum, row) => sum + row.remaining, 0);

    rows.push([
      bucketLabel(labels, group.bucket),
      `${group.rows.length} ${labels.invoiceCount}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      subtotal,
      labels.subtotal,
    ]);

    for (const row of group.rows) {
      rows.push([
        bucketLabel(labels, group.bucket),
        row.invoice.invoice_number,
        row.invoice.unit?.unit_number ?? '',
        getLocationName(row),
        getPaymentCycleLabel(row.invoice.unit?.payment_cycle),
        `${row.invoice.period_start} – ${row.invoice.period_end}`,
        row.invoice.due_date,
        row.daysOverdue,
        Number(row.invoice.amount),
        Number(row.invoice.paid_amount),
        row.remaining,
        getStatusLabel(row.invoice.status),
      ]);
    }

    rows.push(blankRow());
  }

  rows.push(['', '', '', '', '', '', '', '', labels.grandTotal, totalAmount, '']);

  return rows;
}

function setColumnWidths(sheet: ExcelWorksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function downloadWorkbook(buffer: BlobPart, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportDebtAgingExcel(input: {
  labels: DebtAgingExportLabels;
  asOfFormatted: string;
  asOfIso: string;
  bucketSummary: BucketSummary[];
  unitSummary: UnitAgingSummary[];
  bucketTotals: AgingBucketAmounts;
  groupedRows: { bucket: AgingBucketKey; rows: AgingRow[] }[];
  totalAmount: number;
  totalInvoices: number;
  totalUnits: number;
  getLocationName: (row: AgingRow) => string;
  getPaymentCycleLabel: (cycle: string | null | undefined) => string;
  getStatusLabel: (status: string) => string;
}) {
  const { default: ExcelJS } = await import('exceljs');

  const summaryRows = buildSummarySheet(
    input.labels,
    input.asOfFormatted,
    input.bucketSummary,
    input.unitSummary,
    input.bucketTotals,
    input.totalAmount,
    input.totalInvoices,
    input.totalUnits,
    (cycle) => input.getPaymentCycleLabel(cycle),
  );

  const detailRows = buildDetailSheet(
    input.labels,
    input.asOfFormatted,
    input.groupedRows,
    input.totalAmount,
    input.getLocationName,
    input.getPaymentCycleLabel,
    input.getStatusLabel,
  );

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet(input.labels.summarySheet);
  const detailSheet = workbook.addWorksheet(input.labels.detailSheet);

  summarySheet.addRows(summaryRows);
  detailSheet.addRows(detailRows);

  setColumnWidths(summarySheet, [22, 18, 14, 14, 14, 14, 14, 14, 16, 12]);
  setColumnWidths(detailSheet, [16, 22, 12, 16, 14, 24, 14, 12, 14, 14, 16, 14]);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadWorkbook(buffer, `debt-aging-${input.asOfIso}.xlsx`);
}
